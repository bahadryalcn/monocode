import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, readdir, realpath, rename, stat, unlink } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import type { HtmlArtifact, HtmlArtifactSummary } from "../src/features/artifacts/types";

export const MAX_HTML_ARTIFACT_BYTES = 512 * 1024;
const MAX_SESSION_ARTIFACTS = 100;
const ID = /^[a-zA-Z0-9_-]{1,128}$/;
export function artifactKey(value: string): string {
  if (!ID.test(value)) throw new Error("Invalid artifact or session identifier");
  return value;
}

/** Host-owned files, atomic publication, immutable IDs. Callers authorize the session first. */
export class HtmlArtifactStore {
  private locks = new Map<string, Promise<unknown>>();
  constructor(private readonly directory: string) {}
  async publish(input: { sessionId: string; messageId?: string; title: string; html: string; requestId?: string }): Promise<HtmlArtifactSummary> {
    artifactKey(input.sessionId);
    if (typeof input.html !== "string" || !input.html.trim()) throw new Error("HTML is empty");
    const bytes = Buffer.byteLength(input.html);
    if (bytes > MAX_HTML_ARTIFACT_BYTES) throw new Error("HTML exceeds 512 KiB");
    if (typeof input.title !== "string" || !input.title.trim() || input.title.length > 200) throw new Error("Invalid artifact title");
    if (input.messageId !== undefined) artifactKey(input.messageId);
    if (input.requestId !== undefined) artifactKey(input.requestId);
    const previous = this.locks.get(input.sessionId) ?? Promise.resolve();
    const operation = previous.catch(() => {}).then(async () => {
      const dir = join(this.directory, artifactKey(input.sessionId));
      await mkdir(dir, { recursive: true, mode: 0o700 });
      const id = input.requestId ? createHash("sha256").update(JSON.stringify([input.sessionId, input.requestId])).digest("hex") : randomUUID();
      if (input.requestId) {
        try {
          const existing = await this.read(input.sessionId, id);
          if (existing.title !== input.title.trim() || existing.html !== input.html || existing.messageId !== input.messageId) throw new Error("Publication request ID was already used for different content");
          const { html: _html, ...summary } = existing;
          return summary;
        } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      }
      if ((await this.list(input.sessionId)).length >= MAX_SESSION_ARTIFACTS) throw new Error("Session artifact limit reached (100)");
      const artifact: HtmlArtifact = { id, sessionId: input.sessionId, messageId: input.messageId, title: input.title.trim(), html: input.html, bytes, createdAt: new Date().toISOString() };
      const temp = join(dir, `.${artifact.id}.tmp`);
      const handle = await open(temp, "wx", 0o600);
      try { await handle.writeFile(JSON.stringify(artifact), "utf8"); await handle.sync(); } finally { await handle.close(); }
      try { await rename(temp, join(dir, `${artifact.id}.json`)); } catch (error) { await unlink(temp).catch(() => {}); throw error; }
      const { html: _html, ...summary } = artifact;
      return summary;
    });
    this.locks.set(input.sessionId, operation);
    try { return await operation; } finally { if (this.locks.get(input.sessionId) === operation) this.locks.delete(input.sessionId); }
  }
  async publishFile(input: { sessionId: string; messageId?: string; title: string; path: string; requestId?: string }, workspaceRoot: string) {
    const root = await realpath(workspaceRoot);
    const path = await realpath(resolve(root, input.path));
    const inside = relative(root, path);
    if (!inside || isAbsolute(inside) || inside === ".." || inside.startsWith(`..${sep}`)) throw new Error("Artifact file must be inside the session workspace");
    const info = await stat(path);
    if (!info.isFile() || info.size > MAX_HTML_ARTIFACT_BYTES) throw new Error("Invalid or oversized HTML file");
    return this.publish({ ...input, html: await readFile(path, "utf8") });
  }
  async read(sessionId: string, id: string): Promise<HtmlArtifact> {
    const path = join(this.directory, artifactKey(sessionId), `${artifactKey(id)}.json`);
    if ((await stat(path)).size > MAX_HTML_ARTIFACT_BYTES * 7) throw new Error("Invalid artifact file size");
    const value = JSON.parse(await readFile(path, "utf8")) as HtmlArtifact;
    if (value.sessionId !== sessionId || value.id !== id || typeof value.html !== "string" || Buffer.byteLength(value.html) > MAX_HTML_ARTIFACT_BYTES) throw new Error("Invalid stored artifact");
    return value;
  }
  async list(sessionId: string): Promise<HtmlArtifactSummary[]> {
    const dir = join(this.directory, artifactKey(sessionId));
    let files: string[];
    try { files = await readdir(dir); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
    const result: HtmlArtifactSummary[] = [];
    for (const name of files.filter((file) => file.endsWith(".json")).slice(0, MAX_SESSION_ARTIFACTS)) {
      const { html: _html, ...summary } = await this.read(sessionId, name.slice(0, -5));
      result.push(summary);
    }
    return result.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
}
