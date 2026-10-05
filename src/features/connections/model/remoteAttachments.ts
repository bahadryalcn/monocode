import { invoke } from "@tauri-apps/api/core";
import type { Attachment } from "../../sessions/model/session";
import type { RemoteAttachment } from "./protocol";
import { remoteRequest } from "./connections";

const MAX_BYTES = 20 * 1024 * 1024;
// Keep each request well below the host's 4 MiB JSON limit.
const CHUNK_CHARS = 4 * Math.floor((512 * 1024) / 3);
// Keep bytes in-flight bounded, and preserve ordered offsets within each file.
const UPLOAD_CONCURRENCY = 2;
const acknowledged = new Map<string, { size: number; offset: number }>();

export async function uploadRemoteAttachments(
  machineId: string,
  attachments: Attachment[],
  options: { resumable?: boolean; onProgress?: (id: string, offset: number, size: number) => void } = {},
): Promise<RemoteAttachment[]> {
  if (attachments.length > 20) throw new Error("Too many attachments");
  const uploaded: RemoteAttachment[] = new Array(attachments.length);
  let next = 0;
  const worker = async () => {
  while (next < attachments.length) {
    const indexInBatch = next++;
    const file = attachments[indexInBatch]!;
    if (file.size > MAX_BYTES)
      throw new Error(
        `${file.name} is too large to send to a remote machine (20 MB maximum)`,
      );
    const data =
      file.data ??
      (file.path
        ? await invoke<string>("read_file_base64", { path: file.path })
        : undefined);
    if (data === undefined)
      throw new Error(`Cannot read ${file.name} for remote upload`);
    const key = `${machineId}:${file.id}`;
    const prior = acknowledged.get(key);
    let offset = prior?.size === file.size ? prior.offset : 0;
    if (options.resumable) {
      const status = await remoteRequest<{ offset: number; hash?: string }>(machineId, "attachments.status", { id: file.id, size: file.size });
      if (!Number.isSafeInteger(status.offset) || status.offset < 0 || status.offset > file.size)
        throw new Error("Invalid upload status");
      if (status.offset > 0) {
        const prefix = Uint8Array.from(atob(data.slice(0, 4 * Math.ceil(status.offset / 3))), (char) => char.charCodeAt(0)).subarray(0, status.offset);
        const digest = await crypto.subtle.digest("SHA-256", prefix);
        const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
        if (hash !== status.hash) throw new Error("Attachment retry does not match uploaded bytes");
      }
      offset = status.offset;
    }
    // Only acknowledged chunks are skipped. An uncertain chunk is retried at
    // its original offset and the host verifies byte equality before accepting.
    if (offset > 0 && offset < file.size && offset % 3 !== 0) offset = 0;
    if (data.length === 0) {
      await remoteRequest(machineId, "attachments.upload", {
        id: file.id,
        offset: 0,
        size: file.size,
        data: "",
      });
    }
    for (let index = 4 * Math.floor(offset / 3); offset < file.size && index < data.length; index += CHUNK_CHARS) {
      const chunk = data.slice(index, index + CHUNK_CHARS);
      const reply = await remoteRequest<{ offset: number }>(
        machineId,
        "attachments.upload",
        {
          id: file.id,
          offset,
          size: file.size,
          data: chunk,
        },
      );
      const expected = offset + atob(chunk).length;
      if (reply.offset !== expected || reply.offset > file.size)
        throw new Error("Invalid upload acknowledgement");
      offset = reply.offset;
      options.onProgress?.(file.id, offset, file.size);
      acknowledged.set(key, { size: file.size, offset });
      if (acknowledged.size > 256) acknowledged.delete(acknowledged.keys().next().value!);
    }
    if (offset !== file.size)
      throw new Error(`Could not finish uploading ${file.name}`);
    uploaded[indexInBatch] = {
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      kind: file.kind,
      size: file.size,
    };
  }
  };
  const workers = await Promise.allSettled(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, attachments.length) }, worker));
  const failed = workers.find((result) => result.status === "rejected");
  if (failed?.status === "rejected") throw failed.reason;
  return uploaded;
}
