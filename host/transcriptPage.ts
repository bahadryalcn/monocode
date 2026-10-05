import type { HostSession } from "../src/features/connections/model/protocol";
import { snapshotWeight } from "../src/features/connections/model/snapshotWeight";
export class TranscriptPages {
  private snapshots = new Map<string, { value: HostSession; expires: number; bytes: number }>();
  page(read: () => HostSession, id: string, before?: number, revision?: number) {
    const key = `${id}:${revision}`;
    const captured = revision === undefined ? undefined : this.snapshots.get(key);
    const value = captured && captured.expires > Date.now() ? captured.value : read();
    const page = transcriptPage(value, before, revision);
    const captureKey = `${id}:${value.revision}`;
    this.snapshots.delete(captureKey);
    this.snapshots.set(captureKey, { value, expires: Date.now() + 120_000, bytes: snapshotWeight(value) });
    let bytes = [...this.snapshots.values()].reduce((sum, entry) => sum + entry.bytes, 0);
    for (const [entryKey, entry] of this.snapshots) {
      if (entry.expires < Date.now() || this.snapshots.size > 8 || bytes > 128 * 1024 * 1024) {
        this.snapshots.delete(entryKey); bytes -= entry.bytes;
      }
    }
    return page;
  }
}
export function transcriptPage(value: HostSession, before?: number, revision?: number) {
  if (revision !== undefined && revision !== value.revision) throw new Error("Transcript changed; reload history");
  const end = before ?? value.session.blocks.length;
  if (!Number.isSafeInteger(end) || end < 0 || end > value.session.blocks.length)
    throw new Error("Invalid transcript cursor");
  let start = end;
  let bytes = 0;
  while (start > 0 && end - start < 100) {
    const size = Buffer.byteLength(JSON.stringify(value.session.blocks[start - 1]));
    if (bytes + size > 1024 * 1024 && start < end) break;
    bytes += size;
    start--;
  }
  const { blockRevisions: _revisions, ...metadata } = value;
  return { value: { ...metadata, session: { ...value.session, blocks: value.session.blocks.slice(start, end) } },
    before: start > 0 ? start : undefined, totalBlocks: value.session.blocks.length, revision: value.revision };
}
