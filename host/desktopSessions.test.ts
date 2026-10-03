import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { HostEngine } from "./engine";
import { HostStore } from "./store";
import { createHostServer } from "./server";
import { DesktopSessions } from "./desktopSessions";
import { DesktopLive } from "./desktopLive";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

type Seed = {
  id: string;
  cwd: string;
  harness?: string;
  updated?: number;
  draft?: number;
  user?: number;
  worktree?: string;
};

async function setup() {
  const clock = { now: 1_000_000 };
  const directory = mkdtempSync(join(tmpdir(), "monocode-desktop-test-"));
  const projectDir = join(directory, "project");
  mkdirSync(projectDir);
  const dbPath = join(directory, "monocode.db");
  const desktopDb = new DatabaseSync(dbPath);
  desktopDb.exec(`CREATE TABLE sessions (id TEXT PRIMARY KEY, cwd TEXT NOT NULL, harness TEXT NOT NULL, model TEXT, model_settings TEXT, runtime_mode TEXT, title TEXT, provider_session_id TEXT, blocks_json TEXT NOT NULL, created_at INTEGER, updated_at INTEGER, branch TEXT, archived INTEGER DEFAULT 0, worktree_cwd TEXT, has_user_message INTEGER DEFAULT 1, pinned INTEGER DEFAULT 0, linked_work_item_json TEXT, provider_account_id TEXT, is_draft INTEGER DEFAULT 0);
    CREATE TABLE in_flight_sessions (session_id TEXT PRIMARY KEY, cwd TEXT NOT NULL, sort_index INTEGER NOT NULL);`);
  const seed = (s: Seed) =>
    desktopDb
      .prepare(
        "INSERT INTO sessions (id, cwd, harness, model, model_settings, runtime_mode, title, provider_session_id, blocks_json, created_at, updated_at, is_draft, has_user_message, worktree_cwd) VALUES (?, ?, ?, 'codex:test', '{}', 'supervised', ?, ?, ?, 1, ?, ?, ?, ?)",
      )
      .run(
        s.id,
        s.cwd,
        s.harness ?? "codex",
        `Title ${s.id}`,
        `prov-${s.id}`,
        JSON.stringify([{ id: "b1", role: "user", text: "hi" }]),
        s.updated ?? 100,
        s.draft ?? 0,
        s.user ?? 1,
        s.worktree ?? null,
      );
  const store = new HostStore(join(directory, "host.db"));
  const bind = vi.fn();
  let finish = () => {};
  const send = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
  const engine = new HostEngine(store, {
    codex: { send, stop: async () => finish(), cancel: async () => finish(), bind, approve: () => {}, answer: () => {} },
  });
  const project = await engine.openProject(projectDir);
  const server = createHostServer(
    engine,
    ["codex"],
    undefined,
    undefined,
    undefined,
    new DesktopSessions(() => [dbPath], process.platform, new DesktopLive(() => clock.now)),
  );
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/rpc`;
  const device = store.issueDevice("Laptop");
  const call = async (method: string, params: unknown = {}) => {
    const response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${device.token}` },
      body: JSON.stringify({ version: 1, environmentId: store.environmentId, method, params }),
    });
    return (await response.json()) as { result?: any; error?: string };
  };
  cleanups.push(async () => {
    finish();
    await engine.close();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    store.close();
    desktopDb.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return { dbPath, desktopDb, seed, store, engine, project, call, bind, send, projectDir, clock };
}

describe("desktop sessions on the host", () => {
  it("lists only matching, started, supported desktop sessions", async () => {
    const s = await setup();
    s.seed({ id: "ok", cwd: s.project.cwd, updated: 200 });
    s.seed({ id: "draft", cwd: s.project.cwd, draft: 1 });
    s.seed({ id: "empty", cwd: s.project.cwd, user: 0 });
    s.seed({ id: "other", cwd: join(s.projectDir, "..", "elsewhere") });
    s.seed({ id: "claude", cwd: s.project.cwd, harness: "claude" });
    s.desktopDb.prepare("INSERT INTO in_flight_sessions VALUES ('ok', ?, 0)").run(s.project.cwd);
    const list = (await s.call("sessions.list", { projectId: s.project.id })).result;
    expect(list.map((x: any) => x.id)).toEqual(["ok"]);
    expect(list[0]).toMatchObject({ origin: "desktop", status: "running", providerSessionId: "prov-ok", revision: 200 });
  });

  it("syncs a desktop snapshot", async () => {
    const s = await setup();
    s.seed({ id: "a", cwd: s.project.cwd, worktree: join(s.projectDir, "wt") });
    const sync = (await s.call("sessions.sync", { projectId: s.project.id, sessionId: "a" })).result;
    expect(sync.kind).toBe("snapshot");
    expect(sync.value).toMatchObject({ projectId: s.project.id, revision: 100, status: "idle" });
    expect(sync.value.session).toMatchObject({ id: "a", cwd: join(s.projectDir, "wt"), providerSessionId: "prov-a" });
  });

  it("adopts on send, binds the provider and prefers the host copy", async () => {
    const s = await setup();
    s.seed({ id: "a", cwd: s.project.cwd });
    const sent = await s.call("commands.dispatch", { type: "send", commandId: "c1", sessionId: "a", text: "go" });
    expect(sent.error).toBeUndefined();
    expect(s.store.session("a").projectId).toBe(s.project.id);
    expect(s.bind).toHaveBeenCalledWith("a", "prov-a", s.project.cwd);
    await vi.waitFor(() => expect(s.send).toHaveBeenCalledTimes(1));
    const list = (await s.call("sessions.list", { projectId: s.project.id })).result;
    expect(list.map((x: any) => x.id)).toEqual(["a"]);
    expect(list[0].origin).toBeUndefined();
  });

  it("updates by adopting first, refuses delete and in-flight sessions", async () => {
    const s = await setup();
    s.seed({ id: "a", cwd: s.project.cwd });
    s.seed({ id: "b", cwd: s.project.cwd });
    s.desktopDb.prepare("INSERT INTO in_flight_sessions VALUES ('b', ?, 0)").run(s.project.cwd);
    const deleted = await s.call("sessions.delete", { projectId: s.project.id, sessionId: "a" });
    expect(deleted.error).toMatch(/delete it there/);
    const watched = (await s.call("sessions.sync", { sessionId: "b" })).result;
    expect(watched.value).toMatchObject({ status: "running", session: { busy: true } });
    const idle = (await s.call("sessions.sync", { sessionId: "a" })).result;
    expect(idle.value.session.busy).toBeUndefined();
    const busy = await s.call("commands.dispatch", { type: "send", commandId: "c2", sessionId: "b", text: "go" });
    expect(busy.error).toMatch(/Wait for it to finish/);
    expect(() => s.store.session("b")).toThrow();
    const updated = await s.call("sessions.update", { projectId: s.project.id, sessionId: "a", pinned: true });
    expect(updated.error).toBeUndefined();
    expect(s.store.session("a").pinned).toBe(true);
  });

  it("lists adopted sessions and catches up with later desktop turns", async () => {
    const s = await setup();
    s.seed({ id: "a", cwd: s.project.cwd, updated: 100 });
    s.engine.adoptSession((await s.call("sessions.sync", { sessionId: "a" })).result.value);
    const adopted = (await s.call("sessions.adopted")).result;
    expect(adopted).toMatchObject([{ id: "a", projectId: s.project.id, status: "idle" }]);
    expect(s.store.session("a").desktop).toEqual({ updatedAt: 100 });

    // The desktop app on this machine ran another turn in the same session.
    const blocks = [
      { id: "b1", role: "user", text: "hi" },
      { id: "b2", role: "assistant", text: "done locally" },
    ];
    s.desktopDb
      .prepare("UPDATE sessions SET blocks_json=?, updated_at=300, provider_session_id='prov-a2' WHERE id='a'")
      .run(JSON.stringify(blocks));
    const sync = (await s.call("sessions.sync", { sessionId: "a" })).result;
    expect(sync.kind).toBe("snapshot");
    expect(sync.value.session.blocks).toEqual(blocks);
    expect(sync.value.desktop).toEqual({ updatedAt: 300 });
    expect(s.bind).toHaveBeenLastCalledWith("a", "prov-a2", s.project.cwd);
    const revision = sync.value.revision;

    // Seen once: polling again doesn't bump the revision.
    const again = (await s.call("sessions.sync", { sessionId: "a", revision })).result;
    expect(again.kind).toBe("unchanged");

    // A desktop turn in progress blocks sending from here.
    s.desktopDb.prepare("INSERT INTO in_flight_sessions VALUES ('a', ?, 0)").run(s.project.cwd);
    s.desktopDb.prepare("UPDATE sessions SET updated_at=400 WHERE id='a'").run();
    const busy = await s.call("commands.dispatch", { type: "send", commandId: "c3", sessionId: "a", text: "go" });
    expect(busy.error).toMatch(/Wait for it to finish/);
    expect(s.send).not.toHaveBeenCalled();
  });

  it("follows the app's heartbeat: running, live prompts, remote control", async () => {
    const s = await setup();
    s.seed({ id: "a", cwd: s.project.cwd, updated: 100 });
    // A crashed app's in-flight mark counts only until a heartbeat arrives.
    s.desktopDb.prepare("INSERT INTO in_flight_sessions VALUES ('a', ?, 0)").run(s.project.cwd);
    const approval = {
      id: "ap1",
      role: "approval",
      text: "Run tests?",
      approval: { requestId: 7 },
    };
    const question = { requestId: 9, questions: [] };
    const beat = (body: unknown) => s.call("sessions.desktopLive", body);
    expect((await beat({ sessions: [{ id: "a", busy: true, pending: [approval], patch: { pendingQuestion: question } }] })).result)
      .toEqual({ commands: [] });

    const first = (await s.call("sessions.sync", { sessionId: "a" })).result;
    expect(first.kind).toBe("snapshot");
    expect(first.value).toMatchObject({ status: "running", runId: "desktop" });
    expect(first.value.session).toMatchObject({ busy: true, pendingQuestion: question });
    expect(first.value.session.blocks.map((b: any) => b.id)).toEqual(["b1", "ap1"]);
    expect((await s.call("sessions.list", { projectId: s.project.id })).result[0].status).toBe("running");

    // Stop and approve from here wait for the app; it acks them.
    for (const command of [
      { type: "approve", commandId: "k1", sessionId: "a", runId: "desktop", requestId: 7, decision: "allow" },
      { type: "cancel", commandId: "k2", sessionId: "a", runId: "desktop" },
    ]) expect((await s.call("commands.dispatch", command)).error).toBeUndefined();
    const queued = (await beat({ sessions: [{ id: "a", busy: true }] })).result.commands;
    expect(queued).toMatchObject([
      { sessionId: "a", type: "approve", requestId: 7, decision: "allow" },
      { sessionId: "a", type: "cancel" },
    ]);
    expect(s.send).not.toHaveBeenCalled();
    expect((await beat({ sessions: [{ id: "a", busy: true }], acked: queued.map((c: any) => c.id) })).result)
      .toEqual({ commands: [] });

    // The prompt is gone: only that changed, so only a delta goes out.
    const second = (await s.call("sessions.sync", { sessionId: "a", revision: first.value.revision })).result;
    expect(second.kind).toBe("delta");
    expect(second.blockIds).toEqual(["b1"]);
    expect(second.blocks).toEqual([]);
    const third = (await s.call("sessions.sync", { sessionId: "a", revision: second.value.revision })).result;
    expect(third.kind).toBe("unchanged");

    // No heartbeat for a while: the app is gone, nothing is running.
    s.clock.now += 60_000;
    const stale = (await s.call("sessions.sync", { sessionId: "a" })).result;
    expect(stale.value.status).toBe("idle");
    expect(stale.value.session.busy).toBeUndefined();
    const refused = await s.call("commands.dispatch", { type: "cancel", commandId: "k3", sessionId: "a", runId: "desktop" });
    expect(refused.error).toBeDefined();
  });

  it("prefers the newest copy across databases", async () => {
    const s = await setup();
    s.seed({ id: "a", cwd: s.project.cwd, updated: 100 });
    const desktop = new DesktopSessions(() => [s.dbPath, s.dbPath]);
    expect(desktop.list(s.project.cwd, s.project.id, ["codex"])).toHaveLength(1);
  });
});
