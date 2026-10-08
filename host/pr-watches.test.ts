import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { HostStore } from "./store";
import { HostPrWatches } from "./pr-watches";
import type { PrWatch, PrWatchSnapshot } from "../src/features/inbox/model/prWatches";

const cleanups: (() => void)[] = [];
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); });
function setup() {
  const dir = mkdtempSync(join(tmpdir(), "imc-pr-watch-"));
  const store = new HostStore(join(dir, "state.sqlite"));
  cleanups.push(() => { store.close(); rmSync(dir, { recursive: true, force: true }); });
  const project = store.addProject(dir, "App");
  store.db.exec("CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, value TEXT NOT NULL)");
  store.db.prepare("INSERT INTO tasks VALUES (?, ?)").run("task", JSON.stringify({ id: "task", projectId: project.id }));
  const read = vi.fn<(...args: [string, string, number]) => Promise<PrWatchSnapshot>>();
  const wake = vi.fn(async (_watch: PrWatch, _prompt: string, _eventId: string) => true);
  const manager = new HostPrWatches(store, { read, wake, now: () => 100 });
  const watch = manager.link({ projectId: project.id, repo: "acme/app", number: 42, taskId: "task", autoWake: true });
  return { store, project, manager, watch, read, wake };
}
const snapshot = (failedChecks: string[] = []): PrWatchSnapshot => ({ headOid: "abc", state: "OPEN", failedChecks, reviewIds: [], conflicting: false });

it("persists multiple links and does not wake on baseline or unchanged evidence", async () => {
  const { manager, watch, read, wake, store } = setup();
  read.mockResolvedValue(snapshot(["build"]));
  await manager.check(watch.id);
  await manager.check(watch.id);
  expect(wake).not.toHaveBeenCalled();
  expect(new HostPrWatches(store, { read, wake }).list()[0]?.snapshot?.failedChecks).toEqual(["build"]);
});
it("defers busy targets, retries the same durable event, and stops after three wakeups", async () => {
  const { manager, watch, read, wake } = setup();
  read.mockResolvedValue(snapshot());
  await manager.check(watch.id);
  wake.mockResolvedValueOnce(false);
  read.mockResolvedValue(snapshot(["build"]));
  await manager.check(watch.id);
  const eventId = manager.list()[0]?.pendingEvent?.id;
  expect(eventId).toBeTruthy();
  await manager.check(watch.id);
  expect(wake.mock.calls[0]?.[2]).toEqual(wake.mock.calls[1]?.[2]);
  for (const check of ["lint", "test", "extra"]) {
    read.mockResolvedValue(snapshot([check]));
    await manager.check(watch.id);
  }
  expect(manager.list()[0]).toMatchObject({ status: "paused", wakes: 3 });
  expect(wake).toHaveBeenCalledTimes(4);
});
it("pauses after repeated read failures without waking and resumes only explicitly", async () => {
  const { manager, watch, read, wake } = setup();
  read.mockRejectedValue(new Error("token-secret"));
  for (let i = 0; i < 4; i++) await manager.check(watch.id);
  expect(read).toHaveBeenCalledTimes(3);
  expect(wake).not.toHaveBeenCalled();
  expect(manager.list()[0]?.notice).not.toContain("token-secret");
  expect(manager.resume(watch.id)).toMatchObject({ status: "watching", readFailures: 0 });
});
it("does not resurrect an unlinked PR while a read is in flight", async () => {
  const { manager, watch, read } = setup();
  let release!: (value: PrWatchSnapshot) => void;
  read.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
  const pending = manager.check(watch.id);
  manager.remove(watch.id);
  release(snapshot());
  await pending;
  expect(manager.list()).toEqual([]);
});
it("preserves an explicit pause made during an in-flight read", async () => {
  const { manager, watch, read } = setup();
  let release!: (value: PrWatchSnapshot) => void;
  read.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
  const pending = manager.check(watch.id);
  manager.pause(watch.id);
  release(snapshot(["build"]));
  await pending;
  expect(manager.list()[0]).toMatchObject({ status: "paused", notice: "Paused by owner" });
});
it("observation-only links never wake, and merged PRs settle", async () => {
  const { manager, watch, read, wake, project } = setup();
  manager.link({ projectId: project.id, repo: "acme/app", number: 42, taskId: "task", autoWake: false });
  read.mockResolvedValue(snapshot());
  await manager.check(watch.id);
  read.mockResolvedValue(snapshot(["build"]));
  await manager.check(watch.id);
  read.mockResolvedValue({ ...snapshot(), state: "MERGED" });
  await manager.check(watch.id);
  expect(wake).not.toHaveBeenCalled();
  expect(manager.list()[0]?.status).toBe("closed");
});
