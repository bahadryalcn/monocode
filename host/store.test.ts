import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  CommandReceipt,
  HostSession,
} from "../src/features/connections/model/protocol";
import { HostStore } from "./store";
import { HostEngine } from "./engine";

const cleanups: Array<() => void> = [];

it("recovers reordered, deleted and updated blocks from the incremental journal", () => {
  vi.useFakeTimers();
  try {
    const path = join(open(), "journal.db");
    const store = new HostStore(path);
    const project = store.addProject("/tmp", "Journal");
    const base = store.save(
      session("journal", project.id, {
        session: {
          ...session("journal", project.id).session,
          blocks: [
            { id: "a", role: "assistant", text: "large prefix" },
            { id: "b", role: "assistant", text: "tail" },
          ],
        },
      }),
      {},
    );
    const next = store.save(
      {
        ...base,
        revision: 2,
        session: {
          ...base.session,
          title: "Changed",
          blocks: [
            { ...base.session.blocks[1]!, text: "new tail" },
            base.session.blocks[0]!,
          ],
        },
      },
      {},
      { deferred: true },
    );
    vi.advanceTimersByTime(1_000);
    store.save(
      {
        ...next,
        revision: 3,
        session: { ...next.session, blocks: [next.session.blocks[0]!] },
      },
      {},
      { deferred: true },
    );
    vi.advanceTimersByTime(1_000);
    expect(
      JSON.parse(
        String(
          store.db
            .prepare("SELECT snapshot FROM sessions WHERE id='journal'")
            .get()!.snapshot,
        ),
      ).revision,
    ).toBe(1);
    store.db.close();
    const reopened = new HostStore(path);
    cleanups.push(() => reopened.close());
    expect(
      reopened.session("journal").session.blocks.map((b) => [b.id, b.text]),
    ).toEqual([["b", "new tail"]]);
    expect(reopened.session("journal").session.title).toBe("Changed");
    expect(reopened.session("journal").revision).toBe(3);
  } finally {
    vi.useRealTimers();
  }
});

it("rolls back a journal and its events when an enclosing transaction fails", () => {
  const store = new HostStore(join(open(), "rollback.db"));
  cleanups.push(() => store.close());
  const project = store.addProject("/tmp", "Rollback");
  const base = store.save(session("rollback", project.id), {});
  expect(() =>
    store.transaction(() => {
      store.save({ ...base, revision: 2 }, { changed: true });
      throw new Error("rollback");
    }),
  ).toThrow("rollback");
  expect(store.session("rollback").revision).toBe(1);
  expect(store.events("rollback", 1).events).toEqual([]);
});

it("keeps session revisions in bounded metadata memory after the first indexed read", () => {
  const path = join(open(), "metadata.db");
  const initial = new HostStore(path);
  const project = initial.addProject("/tmp", "Metadata");
  const saved = initial.save(session("metadata", project.id), {});
  initial.close();

  const reopened = new HostStore(path);
  cleanups.push(() => reopened.close());
  const prepare = vi.spyOn(reopened.db, "prepare");
  expect(reopened.sessionStateMetadata("metadata")).toEqual({
    revision: saved.revision,
    status: "idle",
    desktop: false,
  });
  expect(prepare).toHaveBeenCalledTimes(1);
  expect(reopened.sessionRevision("metadata")).toBe(saved.revision);
  expect(reopened.sessionStateMetadata("metadata")?.status).toBe("idle");
  expect(prepare).toHaveBeenCalledTimes(1);
});
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

function open() {
  const directory = mkdtempSync(join(tmpdir(), "monocode-store-test-"));
  cleanups.push(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function session(
  id: string,
  projectId: string,
  extra: Partial<HostSession> = {},
): HostSession {
  return {
    projectId,
    revision: 1,
    status: "idle",
    updatedAt: 100,
    session: {
      id,
      cwd: "/tmp",
      title: id,
      harness: "codex",
      model: "codex:test",
      runtimeMode: "supervised",
      blocks: [],
    },
    ...extra,
  } as unknown as HostSession;
}

describe("HostStore.adopted", () => {
  it("lists only desktop-shared sessions and tracks updates", () => {
    const directory = open();
    const store = new HostStore(join(directory, "host.db"));
    cleanups.push(() => store.close());
    const project = store.addProject(directory, "Test");
    store.save(session("plain", project.id), { type: "t" });
    store.save(session("shared", project.id, { desktop: { updatedAt: 5 } }), {
      type: "t",
    });
    expect(store.adopted()).toEqual([
      {
        id: "shared",
        projectId: project.id,
        revision: 1,
        updatedAt: 100,
        status: "idle",
      },
    ]);

    store.save(
      session("shared", project.id, {
        desktop: { updatedAt: 9 },
        revision: 2,
        updatedAt: 200,
        status: "running",
      }),
      { type: "t" },
    );
    store.save(
      session("plain", project.id, {
        desktop: { updatedAt: 0 },
        revision: 3,
        updatedAt: 300,
      }),
      { type: "t" },
    );
    expect(store.adopted().sort((a, b) => a.id.localeCompare(b.id))).toEqual([
      {
        id: "plain",
        projectId: project.id,
        revision: 3,
        updatedAt: 300,
        status: "idle",
      },
      {
        id: "shared",
        projectId: project.id,
        revision: 2,
        updatedAt: 200,
        status: "running",
      },
    ]);
  });

  it("migrates and backfills a database created with the old schema", () => {
    const directory = open();
    const path = join(directory, "host.db");
    const old = new DatabaseSync(path);
    old.exec(`CREATE TABLE projects (id TEXT PRIMARY KEY, cwd TEXT NOT NULL UNIQUE, name TEXT NOT NULL);
      CREATE TABLE sessions (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), snapshot TEXT NOT NULL, summary TEXT);
      INSERT INTO projects VALUES ('p', '/x', 'X');`);
    const insert = old.prepare(
      "INSERT INTO sessions (id, project_id, snapshot) VALUES (?, 'p', ?)",
    );
    insert.run(
      "a",
      JSON.stringify(
        session("a", "p", {
          desktop: { updatedAt: 1 },
          revision: 7,
          updatedAt: 42,
          status: "running",
        }),
      ),
    );
    insert.run("b", JSON.stringify(session("b", "p")));
    old.close();

    const store = new HostStore(path);
    expect(store.adopted()).toEqual([
      {
        id: "a",
        projectId: "p",
        revision: 7,
        updatedAt: 42,
        status: "running",
      },
    ]);
    // Reopening must not re-run the backfill or fail on existing columns.
    store.close();
    const again = new HostStore(path);
    cleanups.push(() => again.close());
    expect(again.adopted()).toHaveLength(1);
  });
});

describe("HostStore receipts", () => {
  const receipt = (commandId: string) =>
    ({ commandId }) as unknown as CommandReceipt;

  it("prunes old receipts but keeps recent ones deduplicating retries", () => {
    const directory = open();
    const path = join(directory, "host.db");
    const store = new HostStore(path);
    store.recordReceipt("sig", receipt("recent"));
    store.recordReceipt("sig", receipt("old"));
    store.db
      .prepare("UPDATE receipts SET created_at=? WHERE id='old'")
      .run(Date.now() - 8 * 24 * 3600_000);
    store.pruneReceipts();
    expect(store.receipt("old", "sig")).toBeUndefined();
    expect(store.receipt("recent", "sig")).toEqual(receipt("recent"));
    expect(() => store.receipt("recent", "other")).toThrow(/different payload/);
    store.close();
  });

  it("migrates a receipts table without timestamps and gives old rows a full window", () => {
    const directory = open();
    const path = join(directory, "host.db");
    const old = new DatabaseSync(path);
    old.exec(`CREATE TABLE receipts (id TEXT PRIMARY KEY, signature TEXT NOT NULL, receipt TEXT NOT NULL);
      INSERT INTO receipts VALUES ('legacy', 'sig', '{"commandId":"legacy"}');`);
    old.close();
    const store = new HostStore(path);
    cleanups.push(() => store.close());
    expect(store.receipt("legacy", "sig")).toEqual(receipt("legacy"));
  });

  it("reads a durable command status receipt without requiring a retry signature", () => {
    const directory = open();
    const path = join(directory, "host.db");
    const store = new HostStore(path);
    store.recordReceipt("sig", receipt("durable"));
    store.close();
    const reopened = new HostStore(path);
    cleanups.push(() => reopened.close());
    expect(reopened.receiptStatus("durable")).toEqual(receipt("durable"));
    expect(reopened.receiptStatus("missing")).toBeUndefined();
  });
});

describe("HostStore startup columns", () => {
  const legacy = (path: string) => {
    const old = new DatabaseSync(path);
    old.exec(`CREATE TABLE projects (id TEXT PRIMARY KEY, cwd TEXT NOT NULL UNIQUE, name TEXT NOT NULL);
      CREATE TABLE sessions (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), snapshot TEXT NOT NULL, summary TEXT);
      CREATE TABLE events (session_id TEXT NOT NULL REFERENCES sessions(id), revision INTEGER NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(session_id, revision));
      INSERT INTO projects VALUES ('p', '/x', 'X');`);
    const insert = old.prepare(
      "INSERT INTO sessions (id, project_id, snapshot) VALUES (?, 'p', ?)",
    );
    const withSession = (
      id: string,
      patch: Record<string, unknown>,
      extra: Partial<HostSession> = {},
    ) => {
      const base = session(id, "p", extra);
      insert.run(
        id,
        JSON.stringify({ ...base, session: { ...base.session, ...patch } }),
      );
    };
    // idle + desktop-shared + provider binding: needs no rewrite
    withSession(
      "bound",
      { providerSessionId: "prov-1", cwd: "/work" },
      { desktop: { updatedAt: 1 } },
    );
    // started here, never shared with the desktop app
    withSession("local", {});
    // a turn that was running when the host stopped
    withSession(
      "running",
      { providerSessionId: "prov-2" },
      { desktop: { updatedAt: 1 }, status: "running", revision: 4 },
    );
    // a `!command` that cannot outlive the host
    withSession(
      "shell",
      {
        blocks: [
          { id: "b", role: "assistant", text: "", shell: { running: true } },
        ],
      },
      { desktop: { updatedAt: 1 } },
    );
    old.close();
  };

  it("backfills the startup columns from an old-schema database", () => {
    const directory = open();
    const path = join(directory, "host.db");
    legacy(path);
    const store = new HostStore(path);
    cleanups.push(() => store.close());
    const states = Object.fromEntries(
      store.startupStates().map((state) => [state.id, state]),
    );
    expect(states.bound).toMatchObject({
      hasDesktop: true,
      running: false,
      shellRunning: false,
      providerSessionId: "prov-1",
      harness: "codex",
      cwd: "/work",
    });
    expect(states.local).toMatchObject({
      hasDesktop: false,
      providerSessionId: null,
    });
    expect(states.running).toMatchObject({
      running: true,
      providerSessionId: "prov-2",
    });
    expect(states.shell.shellRunning).toBe(true);
  });

  it("starts up with the same effects as parsing every snapshot, loading only what it rewrites", () => {
    const directory = open();
    const path = join(directory, "host.db");
    legacy(path);
    const store = new HostStore(path);
    cleanups.push(() => store.close());
    const find = vi.spyOn(store, "session");
    const bind = vi.fn();
    const provider = {
      send: vi.fn(),
      stop: async () => {},
      cancel: async () => {},
      bind,
      approve: () => {},
      answer: () => {},
    };
    const engine = new HostEngine(store, { codex: provider });
    cleanups.push(() => engine.close());

    // Provider bindings are restored for every bound session.
    expect(bind).toHaveBeenCalledWith("bound", "prov-1", "/work");
    expect(bind).toHaveBeenCalledWith("running", "prov-2", "/tmp");
    expect(bind).toHaveBeenCalledTimes(2);
    // The idle, already-shared session was never loaded for startup.
    expect(find.mock.calls.map(([id]) => id)).not.toContain("bound");
    // Legacy rows are still shared with the desktop app; running turns are interrupted.
    expect(store.session("local").desktop).toBeDefined();
    expect(store.session("running").status).toBe("interrupted");
    expect(store.session("shell").session.blocks[0].shell?.running).toBeFalsy();
    // The columns follow the rewrites.
    const states = Object.fromEntries(
      store.startupStates().map((state) => [state.id, state]),
    );
    expect(states.local.hasDesktop).toBe(true);
    expect(states.running.running).toBe(false);
    expect(states.shell.shellRunning).toBe(false);
  });
});

describe("HostStore checkpointed streaming saves", () => {
  const withText = (
    base: HostSession,
    revision: number,
    text: string,
  ): HostSession =>
    ({
      ...base,
      revision,
      updatedAt: 100 + revision,
      session: {
        ...base.session,
        blocks: [{ id: "b", role: "assistant", text, streaming: true }],
      },
    }) as unknown as HostSession;
  const stored = (path: string, id: string) => {
    const db = new DatabaseSync(path);
    try {
      const row = db
        .prepare("SELECT snapshot, revision, status FROM sessions WHERE id=?")
        .get(id);
      const events = db
        .prepare(
          "SELECT revision FROM events WHERE session_id=? ORDER BY revision",
        )
        .all(id);
      return { row, events: events.map((event) => Number(event.revision)) };
    } finally {
      db.close();
    }
  };
  function setup() {
    const directory = open();
    const path = join(directory, "host.db");
    const store = new HostStore(path);
    const project = store.addProject(directory, "Test");
    const base = session("s", project.id, {
      status: "running",
      desktop: { updatedAt: 1 },
    });
    store.save(base, { type: "turn" });
    return { store, path, project, base };
  }

  it("writes incremental journals per checkpoint while reads see every soft save", () => {
    vi.useFakeTimers();
    try {
      const { store, path, base } = setup();
      cleanups.push(() => store.close());
      const writes = store.snapshotWrites;
      for (let revision = 2; revision <= 6; revision++) {
        store.save(
          withText(base, revision, "x".repeat(revision)),
          { type: "events" },
          { deferred: true },
        );
        expect(store.session("s").revision).toBe(revision);
        expect(store.session("s").session.blocks[0].text).toBe(
          "x".repeat(revision),
        );
        expect(store.summaries(base.projectId)[0].revision).toBe(revision);
        expect(store.adopted()[0].revision).toBe(revision);
        expect(store.sessions(base.projectId)[0].revision).toBe(revision);
      }
      expect(store.snapshotWrites).toBe(writes);
      expect(stored(path, "s").row?.revision).toBe(1);

      vi.advanceTimersByTime(1_000);
      expect(store.snapshotWrites).toBe(writes);
      const after = stored(path, "s");
      expect(after.row?.revision).toBe(6);
      expect(after.events).toEqual([1, 2, 3, 4, 5, 6]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("serves a client the same events and revisions as unbatched saves", () => {
    vi.useFakeTimers();
    try {
      const { store, base } = setup();
      cleanups.push(() => store.close());
      for (let revision = 2; revision <= 4; revision++)
        store.save(
          withText(base, revision, "t"),
          { type: "events", n: revision },
          { deferred: true },
        );
      const pending = store.events("s", 1);
      vi.advanceTimersByTime(1_000);
      expect(store.events("s", 1)).toEqual(pending);
      expect(pending.events).toEqual([
        { revision: 2, event: { type: "events", n: 2 } },
        { revision: 3, event: { type: "events", n: 3 } },
        { revision: 4, event: { type: "events", n: 4 } },
      ]);
      expect(pending.revision).toBe(4);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a hard save flushes pending state at once and the row equals memory", () => {
    vi.useFakeTimers();
    try {
      const { store, path, base } = setup();
      cleanups.push(() => store.close());
      store.save(
        withText(base, 2, "partial"),
        { type: "events" },
        { deferred: true },
      );
      const settled = store.save(
        { ...withText(base, 3, "partial done"), status: "idle" },
        { type: "settled" },
      );
      const { row, events } = stored(path, "s");
      expect(JSON.parse(String(row?.snapshot))).toEqual(settled);
      expect(row?.status).toBe("idle");
      expect(events).toEqual([1, 2, 3]);
      // No stale checkpoint timer rewrites anything afterwards.
      const writes = store.snapshotWrites;
      vi.advanceTimersByTime(5_000);
      expect(store.snapshotWrites).toBe(writes);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps pending state when the LRU cache evicts the session", () => {
    vi.useFakeTimers();
    try {
      const { store, path, project, base } = setup();
      cleanups.push(() => store.close());
      store.save(
        withText(base, 2, "streamed"),
        { type: "events" },
        { deferred: true },
      );
      for (let index = 0; index < 40; index++) {
        store.save(session(`other-${index}`, project.id), { type: "t" });
        store.session(`other-${index}`);
      }
      expect(store.session("s").session.blocks[0].text).toBe("streamed");
      expect(stored(path, "s").row?.revision).toBe(1);
      vi.advanceTimersByTime(1_000);
      expect(stored(path, "s").row?.revision).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("close flushes pending state", () => {
    vi.useFakeTimers();
    try {
      const { store, path, base } = setup();
      store.save(
        withText(base, 2, "last words"),
        { type: "events" },
        { deferred: true },
      );
      store.close();
      const { row, events } = stored(path, "s");
      expect(row?.revision).toBe(2);
      expect(String(row?.snapshot)).toContain("last words");
      expect(events).toEqual([1, 2]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("after a crash the last checkpoint survives and startup interrupts the turn", () => {
    vi.useFakeTimers();
    try {
      const { store, path, base } = setup();
      store.save(
        withText(base, 2, "checkpointed"),
        { type: "events" },
        { deferred: true },
      );
      vi.advanceTimersByTime(1_000);
      store.save(
        withText(base, 3, "lost tail"),
        { type: "events" },
        { deferred: true },
      );
      // Crash: drop the checkpoint timer and close the raw handle without flushing,
      // so the pending state is lost and no file handle stays open.
      vi.clearAllTimers();
      store.db.close();
      const reopened = new HostStore(path);
      cleanups.push(() => reopened.close());
      expect(reopened.session("s").session.blocks[0].text).toBe("checkpointed");
      const provider = {
        send: vi.fn(),
        stop: async () => {},
        cancel: async () => {},
        bind: vi.fn(),
        approve: () => {},
        answer: () => {},
      };
      const engine = new HostEngine(reopened, { codex: provider });
      cleanups.push(() => void engine.close());
      expect(reopened.session("s").status).toBe("interrupted");
      expect(reopened.session("s").session.blocks[0].text).toBe("checkpointed");
      vi.clearAllTimers();
    } finally {
      vi.useRealTimers();
    }
  });
});
