// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import type { HostSession } from "./protocol";
import { loadRemoteSession, remoteRequest } from "./connections";
import { canApplyRemotePreview } from "./remotePreviewBinding";
import { canCacheRemoteSnapshot, createRemoteHistoryGeneration } from "./remoteHistoryGeneration";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const snapshot = (): HostSession => ({ projectId: "p", revision: 1, updatedAt: 1, status: "running",
  session: { id: "load-session", cwd: "/tmp", harness: "codex", model: "test", runtimeMode: "supervised", title: "Test",
    blocks: [{ id: "user", role: "user", text: "ready text", attachments: [{ id: "load-image", name: "x.png", kind: "image", mimeType: "image/png", size: 3 }] }] } });
it("publishes text and running status without waiting for an image RPC", async () => {
  let finish!: (chunk: { data: string; offset: number; size: number }) => void;
  const image = new Promise((resolve) => { finish = resolve; });
  const base = snapshot();
  vi.mocked(invoke).mockImplementation(async (_command, input) => {
    const { method } = input as { method: string };
    if (method === "sessions.sync") return { kind: "snapshot", value: base };
    if (method === "attachments.read") return image;
    if (method === "commands.dispatch") return { revision: 2 };
    throw new Error(method);
  });
  const onPreviews = vi.fn();
  const visible = await loadRemoteSession("m", "load-session", undefined, { onPreviews });
  expect(visible.session.blocks[0]!.text).toBe("ready text");
  expect(visible.status).toBe("running");
  expect(onPreviews).not.toHaveBeenCalled();
  await remoteRequest("m", "commands.dispatch", {});
  finish({ data: btoa("abc"), offset: 3, size: 3 });
  await vi.waitFor(() => expect(onPreviews).toHaveBeenCalledOnce());
});
it("rejects late previews after a session switch, newer revision or full hydration", () => {
  const old = snapshot();
  expect(canApplyRemotePreview(old, old)).toBe(true);
  expect(canApplyRemotePreview({ ...old, session: { ...old.session, id: "other" } }, old)).toBe(false);
  expect(canApplyRemotePreview({ ...old, revision: 2 }, old)).toBe(false);
  expect(canApplyRemotePreview({ ...old, historyLoading: false }, { ...old, historyLoading: true })).toBe(false);
});

it("preserves attachment previews for adopted and preload callers without callbacks", async () => {
  const base = snapshot();
  base.session.blocks[0]!.attachments![0]!.id = "legacy-preview-image";
  vi.mocked(invoke).mockImplementation(async (_command, input) => {
    const { method } = input as { method: string };
    if (method === "sessions.sync") return { kind: "snapshot", value: base };
    if (method === "attachments.read") return { data: btoa("abc"), offset: 3, size: 3 };
    throw new Error(method);
  });
  const complete = await loadRemoteSession("m", "load-session");
  expect(complete.session.blocks[0]!.attachments![0]!.data).toBe(btoa("abc"));
});

it("shows the tail before history pages settle and cancels a stale binding", async () => {
  vi.useFakeTimers();
  try {
    const base = snapshot();
    let current = true;
    let finish!: (page: unknown) => void;
    const older = new Promise((resolve) => { finish = resolve; });
    const onHistory = vi.fn();
    vi.mocked(invoke).mockImplementation(async (_command, input) => {
      const { method, params } = input as { method: string; params: { before?: number } };
      if (method !== "sessions.page") throw new Error(method);
      if (params.before === undefined) return { sync: { kind: "snapshot", value: base }, before: 1, totalBlocks: 2, revision: 1 };
      return older;
    });
    const tail = await loadRemoteSession("m", "load-session", undefined, { pages: true, onHistory, isCurrent: () => current });
    expect(tail.historyLoading).toBe(true);
    expect(tail.session.blocks[0]!.text).toBe("ready text");
    await vi.advanceTimersByTimeAsync(0);
    current = false;
    finish({ sync: { kind: "snapshot", value: base }, totalBlocks: 2, revision: 1 });
    await vi.advanceTimersByTimeAsync(0);
    expect(onHistory).not.toHaveBeenCalled();
  } finally { vi.useRealTimers(); }
});

it.each(["visibility toggle", "remount"])("restarts interrupted history after %s without restarting every poll", async () => {
  vi.useFakeTimers();
  try {
    const base = snapshot();
    let oldCurrent = true;
    let finishOld!: (page: unknown) => void;
    const oldPage = new Promise(resolve => { finishOld = resolve; });
    let tails = 0;
    const oldHistory = vi.fn();
    const newHistory = vi.fn();
    vi.mocked(invoke).mockImplementation(async (_command, input) => {
      const { method, params } = input as { method: string; params: { before?: number } };
      if (method !== "sessions.page") throw new Error(method);
      if (params.before === undefined) {
        tails++;
        return { sync: { kind: "snapshot", value: base }, before: 1, totalBlocks: 2, revision: 1 };
      }
      if (tails === 1) return oldPage;
      return { sync: { kind: "snapshot", value: { ...base, session: { ...base.session, blocks: [{ id: "earlier", role: "user", text: "earlier" }] } } }, totalBlocks: 2, revision: 1 };
    });
    const first = createRemoteHistoryGeneration();
    const tail = await loadRemoteSession("m", "load-session", first.known(undefined), { pages: true, onHistory: oldHistory, isCurrent: () => oldCurrent });
    first.loaded();
    await vi.advanceTimersByTimeAsync(0);
    expect(canCacheRemoteSnapshot(tail)).toBe(false);
    expect(first.known(tail)).toBe(tail);
    oldCurrent = false; // The visibility effect cleanup or unmount cancels this loader.
    const next = createRemoteHistoryGeneration();
    expect(next.known(tail)).toBeUndefined();
    const restarted = await loadRemoteSession("m", "load-session", next.known(tail), { pages: true, onHistory: newHistory, isCurrent: () => true });
    next.loaded();
    const beforePoll = tails;
    expect(await loadRemoteSession("m", "load-session", next.known(restarted), { pages: true, onHistory: newHistory })).toBe(restarted);
    expect(tails).toBe(beforePoll);
    finishOld({ sync: { kind: "snapshot", value: base }, totalBlocks: 2, revision: 1 });
    await vi.advanceTimersByTimeAsync(0);
    expect(oldHistory).not.toHaveBeenCalled();
    expect(newHistory).toHaveBeenCalledOnce();
    const history = newHistory.mock.calls[0][0] as HostSession;
    expect(history.session.blocks.map(block => block.id)).toEqual(["earlier", "user"]);
    expect(history.historyLoading).toBe(false);
    expect(canCacheRemoteSnapshot(history)).toBe(true);
  } finally { vi.useRealTimers(); }
});
