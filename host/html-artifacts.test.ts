import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { HtmlArtifactStore, MAX_HTML_ARTIFACT_BYTES } from "./html-artifacts";
const directories: string[] = [];
async function directory() { const value = await mkdtemp(join(tmpdir(), "imece-artifacts-")); directories.push(value); return value; }
afterEach(async () => { for (const dir of directories.splice(0)) await rm(dir, { recursive: true, force: true }); });
describe("HTML artifacts", () => {
  it("deduplicates a publication retry and rejects changed content under the same request ID", async () => {
    const store = new HtmlArtifactStore(await directory());
    const input = { sessionId: "session", requestId: "publish-1", title: "Chart", html: "<p>first</p>" };
    const [first, retry] = await Promise.all([store.publish(input), store.publish(input)]);
    expect(retry.id).toBe(first.id); expect((await store.list("session")).length).toBe(1);
    await expect(store.publish({ ...input, html: "<p>changed</p>" })).rejects.toThrow("different content");
  });
  it("persists immutable visuals across stores and isolates sessions", async () => {
    const dir = await directory(); const store = new HtmlArtifactStore(dir);
    const saved = await store.publish({ sessionId: "session-a", title: "Chart", html: "<script>chart()</script>" });
    expect((await new HtmlArtifactStore(dir).read("session-a", saved.id)).html).toBe("<script>chart()</script>");
    expect(await store.list("session-b")).toEqual([]);
    await expect(store.read("session-b", saved.id)).rejects.toThrow();
    expect(await readFile(join(dir, "session-a", `${saved.id}.json`), "utf8")).toContain("Chart");
  });
  it("rejects traversal and oversized HTML before writing", async () => {
    const store = new HtmlArtifactStore(await directory());
    await expect(store.publish({ sessionId: "../other", title: "Chart", html: "ok" })).rejects.toThrow("identifier");
    await expect(store.publish({ sessionId: "session", title: "Chart", html: "ö".repeat(MAX_HTML_ARTIFACT_BYTES) })).rejects.toThrow("512 KiB");
  });
  it("confines published source files to the real workspace", async () => {
    const dir = await directory(); const workspace = join(dir, "project"); await mkdir(workspace);
    await writeFile(join(dir, "secret.html"), "outside"); await writeFile(join(workspace, "chart.html"), "inside");
    const store = new HtmlArtifactStore(join(dir, "store"));
    const saved = await store.publishFile({ sessionId: "session", title: "Chart", path: "chart.html" }, workspace);
    expect((await store.read("session", saved.id)).html).toBe("inside");
    await expect(store.publishFile({ sessionId: "session", title: "Chart", path: "../secret.html" }, workspace)).rejects.toThrow("inside");
  });
  it.skipIf(process.platform === "win32")("rejects a symlink escaping the workspace", async () => {
    const dir = await directory(); const workspace = join(dir, "project"); await mkdir(workspace); await writeFile(join(dir, "secret.html"), "secret");
    await symlink(join(dir, "secret.html"), join(workspace, "linked.html"));
    await expect(new HtmlArtifactStore(join(dir, "store")).publishFile({ sessionId: "s", title: "T", path: "linked.html" }, workspace)).rejects.toThrow("inside");
  });
});
