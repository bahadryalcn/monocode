import { DatabaseSync } from "node:sqlite";
import { randomUUID, createHash, randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import type {
  CommandReceipt,
  HostProject,
  HostSession,
  HostSessionSummary,
  RemoteProvider,
  SessionSync,
} from "../src/features/connections/model/protocol";
import type { LinkedWorkItem } from "../src/features/sessions/model/session";
import { sessionNeedsInput } from "../src/features/sessions/model/session";
import { snapshotWeight } from "../src/features/connections/model/snapshotWeight";

const CACHED_SESSIONS = 32;
// Retried commands are deduplicated by receipt; a week far outlives any retry.
const RECEIPT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const RECEIPT_PRUNE_EVERY = 500;
// Saves caused only by streamed deltas ("soft") update memory at once but reach
// SQLite at most this often per session. Durability trade-off accepted by the
// owner: if the host process dies mid-stream, up to this much streamed text of
// the running turn may be lost and the turn is marked interrupted on restart.
// Every other save ("hard") writes immediately and flushes pending soft state
// first, so no hard event and no settled turn is ever lost.
const CHECKPOINT_MS = 1_000;

/** Latest unwritten state of a session plus its event rows, in revision order. */
interface PendingWrite {
  value: HostSession;
  events: { revision: number; event: unknown }[];
  timer?: ReturnType<typeof setTimeout>;
}

export class HostStore {
  readonly db: DatabaseSync;
  readonly environmentId: string;
  readonly attachmentDir: string;
  // This process is the only session writer, so recently used snapshots are
  // served from memory instead of re-parsing whole transcripts. Callers must
  // treat returned values as immutable.
  private cache = new Map<string, HostSession>();
  private cacheWeights = new Map<string, number>();
  private receiptWrites = 0;
  // Write-behind state, consulted before the cache and SQLite by every read.
  // Kept apart from the LRU cache so eviction can never drop unwritten data.
  private pending = new Map<string, PendingWrite>();
  private inTransaction = false;
  private commitEffects: Array<() => void> = [];
  private flushedInTransaction: PendingWrite[] = [];
  /** Snapshot upserts issued so far; lets tests count checkpoints. */
  snapshotWrites = 0;

  constructor(path: string) {
    this.attachmentDir = join(dirname(path), "attachments");
    this.db = new DatabaseSync(path);
    this.db
      .exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, cwd TEXT NOT NULL UNIQUE, name TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), snapshot TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS session_journal (session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE, revision INTEGER NOT NULL, metadata TEXT NOT NULL, block_ids TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS session_journal_blocks (session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, block_id TEXT NOT NULL, revision INTEGER NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(session_id,block_id));
      CREATE TABLE IF NOT EXISTS receipts (id TEXT PRIMARY KEY, signature TEXT NOT NULL, receipt TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events (session_id TEXT NOT NULL REFERENCES sessions(id), revision INTEGER NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(session_id, revision));
      CREATE TABLE IF NOT EXISTS devices (id TEXT PRIMARY KEY, name TEXT NOT NULL, hash TEXT NOT NULL UNIQUE);
      CREATE TABLE IF NOT EXISTS sync_records (table_name TEXT NOT NULL, id TEXT NOT NULL, value TEXT, rev INTEGER NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (table_name, id));`);
    const columns = this.db.prepare("PRAGMA table_info(sessions)").all();
    if (!columns.some((column) => column.name === "summary"))
      this.db.exec("ALTER TABLE sessions ADD COLUMN summary TEXT");
    // Plain columns mirroring snapshot fields so adopted() never parses
    // transcripts. save() is the only snapshot writer and keeps them in sync.
    if (!columns.some((column) => column.name === "has_desktop")) {
      // One transaction: a crash midway must not leave has_desktop without
      // the other columns or the backfill.
      this.db.exec(`BEGIN;
        ALTER TABLE sessions ADD COLUMN has_desktop INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE sessions ADD COLUMN revision INTEGER;
        ALTER TABLE sessions ADD COLUMN updated_at INTEGER;
        ALTER TABLE sessions ADD COLUMN status TEXT;
        UPDATE sessions SET
          has_desktop = json_extract(snapshot, '$.desktop') IS NOT NULL,
          revision = json_extract(snapshot, '$.revision'),
          updated_at = json_extract(snapshot, '$.updatedAt'),
          status = json_extract(snapshot, '$.status');
        COMMIT;`);
    }
    // What host startup reads from every session, so it never parses a
    // transcript it does not have to rewrite. save() keeps them in sync.
    if (!columns.some((column) => column.name === "provider_session_id")) {
      this.db.exec(`BEGIN;
        ALTER TABLE sessions ADD COLUMN provider_session_id TEXT;
        ALTER TABLE sessions ADD COLUMN harness TEXT;
        ALTER TABLE sessions ADD COLUMN session_cwd TEXT;
        ALTER TABLE sessions ADD COLUMN shell_running INTEGER NOT NULL DEFAULT 0;
        UPDATE sessions SET
          provider_session_id = NULLIF(json_extract(snapshot, '$.session.providerSessionId'), ''),
          harness = json_extract(snapshot, '$.session.harness'),
          session_cwd = json_extract(snapshot, '$.session.cwd'),
          shell_running = EXISTS (
            SELECT 1 FROM json_each(snapshot, '$.session.blocks')
            WHERE COALESCE(json_extract(value, '$.shell.running'), 0) <> 0
          );
        COMMIT;`);
    }
    // Receipts only dedupe retried commands, so old ones are dead weight.
    // Existing rows are stamped now, so they get a full retention window.
    const receiptColumns = this.db.prepare("PRAGMA table_info(receipts)").all();
    if (!receiptColumns.some((column) => column.name === "created_at")) {
      this.db.exec(`BEGIN;
        ALTER TABLE receipts ADD COLUMN created_at INTEGER;
        UPDATE receipts SET created_at = ${Date.now()};
        COMMIT;`);
    }
    this.pruneReceipts();
    // Covering partial index: adopted() is answered from the index alone.
    this.db.exec(
      "CREATE INDEX IF NOT EXISTS sessions_adopted ON sessions(id, project_id, revision, updated_at, status) WHERE has_desktop=1",
    );
    this.db
      .prepare("INSERT OR IGNORE INTO metadata VALUES ('environmentId', ?)")
      .run(randomUUID());
    this.environmentId = String(
      this.db
        .prepare("SELECT value FROM metadata WHERE key='environmentId'")
        .get()!.value,
    );
  }

  transaction<T>(fn: () => T): T {
    if (this.inTransaction) return fn();
    this.db.exec("BEGIN IMMEDIATE");
    this.inTransaction = true;
    this.flushedInTransaction = [];
    try {
      const value = fn();
      this.db.exec("COMMIT");
      this.inTransaction = false;
      this.flushedInTransaction = [];
      const effects = this.commitEffects.splice(0);
      for (const effect of effects) {
        try { effect(); } catch (error) { console.error("Committed command dispatch failed:", error); }
      }
      return value;
    } catch (error) {
      this.inTransaction = false;
      this.cache.clear();
      this.cacheWeights.clear();
      this.commitEffects = [];
      // Pending state flushed inside this transaction is rolled back with it.
      for (const entry of this.flushedInTransaction.splice(0))
        this.restore(entry);
      try {
        this.db.exec("ROLLBACK");
      } catch (rollbackError) {
        console.error("Could not roll back host transaction:", rollbackError);
      }
      throw error;
    }
  }

  /** Provider side effects must never escape an uncommitted command batch. */
  afterCommit(effect: () => void): void {
    if (this.inTransaction) this.commitEffects.push(effect);
    else effect();
  }

  project(id: string): HostProject {
    const row = this.db.prepare("SELECT * FROM projects WHERE id=?").get(id);
    if (!row) throw new Error("Project is not registered on this machine");
    return row as unknown as HostProject;
  }

  projects(): HostProject[] {
    return this.db
      .prepare("SELECT * FROM projects ORDER BY name")
      .all() as unknown as HostProject[];
  }

  addProject(cwd: string, name: string): HostProject {
    this.db
      .prepare("INSERT OR IGNORE INTO projects VALUES (?, ?, ?)")
      .run(randomUUID(), cwd, name);
    return this.db
      .prepare("SELECT * FROM projects WHERE cwd=?")
      .get(cwd) as unknown as HostProject;
  }

  private remember(value: HostSession): HostSession {
    this.cache.delete(value.session.id);
    this.cache.set(value.session.id, value);
    this.cacheWeights.set(value.session.id, snapshotWeight(value));
    let bytes = [...this.cache.keys()].reduce((sum, id) => sum + (this.cacheWeights.get(id) ?? 0), 0);
    while (this.cache.size > CACHED_SESSIONS || bytes > 64 * 1024 * 1024) {
      // One active transcript is already owned by the engine. Keeping its
      // immutable reference avoids rehydrating a giant journal every token.
      if (this.cache.size === 1 && value.status === "running") break;
      const id = this.cache.keys().next().value!;
      bytes -= this.cacheWeights.get(id) ?? 0;
      this.cache.delete(id);
      this.cacheWeights.delete(id);
    }
    return value;
  }

  private find(id: string): HostSession | undefined {
    const unwritten = this.pending.get(id);
    if (unwritten) return unwritten.value;
    const cached = this.cache.get(id);
    if (cached) return this.remember(cached);
    const row = this.db
      .prepare("SELECT snapshot FROM sessions WHERE id=?")
      .get(id);
    if (!row) return undefined;
    let value = JSON.parse(String(row.snapshot)) as HostSession;
    const journal = this.db.prepare("SELECT * FROM session_journal WHERE session_id=?").get(id);
    if (journal && Number(journal.revision) > value.revision) {
      const blocks = new Map(value.session.blocks.map((block) => [block.id, block]));
      const revisions = { ...value.blockRevisions };
      for (const changed of this.db.prepare("SELECT * FROM session_journal_blocks WHERE session_id=?").all(id)) {
        blocks.set(String(changed.block_id), JSON.parse(String(changed.payload)));
        revisions[String(changed.block_id)] = Number(changed.revision);
      }
      const metadata = JSON.parse(String(journal.metadata)) as HostSession;
      const ids = JSON.parse(String(journal.block_ids)) as string[];
      value = { ...metadata, blockRevisions: Object.fromEntries(ids.map((blockId) => [blockId, revisions[blockId] ?? value.revision])),
        session: { ...metadata.session, blocks: ids.map((blockId) => {
          const block = blocks.get(blockId);
          if (!block) throw new Error("Incomplete session journal");
          return block;
        }) } };
    }
    return this.remember(value);
  }

  session(id: string): HostSession {
    const value = this.find(id);
    if (!value) throw new Error("Session not found on this machine");
    return value;
  }

  summaries(projectId: string): HostSessionSummary[] {
    return this.db
      .prepare("SELECT id, summary FROM sessions WHERE project_id=?")
      .all(projectId)
      .map((row) => {
        const unwritten = this.pending.get(String(row.id));
        if (unwritten) return summary(unwritten.value);
        const cached = row.summary
          ? (JSON.parse(String(row.summary)) as HostSessionSummary)
          : undefined;
        if (
          cached?.model &&
          cached.needsInput !== undefined &&
          cached.providerSessionId !== undefined
        )
          return cached;
        const fresh = summary(this.session(String(row.id)));
        this.db.prepare("UPDATE sessions SET summary=? WHERE id=?").run(
          JSON.stringify(fresh),
          String(row.id),
        );
        return fresh;
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  sync(id: string, revision?: number): SessionSync {
    const value = this.session(id);
    const { blockRevisions, ...snapshot } = value;
    if (revision === value.revision) return { kind: "unchanged", revision };
    if (revision === undefined || revision > value.revision || !blockRevisions)
      return { kind: "snapshot", value: snapshot };
    const {
      session: { blocks, ...session },
      ...rest
    } = snapshot;
    return {
      kind: "delta",
      base: revision,
      value: { ...rest, session },
      blockIds: blocks.map((block) => block.id),
      blocks: blocks.filter(
        (block) => (blockRevisions[block.id] ?? value.revision) > revision,
      ),
    };
  }

  /** Sessions taken over from this machine's desktop app, without parsing
   * their transcripts. */
  adopted(): {
    id: string;
    projectId: string;
    revision: number;
    updatedAt: number;
    status: HostSession["status"];
  }[] {
    const rows = new Map(
      this.db
        .prepare(
          `SELECT id, project_id, revision, updated_at, status
        FROM sessions WHERE has_desktop=1`,
        )
        .all()
        .map((row) => [
          String(row.id),
          {
            id: String(row.id),
            projectId: String(row.project_id),
            revision: Number(row.revision),
            updatedAt: Number(row.updated_at),
            status: String(row.status) as HostSession["status"],
          },
        ]),
    );
    for (const [id, { value }] of this.pending) {
      if (value.desktop == null) rows.delete(id);
      else
        rows.set(id, {
          id,
          projectId: value.projectId,
          revision: value.revision,
          updatedAt: value.updatedAt,
          status: value.status,
        });
    }
    return [...rows.values()];
  }

  /** Everything startup needs per session, without parsing transcripts. */
  startupStates(): {
    id: string;
    hasDesktop: boolean;
    running: boolean;
    shellRunning: boolean;
    providerSessionId: string | null;
    harness: string | null;
    cwd: string | null;
  }[] {
    return this.db
      .prepare(
        `SELECT id, has_desktop, status, shell_running, provider_session_id, harness, session_cwd
        FROM sessions ORDER BY updated_at DESC`,
      )
      .all()
      .map((row) => {
        const unwritten = this.pending.get(String(row.id))?.value;
        if (unwritten)
          return {
            id: unwritten.session.id,
            hasDesktop: unwritten.desktop != null,
            running: unwritten.status === "running",
            shellRunning: unwritten.session.blocks.some(
              (block) => block.shell?.running,
            ),
            providerSessionId: unwritten.session.providerSessionId || null,
            harness: unwritten.session.harness ?? null,
            cwd: unwritten.session.cwd ?? null,
          };
        return {
        id: String(row.id),
        hasDesktop: !!Number(row.has_desktop),
        running: row.status === "running",
        shellRunning: !!Number(row.shell_running),
        providerSessionId: row.provider_session_id
          ? String(row.provider_session_id)
          : null,
        harness: row.harness == null ? null : String(row.harness),
        cwd: row.session_cwd == null ? null : String(row.session_cwd),
        };
      });
  }

  sessions(projectId?: string): HostSession[] {
    const rows = projectId
      ? this.db
          .prepare("SELECT id, snapshot FROM sessions WHERE project_id=?")
          .all(projectId)
      : this.db.prepare("SELECT id, snapshot FROM sessions").all();
    return rows
      .map(
        (row) =>
          this.session(String(row.id)),
      )
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /** Returns the saved value, stamped with per-block change revisions.
   * `deferred` marks a save caused purely by streamed deltas: memory is
   * current at once, SQLite catches up at the next checkpoint. */
  save(
    input: HostSession,
    event: unknown,
    options: { deferred?: boolean } = {},
  ): HostSession {
    const previous = this.find(input.session.id);
    const value = {
      ...input,
      // Older snapshots have no creation time. Preserve their last recorded
      // timestamp when they are first written by this version of the host.
      createdAt:
        input.createdAt ?? previous?.createdAt ?? previous?.updatedAt ?? input.updatedAt,
      blockRevisions: blockRevisions(previous, input),
    };
    const id = value.session.id;
    const row = { revision: value.revision, event };
    if (options.deferred && previous) {
      const entry = this.pending.get(id) ?? { value, events: [] };
      entry.value = value;
      entry.events.push(row);
      this.pending.set(id, entry);
      this.arm(id, entry);
      return value;
    }
    // Pending soft state goes out in the same write, so the stored snapshot
    // never goes backwards and event rows stay in revision order.
    const entry = this.take(id);
    try {
      this.write(value, [...(entry?.events ?? []), row]);
    } catch (error) {
      if (entry) this.restore(entry);
      throw error;
    }
    return this.remember(value);
  }

  /** Writes every session whose latest state is still only in memory. */
  flushAll(): void {
    for (const id of [...this.pending.keys()]) this.flushPending(id);
    for (const row of this.db.prepare("SELECT session_id FROM session_journal").all())
      this.write(this.session(String(row.session_id)), []);
  }

  private flushPending(id: string): void {
    const entry = this.take(id);
    if (!entry) return;
    try {
      this.writeJournal(entry.value, entry.events);
    } catch (error) {
      this.restore(entry);
      throw error;
    }
    this.remember(entry.value);
  }

  private take(id: string): PendingWrite | undefined {
    const entry = this.pending.get(id);
    if (!entry) return undefined;
    clearTimeout(entry.timer);
    entry.timer = undefined;
    this.pending.delete(id);
    if (this.inTransaction) this.flushedInTransaction.push(entry);
    return entry;
  }

  /** Puts back state whose write failed or was rolled back. */
  private restore(entry: PendingWrite): void {
    const id = entry.value.session.id;
    const newer = this.pending.get(id);
    if (newer === entry) return;
    if (newer) {
      newer.events = [...entry.events, ...newer.events];
      return;
    }
    this.pending.set(id, entry);
    this.arm(id, entry);
  }

  private arm(id: string, entry: PendingWrite): void {
    if (entry.timer) return;
    entry.timer = setTimeout(() => {
      entry.timer = undefined;
      try {
        this.flushPending(id);
      } catch (error) {
        // Stays pending and is retried; a timer must never take the host down.
        console.error(
          "Session checkpoint failed:",
          error instanceof Error ? error.message : "unknown error",
        );
      }
    }, CHECKPOINT_MS);
    entry.timer.unref?.();
  }

  private write(
    value: HostSession,
    rows: { revision: number; event: unknown }[],
  ): void {
    const run = () => {
      this.db
        .prepare(
          `INSERT INTO sessions (id, project_id, snapshot, summary, has_desktop, revision, updated_at, status, provider_session_id, harness, session_cwd, shell_running) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET snapshot=excluded.snapshot, summary=excluded.summary, has_desktop=excluded.has_desktop, revision=excluded.revision, updated_at=excluded.updated_at, status=excluded.status, provider_session_id=excluded.provider_session_id, harness=excluded.harness, session_cwd=excluded.session_cwd, shell_running=excluded.shell_running`,
        )
        .run(
          value.session.id,
          value.projectId,
          JSON.stringify(value),
          JSON.stringify(summary(value)),
          value.desktop == null ? 0 : 1,
          value.revision,
          value.updatedAt,
          value.status,
          value.session.providerSessionId || null,
          value.session.harness ?? null,
          value.session.cwd ?? null,
          value.session.blocks.some((block) => block.shell?.running) ? 1 : 0,
        );
      const insert = this.db.prepare("INSERT INTO events VALUES (?, ?, ?)");
      for (const row of rows)
        insert.run(value.session.id, row.revision, JSON.stringify(row.event));
      this.db
        .prepare("DELETE FROM events WHERE session_id=? AND revision<?")
        .run(value.session.id, value.revision - 2_000);
      this.db.prepare("DELETE FROM session_journal WHERE session_id=?").run(value.session.id);
      this.db.prepare("DELETE FROM session_journal_blocks WHERE session_id=?").run(value.session.id);
    };
    if (this.inTransaction) run();
    else this.transaction(run);
    this.snapshotWrites++;
  }

  /** Streaming checkpoints serialize changed blocks only. Hard commands still
   * commit a full compatible checkpoint together with their receipt. */
  private writeJournal(value: HostSession, rows: { revision: number; event: unknown }[]): void {
    const id = value.session.id;
    const previous = this.db.prepare("SELECT revision FROM session_journal WHERE session_id=?").get(id)
      ?? this.db.prepare("SELECT revision FROM sessions WHERE id=?").get(id);
    const revision = Number(previous?.revision ?? -1);
    const { blockRevisions: _revisions, session: { blocks, ...session }, ...rest } = value;
    const run = () => {
      const writeBlock = this.db.prepare("INSERT INTO session_journal_blocks VALUES (?, ?, ?, ?) ON CONFLICT(session_id,block_id) DO UPDATE SET revision=excluded.revision,payload=excluded.payload");
      for (const block of blocks) {
        const stamp = value.blockRevisions?.[block.id] ?? value.revision;
        if (stamp > revision) writeBlock.run(id, block.id, stamp, JSON.stringify(block));
      }
      this.db.prepare("INSERT INTO session_journal VALUES (?, ?, ?, ?) ON CONFLICT(session_id) DO UPDATE SET revision=excluded.revision,metadata=excluded.metadata,block_ids=excluded.block_ids")
        .run(id, value.revision, JSON.stringify({ ...rest, session }), JSON.stringify(blocks.map((block) => block.id)));
      this.db.prepare("UPDATE sessions SET summary=?, revision=?, updated_at=?,status=? WHERE id=?")
        .run(JSON.stringify(summary(value)), value.revision, value.updatedAt, value.status, id);
      const insert = this.db.prepare("INSERT INTO events VALUES (?, ?, ?)");
      for (const row of rows) insert.run(id, row.revision, JSON.stringify(row.event));
      this.db.prepare("DELETE FROM events WHERE session_id=? AND revision<?").run(id, value.revision - 2_000);
    };
    if (this.inTransaction) run(); else this.transaction(run);
  }

  updateSession(
    id: string,
    patch: { title?: string; archived?: boolean; pinned?: boolean; linkedWorkItem?: LinkedWorkItem | null },
  ): HostSessionSummary {
    return this.transaction(() => {
      const current = this.session(id);
      if (patch.title !== undefined && (!patch.title.trim() || patch.title.length > 200))
        throw new Error("Invalid session title");
      const next = this.save(
        {
          ...current,
          revision: current.revision + 1,
          archived: patch.archived ?? current.archived,
          pinned: patch.pinned ?? current.pinned,
          session: {
            ...current.session,
            ...(patch.title === undefined ? {} : { title: patch.title.trim() }),
            ...(patch.linkedWorkItem === undefined
              ? {}
              : { linkedWorkItem: patch.linkedWorkItem ?? undefined }),
          },
        },
        { type: "session.metadata", patch },
      );
      return summary(next);
    });
  }

  deleteSession(id: string): void {
    this.transaction(() => {
      const current = this.session(id);
      if (current.status === "running")
        throw new Error("Stop this session before deleting it");
      this.take(id);
      this.db.prepare("DELETE FROM events WHERE session_id=?").run(id);
      this.db.prepare("DELETE FROM sessions WHERE id=?").run(id);
      this.cache.delete(id);
    });
  }

  receipt(id: string, signature: string): CommandReceipt | undefined {
    const row = this.db.prepare("SELECT * FROM receipts WHERE id=?").get(id);
    if (!row) return undefined;
    if (row.signature !== signature)
      throw new Error("Command ID was already used with a different payload");
    return JSON.parse(String(row.receipt)) as CommandReceipt;
  }

  recordReceipt(signature: string, receipt: CommandReceipt): void {
    this.db
      .prepare(
        "INSERT INTO receipts (id, signature, receipt, created_at) VALUES (?, ?, ?, ?)",
      )
      .run(receipt.commandId, signature, JSON.stringify(receipt), Date.now());
    if (++this.receiptWrites % RECEIPT_PRUNE_EVERY === 0) this.pruneReceipts();
  }

  /** Clients retry a command for seconds to minutes, never days. */
  pruneReceipts(now = Date.now()): void {
    this.db
      .prepare("DELETE FROM receipts WHERE created_at IS NULL OR created_at < ?")
      .run(now - RECEIPT_RETENTION_MS);
  }

  events(
    id: string,
    after: number,
  ): { snapshot?: HostSession; events?: unknown[]; revision: number } {
    const snapshot = this.session(id);
    const rows: { revision: number; event: unknown }[] = this.db
      .prepare(
        "SELECT revision, payload FROM events WHERE session_id=? AND revision>? ORDER BY revision",
      )
      .all(id, after)
      .map((row) => ({
        revision: Number(row.revision),
        event: JSON.parse(String(row.payload)),
      }));
    // Event rows of unwritten soft saves are newer than every stored row.
    for (const row of this.pending.get(id)?.events ?? [])
      if (row.revision > after) rows.push(row);
    if (
      after > snapshot.revision ||
      (after < snapshot.revision && Number(rows[0]?.revision) !== after + 1)
    ) {
      return { snapshot, revision: snapshot.revision };
    }
    return {
      events: rows,
      revision: snapshot.revision,
    };
  }

  issueDevice(name: string): { id: string; token: string } {
    const id = randomUUID();
    const token = randomBytes(32).toString("base64url");
    this.db
      .prepare("INSERT INTO devices VALUES (?, ?, ?)")
      .run(id, name, this.hash(token));
    return { id, token };
  }

  revokeDevice(id: string): boolean {
    return (
      Number(
        this.db.prepare("DELETE FROM devices WHERE id=?").run(id).changes,
      ) > 0
    );
  }

  /** Lets a desktop revoke only the credential it is using. */
  revokeToken(token: string): boolean {
    return (
      Number(
        this.db
          .prepare("DELETE FROM devices WHERE hash=?")
          .run(this.hash(token)).changes,
      ) > 0
    );
  }

  authenticated(token: string): boolean {
    return !!this.db
      .prepare("SELECT id FROM devices WHERE hash=?")
      .get(this.hash(token));
  }

  private hash(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }
  close(): void {
    try {
      this.flushAll();
    } finally {
      this.db.close();
    }
  }
}

export function summary(value: HostSession): HostSessionSummary {
  return {
    projectId: value.projectId,
    revision: value.revision,
    runId: value.runId,
    status: value.status,
    updatedAt: value.updatedAt,
    id: value.session.id,
    cwd: value.session.cwd,
    title: value.session.title,
    harness: value.session.harness as RemoteProvider,
    model: value.session.model,
    runtimeMode: value.session.runtimeMode,
    providerSessionId: value.session.providerSessionId ?? null,
    createdAt: value.createdAt ?? value.updatedAt,
    archived: value.archived,
    pinned: value.pinned,
    linkedWorkItem: value.session.linkedWorkItem,
    needsInput: sessionNeedsInput(value.session),
    draft: value.session.blocks.some((block) => block.role === "user" && block.draft),
  };
}

/** Unchanged blocks keep their previous stamp. Identity is the fast path;
 * values re-read from disk fall back to a structural comparison. */
export function blockRevisions(
  previous: HostSession | undefined,
  next: HostSession,
): Record<string, number> {
  const before = new Map(
    previous?.session.blocks.map((block) => [block.id, block]),
  );
  const revisions: Record<string, number> = {};
  for (const block of next.session.blocks) {
    const old = before.get(block.id);
    const stamp = previous?.blockRevisions?.[block.id];
    revisions[block.id] =
      old &&
      stamp !== undefined &&
      (old === block || JSON.stringify(old) === JSON.stringify(block))
        ? stamp
        : next.revision;
  }
  return revisions;
}
