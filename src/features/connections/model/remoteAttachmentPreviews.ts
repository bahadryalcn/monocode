import type { HostSession } from "./protocol";
import type { Attachment } from "../../sessions/model/session";

type Chunk = { data: string; offset: number; size: number };
type PreviewRead = (params: {
  sessionId: string;
  id: string;
  offset: number;
}) => Promise<Chunk>;
const downloads = new Map<string, Promise<string>>();
export const PREVIEW_BUDGET_BYTES = 40 * 1024 * 1024;
const MAX_PREVIEWS = 32;
const failures = new Map<string, { count: number; retryAt: number }>();
let activeDownloads = 0;
const waiting: Array<() => void> = [];

async function limitedDownload(run: () => Promise<string>): Promise<string> {
  if (activeDownloads >= 2)
    await new Promise<void>((resolve) => waiting.push(resolve));
  else activeDownloads++;
  try {
    return await run();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else activeDownloads--;
  }
}

function downloadKey(
  machine: string,
  session: string,
  file: { id: string; size: number; path?: string },
): string {
  return JSON.stringify([machine, session, file.id, file.size, file.path]);
}

function canPreview(file: Attachment): boolean {
  return (
    file.kind === "image" &&
    Number.isSafeInteger(file.size) &&
    file.size >= 0 &&
    file.size <= 25 * 1024 * 1024
  );
}

async function downloadPreview(
  machineId: string,
  sessionId: string,
  file: Attachment,
  read: PreviewRead,
  manual = false,
): Promise<string> {
  const key = downloadKey(machineId, sessionId, file);
  if (!manual && (failures.get(key)?.retryAt ?? 0) > Date.now())
    throw new Error("Preview retry is waiting");
  let download = downloads.get(key);
  if (!download) {
    download = limitedDownload(async () => {
      const pieces: string[] = [];
      let offset = 0;
      while (offset < file.size) {
        const chunk = await read({ sessionId, id: file.id, offset });
        if (
          chunk.size !== file.size ||
          chunk.offset <= offset ||
          chunk.offset > file.size ||
          atob(chunk.data).length !== chunk.offset - offset ||
          (chunk.offset < file.size && (chunk.offset - offset) % 3 !== 0)
        )
          throw new Error("Invalid image transfer");
        pieces.push(chunk.data);
        offset = chunk.offset;
      }
      failures.delete(key);
      return pieces.join("");
    })
      .catch((error: unknown) => {
        const count = Math.min(5, (failures.get(key)?.count ?? 0) + 1);
        failures.delete(key);
        failures.set(key, {
          count,
          retryAt: Date.now() + Math.min(300_000, 30_000 * 2 ** (count - 1)),
        });
        if (failures.size > 256) failures.delete(failures.keys().next().value!);
        throw error;
      })
      .finally(() => downloads.delete(key));
    downloads.set(key, download);
  }
  return download;
}

/** Preview bytes live only in desktop snapshots, not in every host database
 * write. Unchanged attachments reuse their previous data across delta syncs. */
async function attachmentPreviews(
  machineId: string,
  snapshot: HostSession,
  known: HostSession | undefined,
  read: PreviewRead,
): Promise<HostSession> {
  const sessionId = snapshot.session.id;
  const previous = new Map(
    (known?.session.id === snapshot.session.id ? known.session.blocks : [])
      .flatMap((block) => block.attachments ?? [])
      .map((file) => [file.id, file]),
  );
  // Favor the newest images. A long conversation must not download its whole
  // image history or retain an unlimited amount of base64 on every sync.
  const selected = new Set<string>();
  let bytes = 0;
  for (const block of [...snapshot.session.blocks].reverse()) {
    for (const file of [...(block.attachments ?? [])].reverse()) {
      if (!canPreview(file) || file.previewUrl) continue;
      if (selected.has(file.id)) continue;
      if (
        selected.size >= MAX_PREVIEWS ||
        bytes + file.size > PREVIEW_BUDGET_BYTES
      )
        continue;
      selected.add(file.id);
      bytes += file.size;
    }
  }
  let changed = false;
  const blocks = await Promise.all(
    snapshot.session.blocks.map(async (block) => {
      if (!block.attachments?.length) return block;
      const attachments = await Promise.all(
        block.attachments.map(async (file) => {
          if (
            file.kind === "image" &&
            !file.previewUrl &&
            !selected.has(file.id)
          ) {
            if (!canPreview(file)) return file;
            if (!file.data && file.loadPreview) return file;
            const { data: _data, loadPreview: _load, ...metadata } = file;
            return {
              ...metadata,
              loadPreview: () =>
                downloadPreview(machineId, sessionId, metadata, read, true),
            };
          }
          if (
            file.kind !== "image" ||
            file.data ||
            file.previewUrl ||
            !canPreview(file)
          )
            return file;
          try {
            const prior = previous.get(file.id);
            let data =
              prior?.size === file.size && prior.path === file.path
                ? prior.data
                : undefined;
            if (data === undefined) {
              data = await downloadPreview(machineId, sessionId, file, read);
            }
            return { ...file, data };
          } catch {
            // Missing images must not hide the conversation or mark its host offline.
            if (file.loadPreview) return file;
            return {
              ...file,
              loadPreview: () =>
                downloadPreview(machineId, sessionId, file, read, true),
            };
          }
        }),
      );
      if (
        attachments.every((file, index) => file === block.attachments![index])
      )
        return block;
      changed = true;
      return { ...block, attachments };
    }),
  );
  return changed
    ? { ...snapshot, session: { ...snapshot.session, blocks } }
    : snapshot;
}

/** Generated images use the same bounded, authorized chunk reader as uploads. */
export async function withRemoteAttachmentPreviews(
  machineId: string,
  snapshot: HostSession,
  known: HostSession | undefined,
  read: PreviewRead,
): Promise<HostSession> {
  const normalize = (value: HostSession): HostSession => ({
    ...value,
    session: {
      ...value.session,
      blocks: value.session.blocks.map((block) =>
        block.image
          ? {
              ...block,
              attachments: [
                ...(block.attachments ?? []),
                { ...block.image, id: block.id, kind: "image" as const },
              ],
            }
          : block,
      ),
    },
  });
  if (!snapshot.session.blocks.some((block) => block.image))
    return attachmentPreviews(machineId, snapshot, known, read);
  const result = await attachmentPreviews(
    machineId,
    normalize(snapshot),
    known && normalize(known),
    read,
  );
  return {
    ...result,
    session: {
      ...result.session,
      blocks: result.session.blocks.map((block) => {
        if (!block.image) return block;
        const files = block.attachments ?? [];
        const preview = files[files.length - 1]!;
        return {
          ...block,
          attachments: files.slice(0, -1),
          image: {
            ...block.image,
            data: preview.data,
            loadPreview: preview.loadPreview,
          },
        };
      }),
    },
  };
}
