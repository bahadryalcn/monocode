import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { HostEngine } from "./engine";
import { HostStore } from "./store";
import { HostTasks, MAX_REPAIR_ATTEMPTS } from "./tasks";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });
function setup() {
  const dir = mkdtempSync(join(tmpdir(), "imece-pr-followup-"));
  const store = new HostStore(join(dir, "host.db"));
  const engine = new HostEngine(store, {codex: {send: async () => {}, stop: async () => {}, cancel: async () => {}, bind: () => {}, approve: () => {}, answer: () => {}}});
  const project = store.addProject(dir, "Test");
  const tasks = new HostTasks(store, engine);
  const sessionId = engine.command({type: "create", commandId: "create", projectId: project.id,
    harness: "codex", model: "codex:test", runtimeMode: "supervised"}).sessionId;
  const task = tasks.save({id: "task", projectId: project.id, title: "Fix checks", prompt: "Fix relevant checks",
    harness: "codex", model: "codex:test", runtimeMode: "supervised", maxRunMinutes: 0, review: false});
  const write = (patch: Record<string, unknown>) => store.db.prepare("UPDATE tasks SET value=? WHERE id=?")
    .run(JSON.stringify({...task, status: "done", sessionId, ...patch}), task.id);
  write({});
  cleanups.push(async () => { await engine.close(); store.close(); rmSync(dir, {recursive: true, force: true}); });
  return {tasks, store, sessionId, write};
}
it("atomically queues one follow-up and deduplicates the durable receipt after restart", () => {
  const s = setup();
  expect(s.tasks.queueDeliveryFollowup("task", "CI failed", "event")).toBe(true);
  expect(s.tasks.list()[0]).toMatchObject({status: "queued", repairAttempts: 1});
  expect(s.tasks.list()[0].retryFeedback).toContain("no additional push, merge or publication");
  expect(s.tasks.queueDeliveryFollowup("task", "CI failed", "event")).toBe(true);
  expect(s.tasks.list()[0].repairAttempts).toBe(1);
  expect(() => s.tasks.queueDeliveryFollowup("task", "Different event", "event")).toThrow();
});
it("preserves owner stops, merged work, repair budgets and archived sessions", () => {
  const s = setup();
  for (const patch of [{repairStop: "owner"}, {merged: true}, {repairAttempts: MAX_REPAIR_ATTEMPTS}, {status: "running"}]) {
    s.write(patch);
    expect(s.tasks.queueDeliveryFollowup("task", "CI failed", "event")).toBe(false);
  }
  s.write({});
  const current = s.store.session(s.sessionId);
  s.store.save({...current, archived: true, revision: current.revision + 1}, {type: "test"});
  expect(s.tasks.queueDeliveryFollowup("task", "CI failed", "event")).toBe(false);
  expect(s.store.receiptStatus("event")).toBeUndefined();
});
