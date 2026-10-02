# Project/group sync across paired machines Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep recent/archived projects, project groups, group↔project
assignments, rail order/pinned state, and the group-lock password in sync
between this desktop and a paired remote machine's own desktop, in both
directions, automatically, using the existing SSH-tunnel + host RPC channel
as the transport.

**Architecture:** The host process already running on the paired machine
(`host/`) gains a small generic revisioned key-value store and two RPC
methods, `sync.pull`/`sync.push`. Both desktops are sync *clients* against
that one store: this desktop reaches it through the existing
`remote_request`/SSH tunnel; the remote machine's own desktop reaches the
same host over loopback, after a new Rust command silently links it there
the same way the SSH bootstrap already pairs a desktop (`monocode-host pair
--json`), just run as a local process instead of over SSH. Conflicts
resolve as last-write-wins per record, using a revision the host assigns on
every write; each desktop keeps a small persisted "what I've seen" cache
and outbox so edits made offline flush on reconnect.

**Tech Stack:** TypeScript/React (desktop UI, `src/`), Node.js + `node:sqlite`
(host, `host/`), Rust + Tauri 2 (`src-tauri/`). Tests: Vitest
(`npm run check:web`) for TS, the host's own Vitest suite
(`npm run test:host`), `cargo test` for Rust.

## Global Constraints

- v1 supports exactly one paired remote machine (no multi-machine mesh).
- No new encryption primitive: transport confidentiality is the existing
  SSH tunnel or OS loopback. The group lock's existing PBKDF2-SHA256
  verifier (600k iterations, `src/features/group-lock/model/passwordRecord.ts`)
  is reused as-is; only the single app-wide `record` field syncs, never a
  plaintext password.
- `remote://` recents entries (projects opened via "open folder on a
  machine") are excluded from this sync feature; they already carry a
  portable `environmentId` and are unaffected.
- Conflict resolution is last-write-wins per record (host-assigned
  revision, optimistic concurrency). No 3-way merge.
- This plan covers the sync *data engine* end-to-end (both directions,
  fully working and tested) and the local-host auto-pairing. It does
  **not** include a rail-UI placeholder row for a project known only on
  another machine (that touches `useRailSections.tsx` / rail row
  components not reviewed for this plan) — Task 13's note calls this out
  as a follow-up.
- Full design: `docs/superpowers/specs/2026-10-02-project-group-sync-design.md`.

---

### Task 1: Shared sync protocol types

**Files:**
- Create: `src/features/sync/model/syncProtocol.ts`
- Test: `src/features/sync/model/syncProtocol.test.ts`

**Interfaces:**
- Produces: `SyncTable`, `SyncRecordValue` (union of `SyncProjectValue |
  SyncProjectPathValue | SyncGroupValue | SyncAssignmentValue |
  SyncRailLayoutValue | SyncLockValue`), `SyncRecord`, `SyncOp`,
  `SyncPullResult`, `SyncPushResult`, and `parseSyncRecord(value: unknown):
  SyncRecord | null` — used by every later task, on both the host and the
  desktop.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { parseSyncRecord } from "./syncProtocol";

describe("parseSyncRecord", () => {
  it("accepts a well-formed record", () => {
    const record = parseSyncRecord({
      table: "group",
      id: "g1",
      rev: 3,
      value: { id: "g1", name: "Work", collapsed: false },
    });
    expect(record).toEqual({
      table: "group",
      id: "g1",
      rev: 3,
      value: { id: "g1", name: "Work", collapsed: false },
    });
  });

  it("accepts a tombstone (deleted record)", () => {
    expect(parseSyncRecord({ table: "group", id: "g1", rev: 4, value: null }))
      .toEqual({ table: "group", id: "g1", rev: 4, value: null });
  });

  it("rejects an unknown table, a missing id, or a non-integer revision", () => {
    expect(parseSyncRecord({ table: "bogus", id: "x", rev: 1, value: null })).toBeNull();
    expect(parseSyncRecord({ table: "group", id: "", rev: 1, value: null })).toBeNull();
    expect(parseSyncRecord({ table: "group", id: "g1", rev: 1.5, value: null })).toBeNull();
    expect(parseSyncRecord(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/sync/model/syncProtocol.test.ts`
Expected: FAIL with "Cannot find module './syncProtocol'"

- [ ] **Step 3: Write minimal implementation**

```typescript
/**
 * Wire types for library sync between this desktop and a paired machine's
 * host. Shared by `host/sync.ts` (the authoritative store) and every
 * `src/features/sync/model/*` client module. A table's `value` shape is
 * opaque here on purpose: each table's own module (syncProjects,
 * syncGroups, syncLock) validates its own fields before trusting them.
 */
export const SYNC_TABLES = [
  "project",
  "projectPath",
  "group",
  "assignment",
  "railLayout",
  "lock",
] as const;

export type SyncTable = (typeof SYNC_TABLES)[number];

export type SyncProjectValue = { id: string; createdAt: number };
export type SyncProjectPathValue = {
  projectId: string;
  machineId: string;
  path: string;
  archived: boolean;
};
export type SyncGroupValue = {
  id: string;
  name: string;
  collapsed: boolean;
  colorIndex?: number;
  customColor?: string;
  mascot?: string;
  workspaceFile?: string;
  workspaceFolders?: string[];
  lockable?: boolean;
};
export type SyncAssignmentValue = { projectId: string; groupId: string };
export type SyncRailLayoutValue = { order: string[]; pinned: string[] };
export type SyncLockValue = { record: unknown | null };

export type SyncRecordValue =
  | SyncProjectValue
  | SyncProjectPathValue
  | SyncGroupValue
  | SyncAssignmentValue
  | SyncRailLayoutValue
  | SyncLockValue;

/** One row in the host's sync store. `value === null` is a tombstone: the
 * record existed at an earlier revision and was deleted. */
export type SyncRecord = {
  table: SyncTable;
  id: string;
  rev: number;
  value: SyncRecordValue | null;
};

/** A pending local change, sent to `sync.push`. `baseRev` is the revision
 * this device last saw for this exact record (0 for one it has never seen),
 * so the host can tell a stale edit from a fresh one. */
export type SyncOp = {
  table: SyncTable;
  id: string;
  baseRev: number;
  value: SyncRecordValue | null;
};

export type SyncPullResult = { rev: number; records: SyncRecord[] };
export type SyncPushResult = {
  rev: number;
  applied: { table: SyncTable; id: string; rev: number }[];
  rejected: { table: SyncTable; id: string; current: SyncRecord }[];
};

function isSyncTable(value: unknown): value is SyncTable {
  return typeof value === "string" && (SYNC_TABLES as readonly string[]).includes(value);
}

/** A record read back from the host, or `null` when it is malformed. The
 * value's own shape is not re-validated here; each table's module does
 * that against the fields it actually reads. */
export function parseSyncRecord(value: unknown): SyncRecord | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<SyncRecord>;
  if (!isSyncTable(raw.table)) return null;
  if (typeof raw.id !== "string" || !raw.id) return null;
  if (!Number.isInteger(raw.rev)) return null;
  if (raw.value !== null && (typeof raw.value !== "object" || Array.isArray(raw.value)))
    return null;
  return { table: raw.table, id: raw.id, rev: raw.rev as number, value: raw.value ?? null };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/sync/model/syncProtocol.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/features/sync/model/syncProtocol.ts src/features/sync/model/syncProtocol.test.ts
git commit -m "feat(sync): add shared sync protocol types"
```

---

### Task 2: Host sync store

**Files:**
- Modify: `host/store.ts:30-36` (add the `sync_records` table to the schema)
- Create: `host/sync.ts`
- Test: `host/sync.test.ts`

**Interfaces:**
- Consumes: `SyncOp`, `SyncRecord`, `SyncPullResult`, `SyncPushResult`,
  `SyncTable` from `../src/features/sync/model/syncProtocol` (Task 1).
- Produces: `syncPull(db: DatabaseSync, sinceRev: number): SyncPullResult`
  and `syncPush(db: DatabaseSync, ops: SyncOp[]): SyncPushResult`, both
  operating on a `DatabaseSync` such as `HostStore.db` — used by Task 3.

- [ ] **Step 1: Write the failing test**

```typescript
// host/sync.test.ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { HostStore } from "./store";
import { syncPull, syncPush } from "./sync";

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function setup() {
  const directory = mkdtempSync(join(tmpdir(), "monocode-sync-test-"));
  const store = new HostStore(join(directory, "host.db"));
  cleanups.push(() => {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return store;
}

describe("syncPush / syncPull", () => {
  it("accepts a brand-new record and reports it as applied", () => {
    const store = setup();
    const result = syncPush(store.db, [
      { table: "group", id: "g1", baseRev: 0, value: { id: "g1", name: "Work", collapsed: false } },
    ]);
    expect(result.rejected).toEqual([]);
    expect(result.applied).toEqual([{ table: "group", id: "g1", rev: result.rev }]);
  });

  it("rejects a push based on a stale revision and returns the current value", () => {
    const store = setup();
    const first = syncPush(store.db, [
      { table: "group", id: "g1", baseRev: 0, value: { id: "g1", name: "Work", collapsed: false } },
    ]);
    const firstRev = first.applied[0].rev;
    // A second push based on revision 0 again, after the record moved to firstRev.
    const second = syncPush(store.db, [
      { table: "group", id: "g1", baseRev: 0, value: { id: "g1", name: "Renamed", collapsed: false } },
    ]);
    expect(second.applied).toEqual([]);
    expect(second.rejected).toEqual([
      {
        table: "group",
        id: "g1",
        current: { table: "group", id: "g1", rev: firstRev, value: { id: "g1", name: "Work", collapsed: false } },
      },
    ]);
  });

  it("accepts a push based on the current revision, bumping it further", () => {
    const store = setup();
    const first = syncPush(store.db, [
      { table: "group", id: "g1", baseRev: 0, value: { id: "g1", name: "Work", collapsed: false } },
    ]);
    const second = syncPush(store.db, [
      {
        table: "group",
        id: "g1",
        baseRev: first.applied[0].rev,
        value: { id: "g1", name: "Renamed", collapsed: false },
      },
    ]);
    expect(second.rejected).toEqual([]);
    expect(second.applied[0].rev).toBeGreaterThan(first.applied[0].rev);
  });

  it("a tombstone (value: null) deletes the record", () => {
    const store = setup();
    const first = syncPush(store.db, [
      { table: "group", id: "g1", baseRev: 0, value: { id: "g1", name: "Work", collapsed: false } },
    ]);
    syncPush(store.db, [{ table: "group", id: "g1", baseRev: first.applied[0].rev, value: null }]);
    const pulled = syncPull(store.db, 0);
    expect(pulled.records.at(-1)).toMatchObject({ table: "group", id: "g1", value: null });
  });

  it("syncPull returns only records newer than the given revision, in order", () => {
    const store = setup();
    syncPush(store.db, [
      { table: "group", id: "g1", baseRev: 0, value: { id: "g1", name: "A", collapsed: false } },
    ]);
    const after = syncPull(store.db, 0).rev;
    syncPush(store.db, [
      { table: "group", id: "g2", baseRev: 0, value: { id: "g2", name: "B", collapsed: false } },
    ]);
    const pulled = syncPull(store.db, after);
    expect(pulled.records).toHaveLength(1);
    expect(pulled.records[0].id).toBe("g2");
  });

  it("two different records can be pushed in one call independently of each other", () => {
    const store = setup();
    const result = syncPush(store.db, [
      { table: "group", id: "g1", baseRev: 0, value: { id: "g1", name: "A", collapsed: false } },
      { table: "assignment", id: "p1", baseRev: 0, value: { projectId: "p1", groupId: "g1" } },
    ]);
    expect(result.applied).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run host/sync.test.ts`
Expected: FAIL with "Cannot find module './sync'"

- [ ] **Step 3: Write minimal implementation**

First add the table (`host/store.ts`, inside the existing `this.db.exec(...)`
template string at line 30-36):

```typescript
      CREATE TABLE IF NOT EXISTS devices (id TEXT PRIMARY KEY, name TEXT NOT NULL, hash TEXT NOT NULL UNIQUE);
      CREATE TABLE IF NOT EXISTS sync_records (table_name TEXT NOT NULL, id TEXT NOT NULL, value TEXT, rev INTEGER NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (table_name, id));`);
```

(This replaces the existing trailing `devices` line and the closing
backtick+parenthesis two lines below it; everything else in that
`this.db.exec(...)` call is unchanged.)

Then create `host/sync.ts`:

```typescript
import type { DatabaseSync } from "node:sqlite";
import type {
  SyncOp,
  SyncPullResult,
  SyncPushResult,
  SyncRecord,
  SyncRecordValue,
  SyncTable,
} from "../src/features/sync/model/syncProtocol";

function currentRev(db: DatabaseSync): number {
  const row = db.prepare("SELECT value FROM metadata WHERE key='syncRev'").get();
  return row ? Number(row.value) : 0;
}

/** Bumps and returns the store's global revision counter. Every accepted
 * write gets a fresh one, so a pull can ask for "everything after N". */
function bumpRev(db: DatabaseSync): number {
  db.prepare(
    "INSERT INTO metadata VALUES ('syncRev', '1') ON CONFLICT(key) DO UPDATE SET value = CAST((CAST(value AS INTEGER) + 1) AS TEXT)",
  ).run();
  return currentRev(db);
}

function readRecord(db: DatabaseSync, table: SyncTable, id: string): SyncRecord | undefined {
  const row = db
    .prepare("SELECT table_name, id, value, rev FROM sync_records WHERE table_name=? AND id=?")
    .get(table, id);
  if (!row) return undefined;
  return {
    table: String(row.table_name) as SyncTable,
    id: String(row.id),
    rev: Number(row.rev),
    value: row.value === null ? null : (JSON.parse(String(row.value)) as SyncRecordValue),
  };
}

/** Every record the host has accepted since `sinceRev`, oldest first. */
export function syncPull(db: DatabaseSync, sinceRev: number): SyncPullResult {
  const rows = db
    .prepare("SELECT table_name, id, value, rev FROM sync_records WHERE rev > ? ORDER BY rev")
    .all(sinceRev);
  return {
    rev: currentRev(db),
    records: rows.map((row) => ({
      table: String(row.table_name) as SyncTable,
      id: String(row.id),
      rev: Number(row.rev),
      value: row.value === null ? null : (JSON.parse(String(row.value)) as SyncRecordValue),
    })),
  };
}

/**
 * Applies each op whose `baseRev` matches the record's current revision
 * (optimistic concurrency); an op based on a stale revision is rejected and
 * returned with the record's current value, so the caller can adopt it.
 * Ops for different records in one call are independent of each other.
 */
export function syncPush(db: DatabaseSync, ops: SyncOp[]): SyncPushResult {
  const applied: SyncPushResult["applied"] = [];
  const rejected: SyncPushResult["rejected"] = [];
  for (const op of ops) {
    const existing = readRecord(db, op.table, op.id);
    if ((existing?.rev ?? 0) !== op.baseRev) {
      rejected.push({
        table: op.table,
        id: op.id,
        current: existing ?? { table: op.table, id: op.id, rev: 0, value: null },
      });
      continue;
    }
    const rev = bumpRev(db);
    db.prepare(
      "INSERT INTO sync_records (table_name, id, value, rev, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(table_name, id) DO UPDATE SET value=excluded.value, rev=excluded.rev, updated_at=excluded.updated_at",
    ).run(op.table, op.id, op.value === null ? null : JSON.stringify(op.value), rev, Date.now());
    applied.push({ table: op.table, id: op.id, rev });
  }
  return { rev: currentRev(db), applied, rejected };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run host/sync.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add host/store.ts host/sync.ts host/sync.test.ts
git commit -m "feat(host): add generic revisioned sync store"
```

---

### Task 3: Host RPC wiring

**Files:**
- Modify: `host/server.ts:251-294` (capabilities list) and
  `host/server.ts:408-410` (switch statement, add two cases next to
  `commands.dispatch`)
- Test: `host/server.test.ts` (append; existing `setup()` helper is reused
  as-is, see Task 2's companion file for the pattern it already follows)

**Interfaces:**
- Consumes: `syncPull`, `syncPush` from `./sync` (Task 2); `SyncOp` from
  `../src/features/connections/model/protocol` — actually from
  `../src/features/sync/model/syncProtocol` (Task 1).
- Produces: RPC methods `sync.pull` and `sync.push`, reachable through the
  same `/rpc` endpoint as every other host method.

- [ ] **Step 1: Write the failing test**

Append to `host/server.test.ts` (inside the existing `describe("remote host
API", ...)` block, using the file's existing `setup()` helper and `call()`
client — see `host/server.test.ts:35-116` for what `call` does: it POSTs
`{version, environmentId, method, params}` with a bearer token and returns
`{status, value}`):

```typescript
  it("accepts sync pushes and pulls, rejecting a stale push", async () => {
    const s = await setup();
    const pushed = await s.call("sync.push", {
      ops: [{ table: "group", id: "g1", baseRev: 0, value: { id: "g1", name: "Work", collapsed: false } }],
    });
    expect(pushed.value.result.applied).toEqual([{ table: "group", id: "g1", rev: pushed.value.result.rev }]);

    const pulled = await s.call("sync.pull", { sinceRev: 0 });
    expect(pulled.value.result.records).toEqual([
      { table: "group", id: "g1", rev: pushed.value.result.rev, value: { id: "g1", name: "Work", collapsed: false } },
    ]);

    const stale = await s.call("sync.push", {
      ops: [{ table: "group", id: "g1", baseRev: 0, value: { id: "g1", name: "Renamed", collapsed: false } }],
    });
    expect(stale.value.result.applied).toEqual([]);
    expect(stale.value.result.rejected).toHaveLength(1);
  });

  it("advertises the sync capability", async () => {
    const s = await setup();
    const described = await s.call("environment.describe");
    expect(described.value.result.capabilities).toContain("sync");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run host/server.test.ts -t "sync"`
Expected: FAIL with "Unsupported host method"

- [ ] **Step 3: Write minimal implementation**

In `host/server.ts`, add the import near the top (alongside the other
local imports around line 19):

```typescript
import { syncPull, syncPush } from "./sync";
import type { SyncOp } from "../src/features/sync/model/syncProtocol";
```

Add `"sync"` to the `capabilities` array (inside the `environment.describe`
case, right after `"sessions.plan"`):

```typescript
              "sessions.plan",
              "sync",
            ],
```

Add two cases to the `switch (input.method)` block, next to
`"commands.dispatch"`:

```typescript
          case "sync.pull": {
            const sinceRev = Number.isSafeInteger(params.sinceRev) ? Number(params.sinceRev) : 0;
            result = syncPull(engine.store.db, sinceRev);
            break;
          }
          case "sync.push": {
            if (!Array.isArray(params.ops)) throw new Error("Invalid sync ops");
            result = syncPush(engine.store.db, params.ops as SyncOp[]);
            break;
          }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run host/server.test.ts -t "sync"`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add host/server.ts host/server.test.ts
git commit -m "feat(host): expose sync.pull and sync.push over RPC"
```

---

### Task 4: Rust allow-list for the sync methods

**Files:**
- Modify: `src-tauri/src/remote.rs:472-507` (`supported_remote_method`)
  and its test at `src-tauri/src/remote.rs:794-808`
  (`desktop_forwards_supported_host_operations`)

**Interfaces:**
- Produces: `remote_request` now forwards `"sync.pull"` and `"sync.push"`,
  so `src/features/connections/model/connections.ts::remoteRequest` (the
  existing generic client, unchanged) can call them against any paired
  machine — used by Task 10.

- [ ] **Step 1: Write the failing test**

Extend the existing test at `src-tauri/src/remote.rs:795-808`:

```rust
    #[test]
    fn desktop_forwards_supported_host_operations() {
        for method in [
            "git.branches",
            "git.switch",
            "git.createBranch",
            "git.worktrees",
            "git.worktreeCreate",
            "attachments.upload",
            "attachments.read",
            "sync.pull",
            "sync.push",
        ] {
            assert!(supported_remote_method(method), "{method}");
        }
        assert!(!supported_remote_method("git.arbitrary"));
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --manifest-path src-tauri/Cargo.toml desktop_forwards_supported_host_operations`
Expected: FAIL — `"sync.pull"` assertion panics

- [ ] **Step 3: Write minimal implementation**

In `src-tauri/src/remote.rs:472-507`, add the two methods to the `matches!`
list (next to `"git.action"`):

```rust
fn supported_remote_method(method: &str) -> bool {
    matches!(
        method,
        "environment.describe"
            | "projects.list"
            | "projects.browse"
            | "projects.open"
            | "models.list"
            | "sessions.list"
            | "sessions.update"
            | "sessions.delete"
            | "sessions.sync"
            | "sessions.syncChunk"
            | "commands.dispatch"
            | "attachments.upload"
            | "attachments.read"
            | "devices.revokeSelf"
            | "git.diff"
            | "git.branches"
            | "git.switch"
            | "git.createBranch"
            | "git.worktrees"
            | "git.worktreeCreate"
            | "files.read"
            | "files.list"
            | "files.index"
            | "workspace.run"
            | "files.search"
            | "files.searchContent"
            | "files.create"
            | "files.write"
            | "git.index"
            | "git.fileDiff"
            | "git.action"
            | "sync.pull"
            | "sync.push"
    )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test --manifest-path src-tauri/Cargo.toml desktop_forwards_supported_host_operations`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/remote.rs
git commit -m "feat(desktop): allow sync.pull/sync.push through remote_request"
```

---

### Task 5: Local machine id

**Files:**
- Create: `src/features/sync/model/syncMachineId.ts`
- Test: `src/features/sync/model/syncMachineId.test.ts`

**Interfaces:**
- Produces: `localMachineId(): string` — stable across restarts, used by
  every later task that records "which machine wrote this path/record".

- [ ] **Step 1: Write the failing test**

```typescript
import { beforeEach, describe, expect, it } from "vitest";
import { localMachineId } from "./syncMachineId";

function mockLocalStorage() {
  const data = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value),
      removeItem: (key: string) => void data.delete(key),
    },
    configurable: true,
  });
}

describe("localMachineId", () => {
  beforeEach(mockLocalStorage);

  it("returns the same id on repeated calls", () => {
    expect(localMachineId()).toBe(localMachineId());
  });

  it("persists the id so a fresh module load would see the same one", () => {
    const id = localMachineId();
    expect(localStorage.getItem("monocode.sync.machineId")).toBe(id);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/sync/model/syncMachineId.test.ts`
Expected: FAIL with "Cannot find module './syncMachineId'"

- [ ] **Step 3: Write minimal implementation**

```typescript
const KEY = "monocode.sync.machineId";
let cached: string | null = null;

function randomId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `machine-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
  );
}

/** This desktop's stable id within the synced library, created once. Every
 * participating machine needs one, including the one a host runs on, so a
 * project's per-machine path map can tell them apart. */
export function localMachineId(): string {
  if (cached) return cached;
  try {
    const stored = localStorage.getItem(KEY);
    if (stored) {
      cached = stored;
      return cached;
    }
  } catch {
    // private mode / quota: fall through to an unsaved id for this session
  }
  const fresh = randomId();
  try {
    localStorage.setItem(KEY, fresh);
  } catch {
    // ignored; this session keeps its id in memory only
  }
  cached = fresh;
  return cached;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/sync/model/syncMachineId.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/features/sync/model/syncMachineId.ts src/features/sync/model/syncMachineId.test.ts
git commit -m "feat(sync): add stable per-desktop machine id"
```

---

### Task 6: Per-peer outbox and revision cache

**Files:**
- Create: `src/features/sync/model/syncPeerState.ts`
- Test: `src/features/sync/model/syncPeerState.test.ts`

**Interfaces:**
- Consumes: `SyncRecord`, `SyncRecordValue`, `SyncTable`,
  `SyncPushResult` from `./syncProtocol` (Task 1).
- Produces: `loadPeerState(machineId)`, `queueLocalChange(machineId, table,
  id, value)`, `takeOutbox(machineId): SyncOp[]`,
  `applyPushResult(machineId, result: SyncPushResult): SyncRecord[]`
  (returns the records whose rejection means "adopt this value locally"),
  `markPulled(machineId, records: SyncRecord[])`, `peerRev(machineId):
  number` — used by Tasks 7-10 and the orchestration loop in Task 10.

- [ ] **Step 1: Write the failing test**

```typescript
import { beforeEach, describe, expect, it } from "vitest";
import {
  applyPushResult,
  loadPeerState,
  markPulled,
  peerRev,
  queueLocalChange,
  takeOutbox,
} from "./syncPeerState";

function mockLocalStorage() {
  const data = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value),
      removeItem: (key: string) => void data.delete(key),
    },
    configurable: true,
  });
}

const MACHINE = "host-1";

describe("syncPeerState", () => {
  beforeEach(mockLocalStorage);

  it("starts at revision 0 with an empty outbox", () => {
    expect(peerRev(MACHINE)).toBe(0);
    expect(takeOutbox(MACHINE)).toEqual([]);
  });

  it("queues a local change with baseRev 0 for a record never seen before", () => {
    queueLocalChange(MACHINE, "group", "g1", { id: "g1", name: "Work", collapsed: false });
    expect(takeOutbox(MACHINE)).toEqual([
      { table: "group", id: "g1", baseRev: 0, value: { id: "g1", name: "Work", collapsed: false } },
    ]);
  });

  it("a second local edit before pushing replaces the value but keeps the original baseRev", () => {
    markPulled(MACHINE, [{ table: "group", id: "g1", rev: 5, value: { id: "g1", name: "Old", collapsed: false } }]);
    queueLocalChange(MACHINE, "group", "g1", { id: "g1", name: "First edit", collapsed: false });
    queueLocalChange(MACHINE, "group", "g1", { id: "g1", name: "Second edit", collapsed: false });
    expect(takeOutbox(MACHINE)).toEqual([
      { table: "group", id: "g1", baseRev: 5, value: { id: "g1", name: "Second edit", collapsed: false } },
    ]);
  });

  it("markPulled advances the peer revision and remembers each record's revision", () => {
    markPulled(MACHINE, [{ table: "group", id: "g1", rev: 2, value: null }]);
    expect(peerRev(MACHINE)).toBe(2);
    // A local edit made after this pull is based on the pulled revision.
    queueLocalChange(MACHINE, "group", "g1", { id: "g1", name: "New", collapsed: false });
    expect(takeOutbox(MACHINE)[0].baseRev).toBe(2);
  });

  it("applyPushResult returns rejected records to adopt and clears applied/rejected from the outbox", () => {
    queueLocalChange(MACHINE, "group", "g1", { id: "g1", name: "Mine", collapsed: false });
    queueLocalChange(MACHINE, "group", "g2", { id: "g2", name: "Also mine", collapsed: false });
    const toAdopt = applyPushResult(MACHINE, {
      rev: 9,
      applied: [{ table: "group", id: "g2", rev: 9 }],
      rejected: [
        { table: "group", id: "g1", current: { table: "group", id: "g1", rev: 7, value: { id: "g1", name: "Theirs", collapsed: false } } },
      ],
    });
    expect(toAdopt).toEqual([{ table: "group", id: "g1", rev: 7, value: { id: "g1", name: "Theirs", collapsed: false } }]);
    expect(takeOutbox(MACHINE)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/sync/model/syncPeerState.test.ts`
Expected: FAIL with "Cannot find module './syncPeerState'"

- [ ] **Step 3: Write minimal implementation**

```typescript
import type { SyncOp, SyncPushResult, SyncRecord, SyncRecordValue, SyncTable } from "./syncProtocol";

type OutboxEntry = { table: SyncTable; id: string; baseRev: number; value: SyncRecordValue | null };
type PeerState = { rev: number; recordRevs: Record<string, number>; outbox: OutboxEntry[] };

const keyFor = (machineId: string) => `monocode.sync.peer:${machineId}`;
const recordKey = (table: SyncTable, id: string) => `${table}:${id}`;

function emptyState(): PeerState {
  return { rev: 0, recordRevs: {}, outbox: [] };
}

function load(machineId: string): PeerState {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(keyFor(machineId)) ?? "null");
    if (!parsed || typeof parsed !== "object") return emptyState();
    const raw = parsed as Partial<PeerState>;
    return {
      rev: typeof raw.rev === "number" ? raw.rev : 0,
      recordRevs: raw.recordRevs && typeof raw.recordRevs === "object" ? raw.recordRevs : {},
      outbox: Array.isArray(raw.outbox) ? raw.outbox : [],
    };
  } catch {
    return emptyState();
  }
}

function save(machineId: string, state: PeerState): void {
  try {
    localStorage.setItem(keyFor(machineId), JSON.stringify(state));
  } catch {
    // private mode / quota: this peer's sync falls behind until storage frees up
  }
}

/** This machine's full cached state for one peer, mainly for tests/debugging. */
export function loadPeerState(machineId: string): PeerState {
  return load(machineId);
}

export function peerRev(machineId: string): number {
  return load(machineId).rev;
}

/**
 * Queues a local edit. A record this peer has never shown us gets baseRev
 * 0; otherwise the last revision we saw for it. A second edit to the same
 * record before it is pushed keeps the *original* baseRev — it still
 * describes what the host last showed us, not what we last wrote.
 */
export function queueLocalChange(
  machineId: string,
  table: SyncTable,
  id: string,
  value: SyncRecordValue | null,
): void {
  const state = load(machineId);
  const index = state.outbox.findIndex((entry) => entry.table === table && entry.id === id);
  if (index === -1) {
    const baseRev = state.recordRevs[recordKey(table, id)] ?? 0;
    state.outbox = [...state.outbox, { table, id, baseRev, value }];
  } else {
    state.outbox = state.outbox.map((entry, i) => (i === index ? { ...entry, value } : entry));
  }
  save(machineId, state);
}

export function takeOutbox(machineId: string): SyncOp[] {
  return load(machineId).outbox.map(({ table, id, baseRev, value }) => ({ table, id, baseRev, value }));
}

/** Records a batch of records this peer just told us about: advances the
 * peer's revision watermark and each record's own last-known revision. */
export function markPulled(machineId: string, records: readonly SyncRecord[]): void {
  const state = load(machineId);
  for (const record of records) {
    state.recordRevs[recordKey(record.table, record.id)] = record.rev;
    state.rev = Math.max(state.rev, record.rev);
  }
  save(machineId, state);
}

/**
 * Settles a push: applied ops update this peer's record revisions and
 * leave the outbox; rejected ops are dropped from the outbox too (retrying
 * them unchanged would just be rejected again) and returned so the caller
 * can apply the host's current value locally instead.
 */
export function applyPushResult(machineId: string, result: SyncPushResult): SyncRecord[] {
  const state = load(machineId);
  const settled = new Set([
    ...result.applied.map((entry) => recordKey(entry.table, entry.id)),
    ...result.rejected.map((entry) => recordKey(entry.table, entry.id)),
  ]);
  state.outbox = state.outbox.filter((entry) => !settled.has(recordKey(entry.table, entry.id)));
  for (const entry of result.applied) state.recordRevs[recordKey(entry.table, entry.id)] = entry.rev;
  for (const entry of result.rejected) state.recordRevs[recordKey(entry.table, entry.id)] = entry.current.rev;
  state.rev = Math.max(state.rev, result.rev);
  save(machineId, state);
  return result.rejected.map((entry) => entry.current);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/sync/model/syncPeerState.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/features/sync/model/syncPeerState.ts src/features/sync/model/syncPeerState.test.ts
git commit -m "feat(sync): add per-peer outbox and revision cache"
```

---

### Task 7: Project sync (recents, rail order, pinned, archived)

**Files:**
- Modify: `src/features/projects/model/recents.ts` (add a local-write hook)
- Create: `src/features/sync/model/syncProjects.ts`
- Test: `src/features/sync/model/syncProjects.test.ts`

**Interfaces:**
- Consumes: `queueLocalChange`, `loadPeerState` from `./syncPeerState`
  (Task 6); `localMachineId` from `./syncMachineId` (Task 5); `SyncRecord`
  from `./syncProtocol` (Task 1); from `recents.ts`: `loadRecents`,
  `loadArchivedProjects`, `loadProjectRailOrder`, `loadPinnedProjects`,
  `saveProjectRailOrder`, `savePinnedProjects`, `isLocalProject`,
  `normalizeProjectPath`, `pathKey` (via `../../../shared/lib/paths`).
- Produces: `captureLocalProjectChanges(machineId): void` (reads the
  current local state and queues any local-path project whose path isn't
  yet mapped for this machine, plus the current rail-layout record, onto
  the outbox — called by the orchestration loop after every local mutation
  and before every push), `applyRemoteProjectRecords(machineId, records:
  readonly SyncRecord[]): void` (applies incoming `"project"`,
  `"projectPath"`, and `"railLayout"` records), `localProjectIdsByPath():
  Record<string, string>` (this machine's pathKey→projectId map, reused by
  Task 8 to resolve assignments), and `localPathKeyForProjectId(projectId:
  string): string | undefined` (the reverse lookup, same map inverted) —
  all four used by Tasks 8 and 10.

**Design note:** a local project's identity (`SyncProjectValue.id`) is
assigned the first time its path is captured, and cached in
`monocode.sync.localProjectIds` (`Record<pathKey, projectId>`) so the same
local path always maps to the same id across runs. `"projectPath"` records
for *other* machines are recorded in
`monocode.sync.remoteProjectPaths` (`Record<projectId,
Record<machineId, {path, archived}>>`) for future use; this plan does not
render them (see the Global Constraints note).

- [ ] **Step 1: Write the failing test**

```typescript
import { beforeEach, describe, expect, it } from "vitest";
import { applyRemoteProjectRecords, captureLocalProjectChanges } from "./syncProjects";
import { takeOutbox } from "./syncPeerState";
import { localMachineId } from "./syncMachineId";
import { loadProjectRailOrder, loadRecents, rememberProject, saveProjectRailOrder } from "../../projects/model/recents";

function mockLocalStorage() {
  const data = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value),
      removeItem: (key: string) => void data.delete(key),
    },
    configurable: true,
  });
}

const MACHINE = "host-1";

describe("syncProjects", () => {
  beforeEach(mockLocalStorage);

  it("captures a new local project as a project + projectPath op, keyed by this machine's id", () => {
    rememberProject("/home/me/code/app");
    captureLocalProjectChanges(MACHINE);
    const ops = takeOutbox(MACHINE);
    const pathOp = ops.find((op) => op.table === "projectPath");
    expect(pathOp?.value).toMatchObject({ machineId: localMachineId(), path: "/home/me/code/app", archived: false });
    expect(ops.some((op) => op.table === "project")).toBe(true);
  });

  it("captures the rail order as a railLayout op", () => {
    rememberProject("/home/me/code/app");
    saveProjectRailOrder(["/home/me/code/app"]);
    captureLocalProjectChanges(MACHINE);
    const layout = takeOutbox(MACHINE).find((op) => op.table === "railLayout");
    expect(layout?.value).toEqual({ order: ["/home/me/code/app"], pinned: [] });
  });

  it("does not re-queue a project whose path is already captured for this machine", () => {
    rememberProject("/home/me/code/app");
    captureLocalProjectChanges(MACHINE);
    captureLocalProjectChanges(MACHINE);
    const pathOps = takeOutbox(MACHINE).filter((op) => op.table === "projectPath");
    expect(pathOps).toHaveLength(1);
  });

  it("applying a railLayout record from the peer updates the local rail order", () => {
    applyRemoteProjectRecords(MACHINE, [
      { table: "railLayout", id: "rail", rev: 1, value: { order: ["/other/path"], pinned: [] } },
    ]);
    expect(loadProjectRailOrder()).toEqual(["/other/path"]);
  });

  it("applying our own project/projectPath echo back does not duplicate local recents", () => {
    rememberProject("/home/me/code/app");
    captureLocalProjectChanges(MACHINE);
    const ops = takeOutbox(MACHINE);
    const projectOp = ops.find((op) => op.table === "project")!;
    const pathOp = ops.find((op) => op.table === "projectPath")!;
    applyRemoteProjectRecords(MACHINE, [
      { table: "project", id: projectOp.id, rev: 1, value: projectOp.value as any },
      { table: "projectPath", id: pathOp.id, rev: 2, value: pathOp.value as any },
    ]);
    expect(loadRecents()).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/sync/model/syncProjects.test.ts`
Expected: FAIL with "Cannot find module './syncProjects'"

- [ ] **Step 3: Write minimal implementation**

In `src/features/projects/model/recents.ts`, nothing needs to change: this
module reads and writes the rail/recents `localStorage` keys directly
through the functions it already exports (`loadRecents`,
`loadProjectRailOrder`, `saveProjectRailOrder`, `savePinnedProjects`,
`loadPinnedProjects`, `loadArchivedProjects`), so `syncProjects.ts` can be
built entirely on top of that existing public API with no edits to
`recents.ts` itself.

Create `src/features/sync/model/syncProjects.ts`:

```typescript
import { pathKey } from "../../../shared/lib/paths";
import {
  isLocalProject,
  loadArchivedProjects,
  loadPinnedProjects,
  loadProjectRailOrder,
  loadRecents,
  savePinnedProjects,
  saveProjectRailOrder,
} from "../../projects/model/recents";
import { localMachineId } from "./syncMachineId";
import { queueLocalChange } from "./syncPeerState";
import type {
  SyncProjectPathValue,
  SyncProjectValue,
  SyncRailLayoutValue,
  SyncRecord,
} from "./syncProtocol";

const PROJECT_ID_KEY = "monocode.sync.localProjectIds";
const REMOTE_PATHS_KEY = "monocode.sync.remoteProjectPaths";
const RAIL_LAYOUT_ID = "rail";

function randomId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `project-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function loadProjectIds(): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(PROJECT_ID_KEY) ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function saveProjectIds(ids: Record<string, string>): void {
  try {
    localStorage.setItem(PROJECT_ID_KEY, JSON.stringify(ids));
  } catch {
    // ignored; a project without a cached id is assigned a fresh one next time
  }
}

/** This machine's stable id for a local path, minted the first time it is
 * captured and reused after that. */
function projectIdForPath(path: string): string {
  const ids = loadProjectIds();
  const key = pathKey(path);
  const existing = ids[key];
  if (existing) return existing;
  const fresh = randomId();
  saveProjectIds({ ...ids, [key]: fresh });
  return fresh;
}

/** This machine's full pathKey→projectId map, for callers (Task 8's
 * assignment capture) that need to turn a `projectGroupAssignments` key
 * into the sync id for that same project. */
export function localProjectIdsByPath(): Record<string, string> {
  return loadProjectIds();
}

/** The reverse lookup: which local pathKey (if any) this machine has
 * assigned to a given projectId. Used to apply an incoming assignment
 * record, which only carries the projectId. */
export function localPathKeyForProjectId(projectId: string): string | undefined {
  for (const [key, id] of Object.entries(loadProjectIds())) {
    if (id === projectId) return key;
  }
  return undefined;
}

type RemoteProjectPaths = Record<string, Record<string, { path: string; archived: boolean }>>;

function loadRemoteProjectPaths(): RemoteProjectPaths {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(REMOTE_PATHS_KEY) ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as RemoteProjectPaths) : {};
  } catch {
    return {};
  }
}

function saveRemoteProjectPaths(value: RemoteProjectPaths): void {
  try {
    localStorage.setItem(REMOTE_PATHS_KEY, JSON.stringify(value));
  } catch {
    // ignored; re-learned on the next pull
  }
}

/** Queues this machine's local-path projects and current rail layout for
 * the given peer. Safe to call often: a path already captured for this
 * machine, or a rail layout identical to what is already queued, produces
 * no new op (the outbox already de-duplicates by record id). */
export function captureLocalProjectChanges(machineId: string): void {
  const paths = [
    ...loadRecents().map((item) => item.path),
    ...loadArchivedProjects().map((item) => item.path),
  ].filter(isLocalProject);
  const archived = new Set(loadArchivedProjects().map((item) => pathKey(item.path)));
  const seen = new Set<string>();
  for (const path of paths) {
    const key = pathKey(path);
    if (seen.has(key)) continue;
    seen.add(key);
    const projectId = projectIdForPath(path);
    const projectValue: SyncProjectValue = { id: projectId, createdAt: Date.now() };
    queueLocalChange(machineId, "project", projectId, projectValue);
    const pathValue: SyncProjectPathValue = {
      projectId,
      machineId: localMachineId(),
      path,
      archived: archived.has(key),
    };
    queueLocalChange(machineId, "projectPath", `${projectId}:${localMachineId()}`, pathValue);
  }
  const layout: SyncRailLayoutValue = { order: loadProjectRailOrder(), pinned: loadPinnedProjects() };
  queueLocalChange(machineId, "railLayout", RAIL_LAYOUT_ID, layout);
}

/** Applies incoming project/projectPath/railLayout records. Our own path
 * echoed back is a no-op: this machine already has that recents entry. A
 * path from another machine is remembered for later (see
 * `docs/superpowers/specs/2026-10-02-project-group-sync-design.md`) rather
 * than shown, since rendering it needs its own rail-UI work. */
export function applyRemoteProjectRecords(machineId: string, records: readonly SyncRecord[]): void {
  const remotePaths = loadRemoteProjectPaths();
  let remotePathsChanged = false;
  for (const record of records) {
    if (record.table === "projectPath") {
      const value = record.value as SyncProjectPathValue | null;
      if (!value) continue;
      if (value.machineId === localMachineId()) continue;
      remotePaths[value.projectId] = {
        ...remotePaths[value.projectId],
        [value.machineId]: { path: value.path, archived: value.archived },
      };
      remotePathsChanged = true;
    } else if (record.table === "railLayout") {
      const value = record.value as SyncRailLayoutValue | null;
      if (!value) continue;
      saveProjectRailOrder(value.order);
      savePinnedProjects(value.pinned);
    }
    // "project" records carry only an id and a creation time, nothing to
    // apply locally beyond the projectPath/railLayout records above.
  }
  if (remotePathsChanged) saveRemoteProjectPaths(remotePaths);
  void machineId;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/sync/model/syncProjects.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/features/sync/model/syncProjects.ts src/features/sync/model/syncProjects.test.ts
git commit -m "feat(sync): sync local projects and rail layout"
```

---

### Task 8: Group and assignment sync

**Files:**
- Create: `src/features/sync/model/syncGroups.ts`
- Test: `src/features/sync/model/syncGroups.test.ts`

**Interfaces:**
- Consumes: `queueLocalChange` from `./syncPeerState` (Task 6); `SyncRecord`
  from `./syncProtocol` (Task 1); `localPathKeyForProjectId` from
  `./syncProjects` (Task 7); from `projectGroups.ts`: `loadProjectGroups`,
  `saveProjectGroups`, `loadProjectGroupAssignments`,
  `saveProjectGroupAssignments`, `type ProjectGroup`.
- Produces: `captureLocalGroupChanges(machineId): void`,
  `applyRemoteGroupRecords(machineId, records: readonly SyncRecord[]):
  void` — used by Task 10.

**Design note:** a group's `id` (already a UUID minted by
`createProjectGroup`) is used directly as the sync record id — no separate
identity mapping is needed, unlike projects. An assignment's sync id is the
project's sync id (from Task 7's `monocode.sync.localProjectIds`, looked up
by path); an assignment for a path with no cached project id yet is
skipped (it is captured on the next call, once Task 7's capture has run for
that path — the orchestration loop in Task 10 always runs project capture
before group capture in the same cycle).

- [ ] **Step 1: Write the failing test**

```typescript
import { beforeEach, describe, expect, it } from "vitest";
import { applyRemoteGroupRecords, captureLocalGroupChanges } from "./syncGroups";
import { takeOutbox } from "./syncPeerState";
import {
  loadProjectGroupAssignments,
  loadProjectGroups,
  saveProjectGroupAssignments,
  saveProjectGroups,
} from "../../projects/model/projectGroups";

function mockLocalStorage() {
  const data = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value),
      removeItem: (key: string) => void data.delete(key),
    },
    configurable: true,
  });
}

const MACHINE = "host-1";

describe("syncGroups", () => {
  beforeEach(mockLocalStorage);

  it("captures each local group as its own op, keyed by the group id", () => {
    saveProjectGroups([{ id: "g1", name: "Work", collapsed: false }]);
    captureLocalGroupChanges(MACHINE);
    const ops = takeOutbox(MACHINE);
    expect(ops).toContainEqual(
      expect.objectContaining({ table: "group", id: "g1", value: { id: "g1", name: "Work", collapsed: false } }),
    );
  });

  it("applying a remote group record adds it locally", () => {
    applyRemoteGroupRecords(MACHINE, [
      { table: "group", id: "g2", rev: 1, value: { id: "g2", name: "Personal", collapsed: false } },
    ]);
    expect(loadProjectGroups()).toEqual([{ id: "g2", name: "Personal", collapsed: false }]);
  });

  it("a tombstoned group record removes it locally", () => {
    saveProjectGroups([{ id: "g1", name: "Work", collapsed: false }]);
    applyRemoteGroupRecords(MACHINE, [{ table: "group", id: "g1", rev: 2, value: null }]);
    expect(loadProjectGroups()).toEqual([]);
  });

  it("captures and applies assignments by project sync id", () => {
    saveProjectGroupAssignments({ "/home/me/app": "g1" });
    captureLocalGroupChanges(MACHINE, { "/home/me/app": "proj-1" });
    expect(takeOutbox(MACHINE)).toContainEqual(
      expect.objectContaining({ table: "assignment", id: "proj-1", value: { projectId: "proj-1", groupId: "g1" } }),
    );
    applyRemoteGroupRecords(MACHINE, [
      { table: "assignment", id: "proj-2", rev: 3, value: { projectId: "proj-2", groupId: "g1" } },
    ]);
    // Applying an assignment keyed by a projectId this machine cannot map
    // to a local path yet is accepted without throwing; nothing local
    // changes until a matching path/project id arrives (Task 7).
    expect(loadProjectGroupAssignments()).toEqual({ "/home/me/app": "g1" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/sync/model/syncGroups.test.ts`
Expected: FAIL with "Cannot find module './syncGroups'"

- [ ] **Step 3: Write minimal implementation**

```typescript
import {
  loadProjectGroupAssignments,
  loadProjectGroups,
  saveProjectGroupAssignments,
  saveProjectGroups,
  type ProjectGroup,
} from "../../projects/model/projectGroups";
import { localPathKeyForProjectId } from "./syncProjects";
import { queueLocalChange } from "./syncPeerState";
import type { SyncAssignmentValue, SyncGroupValue, SyncRecord } from "./syncProtocol";

/** Queues every local group, and every assignment this machine can resolve
 * to a project sync id (`pathToProjectId`, from Task 7's id cache; an
 * assignment whose path has no id yet is simply skipped this cycle). */
export function captureLocalGroupChanges(
  machineId: string,
  pathToProjectId: Record<string, string> = {},
): void {
  for (const group of loadProjectGroups()) {
    queueLocalChange(machineId, "group", group.id, group as SyncGroupValue);
  }
  const assignments = loadProjectGroupAssignments();
  for (const [pathKeyValue, groupId] of Object.entries(assignments)) {
    const projectId = pathToProjectId[pathKeyValue];
    if (!projectId) continue;
    const value: SyncAssignmentValue = { projectId, groupId };
    queueLocalChange(machineId, "assignment", projectId, value);
  }
}

/** Applies incoming group and assignment records. A group tombstone
 * removes the group (its assignment, if any, is cleared the same way
 * `deleteProjectGroup` does locally). An assignment's sync id is always
 * the projectId it is for (see `captureLocalGroupChanges`); it is applied
 * through `localPathKeyForProjectId`, and skipped when this machine has no
 * local path for that projectId yet — Task 7 fills that mapping in once
 * this machine opens the matching folder, and a later cycle re-applies it. */
export function applyRemoteGroupRecords(machineId: string, records: readonly SyncRecord[]): void {
  void machineId;
  const groupRecords = records.filter((record) => record.table === "group");
  if (groupRecords.length > 0) {
    let groups = loadProjectGroups();
    for (const record of groupRecords) {
      const value = record.value as SyncGroupValue | null;
      groups = groups.filter((group) => group.id !== record.id);
      if (value) groups = [...groups, value as ProjectGroup];
    }
    saveProjectGroups(groups);
  }
  const assignmentRecords = records.filter((record) => record.table === "assignment");
  if (assignmentRecords.length === 0) return;
  const assignments = loadProjectGroupAssignments();
  for (const record of assignmentRecords) {
    const pathKeyValue = localPathKeyForProjectId(record.id);
    if (!pathKeyValue) continue;
    const value = record.value as SyncAssignmentValue | null;
    if (value?.groupId) assignments[pathKeyValue] = value.groupId;
    else delete assignments[pathKeyValue];
  }
  saveProjectGroupAssignments(assignments);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/sync/model/syncGroups.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/features/sync/model/syncGroups.ts src/features/sync/model/syncGroups.test.ts
git commit -m "feat(sync): sync project groups and assignments"
```

---

### Task 9: Group-lock password sync

**Files:**
- Modify: `src/features/group-lock/model/groupLock.ts` (export one new
  function; add a tiny subscribable hook)
- Create: `src/features/sync/model/syncLock.ts`
- Test: `src/features/sync/model/syncLock.test.ts`

**Interfaces:**
- Consumes: `queueLocalChange` from `./syncPeerState` (Task 6); `SyncRecord`
  from `./syncProtocol` (Task 1).
- Produces (from `groupLock.ts`): `subscribeLockRecordChanges(listener:
  (record: PasswordRecord | null) => void): () => void` and
  `applyRemoteLockRecord(record: PasswordRecord | null): void`.
- Produces (from `syncLock.ts`): `captureLocalLockChanges(machineId):
  void`, `applyRemoteLockRecords(machineId, records: readonly
  SyncRecord[]): void` — used by Task 10.

- [ ] **Step 1: Write the failing test**

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyRemoteLockRecords, captureLocalLockChanges } from "./syncLock";
import { takeOutbox } from "./syncPeerState";
import { getGroupLockView, setLockPassword } from "../../group-lock/model/groupLock";

function mockLocalStorage() {
  const data = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value),
      removeItem: (key: string) => void data.delete(key),
    },
    configurable: true,
  });
}

const MACHINE = "host-1";

describe("syncLock", () => {
  beforeEach(() => {
    mockLocalStorage();
    vi.stubGlobal("crypto", {
      getRandomValues: (array: Uint8Array) => array.fill(7),
      subtle: {
        importKey: async () => "key",
        deriveBits: async () => new Uint8Array(32).fill(1),
      },
    });
  });

  it("captures the current password record for the peer", async () => {
    await setLockPassword("correct horse battery staple");
    captureLocalLockChanges(MACHINE);
    const op = takeOutbox(MACHINE).find((entry) => entry.table === "lock");
    expect(op?.value).toMatchObject({ record: { alg: "PBKDF2-SHA256" } });
  });

  it("applying a remote lock record with a password makes the app locked here too", () => {
    applyRemoteLockRecords(MACHINE, [
      {
        table: "lock",
        id: "lock",
        rev: 1,
        value: { record: { v: 1, alg: "PBKDF2-SHA256", iterations: 600_000, salt: "AAAA", hash: "AAAA" } },
      },
    ]);
    expect(getGroupLockView().hasPassword).toBe(true);
  });

  it("applying a remote lock record with no password clears it here too", async () => {
    await setLockPassword("correct horse battery staple");
    applyRemoteLockRecords(MACHINE, [{ table: "lock", id: "lock", rev: 2, value: { record: null } }]);
    expect(getGroupLockView().hasPassword).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/sync/model/syncLock.test.ts`
Expected: FAIL with "Cannot find module './syncLock'"

- [ ] **Step 3: Write minimal implementation**

In `src/features/group-lock/model/groupLock.ts`, add after the existing
`saveSettings` function (around line 174):

```typescript
const lockRecordListeners = new Set<(record: PasswordRecord | null) => void>();
let applyingRemoteLock = false;

export function subscribeLockRecordChanges(
  listener: (record: PasswordRecord | null) => void,
): () => void {
  lockRecordListeners.add(listener);
  return () => lockRecordListeners.delete(listener);
}

/** Applies a password record (or its absence) learned from a peer, without
 * re-announcing it as a local change. Clearing the record also drops every
 * group's unlocked-in-memory state, same as `clearPassword` does when the
 * password is removed here directly; it does not touch any group's
 * `lockable` flag (that is a `ProjectGroup` field, synced separately). */
export function applyRemoteLockRecord(record: PasswordRecord | null): void {
  if (JSON.stringify(settings.record) === JSON.stringify(record)) return;
  applyingRemoteLock = true;
  try {
    saveSettings({ ...settings, record });
    if (!record) unlocked = new Set();
  } finally {
    applyingRemoteLock = false;
  }
}
```

And change `saveSettings` itself (existing function, around line 169) to
notify after writing:

```typescript
function saveSettings(next: GroupLockSettings) {
  const recordChanged = JSON.stringify(settings.record) !== JSON.stringify(next.record);
  settings = next;
  writeItem(SETTINGS_KEY, JSON.stringify(next));
  persistUnlocked();
  invalidate();
  if (recordChanged && !applyingRemoteLock) {
    for (const listener of lockRecordListeners) listener(next.record);
  }
}
```

Create `src/features/sync/model/syncLock.ts`:

```typescript
import { applyRemoteLockRecord, getGroupLockView, subscribeLockRecordChanges } from "../../group-lock/model/groupLock";
import { parseGroupLockSettings } from "../../group-lock/model/lockSettings";
import { queueLocalChange } from "./syncPeerState";
import type { SyncLockValue, SyncRecord } from "./syncProtocol";

const LOCK_RECORD_ID = "lock";

function currentRecord(): SyncLockValue["record"] {
  // `getGroupLockView` deliberately omits the record; read it the same way
  // `groupLock.ts` itself does, from its own settings key.
  const raw = (() => {
    try {
      return localStorage.getItem("monocode.groupLock");
    } catch {
      return null;
    }
  })();
  return parseGroupLockSettings(raw).record;
}

/** Queues the current password record (or `null`) for the peer. Harmless
 * to call when nothing changed: the outbox already de-duplicates by id. */
export function captureLocalLockChanges(machineId: string): void {
  queueLocalChange(machineId, "lock", LOCK_RECORD_ID, { record: currentRecord() } as SyncLockValue);
}

export function applyRemoteLockRecords(machineId: string, records: readonly SyncRecord[]): void {
  void machineId;
  for (const record of records) {
    if (record.table !== "lock") continue;
    const value = record.value as SyncLockValue | null;
    applyRemoteLockRecord((value?.record as Parameters<typeof applyRemoteLockRecord>[0]) ?? null);
  }
}

/** Wires a local password change straight into the outbox for every peer
 * this machine syncs with, without waiting for the orchestration loop's
 * next cycle — losing or changing the lock password is worth pushing
 * immediately. Returns the unsubscribe function. */
export function watchLocalLockChanges(machineIds: () => readonly string[]): () => void {
  return subscribeLockRecordChanges((record) => {
    for (const machineId of machineIds()) {
      queueLocalChange(machineId, "lock", LOCK_RECORD_ID, { record } as SyncLockValue);
    }
  });
}

void getGroupLockView; // re-exported import kept for callers that only need the view
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/sync/model/syncLock.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/features/group-lock/model/groupLock.ts src/features/sync/model/syncLock.ts src/features/sync/model/syncLock.test.ts
git commit -m "feat(sync): sync the group-lock password record"
```

---

### Task 10: Sync client orchestration loop

**Files:**
- Create: `src/features/sync/model/syncClient.ts`
- Test: `src/features/sync/model/syncClient.test.ts`

**Interfaces:**
- Consumes: `captureLocalProjectChanges`, `applyRemoteProjectRecords`,
  `localProjectIdsByPath` (Task 7); `captureLocalGroupChanges`,
  `applyRemoteGroupRecords` (Task 8);
  `captureLocalLockChanges`, `applyRemoteLockRecords`,
  `watchLocalLockChanges` (Task 9); `takeOutbox`, `applyPushResult`,
  `markPulled`, `peerRev` (Task 6); `SyncPullResult`, `SyncPushResult`
  (Task 1).
- Produces: `runSyncCycle(machineId, request: (method: string, params:
  unknown) => Promise<unknown>): Promise<void>` (one push-then-pull round
  for one peer, injectable transport for testing) and
  `startSyncLoop(listMachineIds: () => readonly string[], request: (
  machineId: string, method: string, params: unknown) => Promise<unknown>):
  () => void` (runs a cycle for every known peer on an interval and
  whenever the caller's triggers fire) — `startSyncLoop` is wired to real
  connection events in Task 12.

- [ ] **Step 1: Write the failing test**

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runSyncCycle } from "./syncClient";
import { peerRev, queueLocalChange } from "./syncPeerState";
import { loadProjectGroups, saveProjectGroups } from "../../projects/model/projectGroups";

function mockLocalStorage() {
  const data = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value),
      removeItem: (key: string) => void data.delete(key),
    },
    configurable: true,
  });
}

const MACHINE = "host-1";

describe("runSyncCycle", () => {
  beforeEach(mockLocalStorage);

  it("pushes the outbox, then pulls and applies what the host returns", async () => {
    saveProjectGroups([{ id: "g1", name: "Mine", collapsed: false }]);
    queueLocalChange(MACHINE, "group", "g1", { id: "g1", name: "Mine", collapsed: false });
    const request = vi.fn(async (method: string, params: any) => {
      if (method === "sync.push") {
        expect(params.ops).toEqual([{ table: "group", id: "g1", baseRev: 0, value: { id: "g1", name: "Mine", collapsed: false } }]);
        return { rev: 5, applied: [{ table: "group", id: "g1", rev: 5 }], rejected: [] };
      }
      if (method === "sync.pull") {
        expect(params.sinceRev).toBe(0);
        return {
          rev: 6,
          records: [{ table: "group", id: "g2", rev: 6, value: { id: "g2", name: "Theirs", collapsed: false } }],
        };
      }
      throw new Error(`unexpected method ${method}`);
    });

    await runSyncCycle(MACHINE, request);

    expect(request).toHaveBeenCalledWith("sync.push", { ops: expect.any(Array) });
    expect(request).toHaveBeenCalledWith("sync.pull", { sinceRev: 0 });
    expect(loadProjectGroups().map((g) => g.id).sort()).toEqual(["g1", "g2"]);
    expect(peerRev(MACHINE)).toBe(6);
  });

  it("skips the push call when the outbox is empty", async () => {
    const request = vi.fn(async (method: string) => {
      if (method === "sync.pull") return { rev: 0, records: [] };
      throw new Error(`unexpected method ${method}`);
    });
    await runSyncCycle(MACHINE, request);
    expect(request).not.toHaveBeenCalledWith("sync.push", expect.anything());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/sync/model/syncClient.test.ts`
Expected: FAIL with "Cannot find module './syncClient'"

- [ ] **Step 3: Write minimal implementation**

```typescript
import { applyRemoteGroupRecords, captureLocalGroupChanges } from "./syncGroups";
import { applyRemoteLockRecords, captureLocalLockChanges } from "./syncLock";
import { applyRemoteProjectRecords, captureLocalProjectChanges, localProjectIdsByPath } from "./syncProjects";
import { applyPushResult, markPulled, peerRev, takeOutbox } from "./syncPeerState";
import type { SyncPullResult, SyncPushResult, SyncRecord } from "./syncProtocol";

export type SyncRequest = (method: string, params: unknown) => Promise<unknown>;

function applyIncoming(machineId: string, records: readonly SyncRecord[]): void {
  applyRemoteProjectRecords(machineId, records);
  applyRemoteGroupRecords(machineId, records);
  applyRemoteLockRecords(machineId, records);
}

/** One push-then-pull round for a single peer. Project/rail capture always
 * runs before group capture, so an assignment for a path captured in this
 * same cycle (Task 7) is queued immediately rather than next cycle. */
export async function runSyncCycle(machineId: string, request: SyncRequest): Promise<void> {
  captureLocalProjectChanges(machineId);
  captureLocalGroupChanges(machineId, localProjectIdsByPath());
  captureLocalLockChanges(machineId);

  const outbox = takeOutbox(machineId);
  if (outbox.length > 0) {
    const pushResult = (await request("sync.push", { ops: outbox })) as SyncPushResult;
    const toAdopt = applyPushResult(machineId, pushResult);
    if (toAdopt.length > 0) applyIncoming(machineId, toAdopt);
  }

  const pullResult = (await request("sync.pull", { sinceRev: peerRev(machineId) })) as SyncPullResult;
  if (pullResult.records.length > 0) {
    applyIncoming(machineId, pullResult.records);
    markPulled(machineId, pullResult.records);
  }
}

const CYCLE_INTERVAL_MS = 10_000;

/**
 * Runs a sync cycle for every currently known peer, on an interval and
 * whenever `nudge()` (returned alongside the stop function) is called —
 * Task 12 calls `nudge` on tunnel reconnects and local library edits.
 */
export function startSyncLoop(
  listMachineIds: () => readonly string[],
  requestFor: (machineId: string) => SyncRequest,
): { stop: () => void; nudge: () => void } {
  let running = false;
  let pending = false;
  const runAll = async () => {
    if (running) {
      pending = true;
      return;
    }
    running = true;
    try {
      for (const machineId of listMachineIds()) {
        await runSyncCycle(machineId, requestFor(machineId)).catch(() => undefined);
      }
    } finally {
      running = false;
      if (pending) {
        pending = false;
        void runAll();
      }
    }
  };
  const timer = setInterval(() => void runAll(), CYCLE_INTERVAL_MS);
  void runAll();
  return {
    stop: () => clearInterval(timer),
    nudge: () => void runAll(),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/sync/model/syncClient.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/features/sync/model/syncClient.ts src/features/sync/model/syncClient.test.ts
git commit -m "feat(sync): add push/pull sync cycle and loop"
```

---

### Task 11: Local host auto-pairing (Rust)

**Files:**
- Create: `src-tauri/src/local_host.rs`
- Modify: `src-tauri/src/remote.rs` (make `Machine`'s fields
  `pub(crate)` so `local_host.rs` can read `endpoint`)
- Modify: `src-tauri/src/lib.rs:40` (add `mod local_host;`) and
  `src-tauri/src/lib.rs:270-280` (register the new command)

**Interfaces:**
- Consumes: `crate::remote::{Machine, remote_connect, remote_machines,
  RemoteConnections}`.
- Produces: Tauri command `local_host_connect(app: AppHandle) ->
  Result<Option<Machine>, String>` — called from the frontend in Task 12.

- [ ] **Step 1: Write the failing test**

```rust
// at the bottom of src-tauri/src/local_host.rs, a #[cfg(test)] mod tests
#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn launcher_command_is_none_when_nothing_is_installed() {
        let directory = std::env::temp_dir().join(format!("monocode-local-host-{}", uuid::Uuid::new_v4()));
        assert!(launcher_command(&directory).is_none());
        let _ = fs::remove_dir_all(&directory);
    }

    #[cfg(not(windows))]
    #[test]
    fn launcher_command_finds_the_unix_binary() {
        let directory = std::env::temp_dir().join(format!("monocode-local-host-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(directory.join("bin")).unwrap();
        fs::write(directory.join("bin").join("monocode-host"), b"").unwrap();
        let (program, args) = launcher_command(&directory).expect("launcher found");
        assert!(program.ends_with("monocode-host"));
        assert!(args.is_empty());
        let _ = fs::remove_dir_all(&directory);
    }

    #[test]
    fn run_launcher_parses_the_last_json_line_of_stdout() {
        let value = parse_launcher_output("some log line\n{\"port\":3774}\n");
        assert_eq!(value.unwrap().get("port").and_then(|v| v.as_u64()), Some(3774));
    }

    #[test]
    fn run_launcher_rejects_output_with_no_json_line() {
        assert!(parse_launcher_output("no json here").is_none());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --manifest-path src-tauri/Cargo.toml local_host`
Expected: FAIL with "cannot find module `local_host`" (module not yet
registered / file not yet created)

- [ ] **Step 3: Write minimal implementation**

In `src-tauri/src/remote.rs`, change the `Machine` struct (currently at
line 60-68) to:

```rust
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Machine {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) endpoint: String,
    pub(crate) environment_id: String,
    pub(crate) ssh: Option<SshTarget>,
}
```

In `src-tauri/src/lib.rs`, add the module declaration near the other `mod`
lines (alphabetically, after `mod linear;` and before `#[cfg(target_os =
"macos")] mod macos;`, i.e. right around line 21):

```rust
mod linear;
mod local_host;
#[cfg(target_os = "macos")]
mod macos;
```

And register the command in the `invoke_handler!` list (next to the other
`remote::*` entries, around line 272):

```rust
            remote::remote_machines,
            remote::remote_connect,
            local_host::local_host_connect,
```

Create `src-tauri/src/local_host.rs`:

```rust
//! Links this desktop to a MonoCode Host already running on this same
//! machine (installed earlier by an SSH pairing from elsewhere, or set up
//! manually per `docs/remote-access.md`), over loopback, with no SSH and no
//! user action — so a machine that is both a paired host and its own
//! desktop has a sync peer for its own library. Uses the same host CLI
//! commands the SSH bootstrap already drives remotely
//! (`remote_ssh.rs::pairing_script`), just as a local child process.
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use serde_json::Value;
use tauri::{AppHandle, Manager, State};

use crate::remote::{remote_connect, remote_machines, Machine, RemoteConnections};

fn host_data_dir() -> Option<PathBuf> {
    #[cfg(windows)]
    let home = std::env::var("USERPROFILE").ok()?;
    #[cfg(not(windows))]
    let home = std::env::var("HOME").ok()?;
    Some(PathBuf::from(home).join(".monocode-host"))
}

/// The local launcher command (program, leading args), or `None` when
/// nothing is installed at the expected location on this machine.
fn launcher_command(data_dir: &Path) -> Option<(String, Vec<String>)> {
    #[cfg(windows)]
    let launcher = data_dir.join("bin").join("monocode-host.cmd");
    #[cfg(not(windows))]
    let launcher = data_dir.join("bin").join("monocode-host");
    if !launcher.exists() {
        return None;
    }
    Some((launcher.to_string_lossy().into_owned(), Vec::new()))
}

/// The host CLI prints progress lines before its JSON result; only the
/// last line is the result (same convention `remote_ssh.rs` relies on for
/// the SSH-driven bootstrap/pairing scripts).
fn parse_launcher_output(stdout: &str) -> Option<Value> {
    let last = stdout.lines().last()?;
    serde_json::from_str(last).ok()
}

fn run_launcher(program: &str, base_args: &[String], args: &[&str]) -> Option<Value> {
    let output = Command::new(program)
        .args(base_args)
        .args(args)
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    parse_launcher_output(&String::from_utf8_lossy(&output.stdout))
}

/// How this desktop appears in its own host's device list, distinct from
/// an SSH-paired desktop's name (`remote_ssh::device_name`).
fn local_device_name() -> String {
    "This computer (local sync)".to_string()
}

/// Links this desktop to a host running on this same machine, if there is
/// one, reusing an already-saved connection to it when present. Returns
/// `Ok(None)` whenever there is nothing to link (no host installed, or it
/// is not currently running) — this is the common case on a desktop that
/// is not also acting as someone else's remote machine, so it is not an
/// error.
///
/// `remote_machines`/`remote_connect` are themselves plain, non-`async`
/// functions under `#[tauri::command(async)]` (Tauri runs them on a
/// blocking thread; the attribute does not require an `async fn` body) —
/// so this command follows the same shape and calls them directly, with
/// no `.await`.
#[tauri::command(async)]
pub fn local_host_connect(app: AppHandle) -> Result<Option<Machine>, String> {
    let Some(data_dir) = host_data_dir() else {
        return Ok(None);
    };
    let Some((program, base_args)) = launcher_command(&data_dir) else {
        return Ok(None);
    };
    let Some(info) = run_launcher(&program, &base_args, &["connection-info"]) else {
        return Ok(None);
    };
    let Some(port) = info.get("port").and_then(Value::as_u64) else {
        return Ok(None);
    };
    let url = format!("http://127.0.0.1:{port}");

    let state: State<'_, RemoteConnections> = app.state();
    let existing = remote_machines(app.clone(), state)?;
    if let Some(machine) = existing.into_iter().find(|machine| machine.endpoint == url) {
        return Ok(Some(machine));
    }

    let Some(pair) = run_launcher(&program, &base_args, &["pair", "--name", &local_device_name(), "--json"]) else {
        return Ok(None);
    };
    let Some(token) = pair.get("token").and_then(Value::as_str) else {
        return Ok(None);
    };
    let state: State<'_, RemoteConnections> = app.state();
    let machine = remote_connect(app.clone(), state, local_device_name(), url, token.to_string())?;
    Ok(Some(machine))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn launcher_command_is_none_when_nothing_is_installed() {
        let directory = std::env::temp_dir().join(format!("monocode-local-host-{}", uuid::Uuid::new_v4()));
        assert!(launcher_command(&directory).is_none());
        let _ = fs::remove_dir_all(&directory);
    }

    #[cfg(not(windows))]
    #[test]
    fn launcher_command_finds_the_unix_binary() {
        let directory = std::env::temp_dir().join(format!("monocode-local-host-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(directory.join("bin")).unwrap();
        fs::write(directory.join("bin").join("monocode-host"), b"").unwrap();
        let (program, args) = launcher_command(&directory).expect("launcher found");
        assert!(program.ends_with("monocode-host"));
        assert!(args.is_empty());
        let _ = fs::remove_dir_all(&directory);
    }

    #[test]
    fn run_launcher_parses_the_last_json_line_of_stdout() {
        let value = parse_launcher_output("some log line\n{\"port\":3774}\n");
        assert_eq!(value.unwrap().get("port").and_then(|v| v.as_u64()), Some(3774));
    }

    #[test]
    fn run_launcher_rejects_output_with_no_json_line() {
        assert!(parse_launcher_output("no json here").is_none());
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test --manifest-path src-tauri/Cargo.toml local_host`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/local_host.rs src-tauri/src/remote.rs src-tauri/src/lib.rs
git commit -m "feat(desktop): auto-pair with a locally running MonoCode Host"
```

---

### Task 12: Startup wiring

**Files:**
- Modify: `src/app/model/appLifecycle.ts` (or the window-startup sequence
  that already calls `loadBootWorkspace`/`startRemoteAutoRecovery` — the
  exact call site is wherever `startRemoteAutoRecovery()` from
  `src/features/connections/model/remoteReconnect.ts` is invoked at
  startup; search for that call to find it)
- Create: `src/features/sync/model/useSync.ts`
- Test: `src/features/sync/model/useSync.test.ts`

**Interfaces:**
- Consumes: `local_host_connect` (Rust, Task 11) via `invoke`;
  `useRemoteMachines` from `../../connections/model/connections` (existing);
  `watchTunnelExits`-style reconnect notifications are out of scope here —
  `startSyncLoop`'s own 10s interval (Task 10) is the v1 trigger, which
  already satisfies "syncs automatically while the connection is up"
  without needing a new event hookup.
- Produces: `startAppSync(): () => void` — called once at app startup,
  starts the local-host auto-pair attempt and the sync loop against every
  currently known machine (both the self-paired local host, once linked,
  and any SSH-paired remote machine).

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it, vi } from "vitest";
import { collectSyncMachineIds } from "./useSync";

describe("collectSyncMachineIds", () => {
  it("returns every known machine id", () => {
    const ids = collectSyncMachineIds([
      { id: "m1", name: "A", endpoint: "https://a", environmentId: "e1", ssh: null },
      { id: "m2", name: "B", endpoint: "https://b", environmentId: "e2", ssh: null },
    ] as any);
    expect(ids).toEqual(["m1", "m2"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/sync/model/useSync.test.ts`
Expected: FAIL with "Cannot find module './useSync'"

- [ ] **Step 3: Write minimal implementation**

```typescript
import { invoke } from "@tauri-apps/api/core";
import { remoteRequest, useRemoteMachines } from "../../connections/model/connections";
import type { RemoteMachine } from "../../connections/model/protocol";
import { startSyncLoop } from "./syncClient";

export function collectSyncMachineIds(machines: readonly RemoteMachine[]): string[] {
  return machines.map((machine) => machine.id);
}

let started = false;

/**
 * Starts this desktop's side of project/group sync: links to a MonoCode
 * Host running on this same machine when there is one (Task 11's Rust
 * command; a no-op most of the time), then runs the sync loop (Task 10)
 * against every machine this desktop currently knows about. Safe to call
 * more than once; only the first call does anything.
 */
export function startAppSync(): () => void {
  if (started) return () => {};
  started = true;
  let machines: readonly RemoteMachine[] = [];
  const refreshMachines = () =>
    invoke<RemoteMachine[]>("remote_machines")
      .then((value) => {
        machines = Array.isArray(value) ? value : [];
      })
      .catch(() => undefined);
  void invoke("local_host_connect").catch(() => undefined).then(refreshMachines);
  const loop = startSyncLoop(
    () => collectSyncMachineIds(machines),
    (machineId) => (method, params) => remoteRequest(machineId, method, params),
  );
  const interval = setInterval(refreshMachines, 30_000);
  return () => {
    started = false;
    loop.stop();
    clearInterval(interval);
  };
}

void useRemoteMachines; // kept available for a future UI affordance (see design doc)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/sync/model/useSync.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: Wire it into app startup**

Find the existing startup call to `startRemoteAutoRecovery()` (from
`src/features/connections/model/remoteReconnect.ts`) in the app's root
component or startup sequence, and add `startAppSync()` next to it:

```typescript
import { startAppSync } from "../../features/sync/model/useSync";
// ... alongside the existing startRemoteAutoRecovery() call:
const stopSync = startAppSync();
// ... returned/cleaned up the same way the recovery stop function is
```

(The exact surrounding code depends on where `startRemoteAutoRecovery` is
currently called — mirror that call's lifecycle exactly: same effect/cleanup
scope, so sync starts and stops alongside it.)

- [ ] **Step 6: Run the full web test suite**

Run: `npm run check:web`
Expected: PASS, no regressions

- [ ] **Step 7: Commit**

```bash
git add src/features/sync/model/useSync.ts src/features/sync/model/useSync.test.ts src/app/model/appLifecycle.ts
git commit -m "feat(sync): start project/group sync at app launch"
```

---

### Task 13: Two-client convergence test (host-side integration)

**Files:**
- Modify: `host/server.test.ts` (append one test using the file's existing
  `setup()` helper twice, as two independent "desktops")

**Interfaces:**
- Consumes: everything from Tasks 2-3 (host side only — this test exercises
  the real RPC surface, not the desktop TS modules).

- [ ] **Step 1: Write the failing test**

Append to `host/server.test.ts`:

```typescript
  it("two desktops converge on the same group after a disconnect with edits on both sides", async () => {
    const s = await setup();
    // Desktop A pushes a new group.
    const a = await s.call("sync.push", {
      ops: [{ table: "group", id: "g1", baseRev: 0, value: { id: "g1", name: "From A", collapsed: false } }],
    });
    expect(a.value.result.rejected).toEqual([]);

    // Desktop B, still at revision 0, pulls and catches up.
    const bPull = await s.call("sync.pull", { sinceRev: 0 });
    expect(bPull.value.result.records).toHaveLength(1);
    const bRev = bPull.value.result.rev;

    // Both edit the same group while "disconnected" from each other (each
    // still believes the revision it last pulled).
    const bPush = await s.call("sync.push", {
      ops: [{ table: "group", id: "g1", baseRev: bRev, value: { id: "g1", name: "From B", collapsed: false } }],
    });
    expect(bPush.value.result.applied).toHaveLength(1);

    // A, still at the revision from its own first push, tries to edit too —
    // this is the "concurrent edit" case: A's base revision is now stale.
    const aRetry = await s.call("sync.push", {
      ops: [{ table: "group", id: "g1", baseRev: a.value.result.applied[0].rev, value: { id: "g1", name: "From A again", collapsed: false } }],
    });
    expect(aRetry.value.result.rejected).toHaveLength(1);
    const winning = aRetry.value.result.rejected[0].current;

    // Both sides pull and land on the same value: whichever write actually
    // reached the host last (B's).
    const finalPull = await s.call("sync.pull", { sinceRev: 0 });
    const finalGroup = finalPull.value.result.records.find((r: any) => r.id === "g1");
    expect(finalGroup.value).toEqual(winning.value);
    expect(finalGroup.value.name).toBe("From B");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run host/server.test.ts -t "converge"`
Expected: FAIL (methods not yet routed) if run before Task 3; PASS already
if run after — this test is a regression guard for Tasks 2-3's revision
logic, not new production code, so step 3 is "no implementation change,"
confirming the earlier tasks already make this true.

- [ ] **Step 3: Confirm it passes with no further changes**

Run: `npx vitest run host/server.test.ts -t "converge"`
Expected: PASS — Tasks 2 and 3 already implement everything this test
checks; this task exists to pin the two-client convergence behavior with
its own named test, independent of the single-client tests in Task 3.

- [ ] **Step 4: Run the full host test suite**

Run: `npm run test:host`
Expected: PASS, no regressions

- [ ] **Step 5: Commit**

```bash
git add host/server.test.ts
git commit -m "test(host): pin two-desktop convergence after a concurrent edit"
```

---

## Follow-ups (not in this plan)

- A rail-UI row for a project known via sync but with no local path yet
  ("mevcut, bu makinede yol bilinmiyor" from the design doc) — needs a
  fresh look at `useRailSections.tsx` and the rail row components.
- The design doc's transient toast ("Bu değişiklik diğer makineden gelen
  güncellemeyle birleştirildi") for a local edit overwritten by an incoming
  sync within ~5s — this plan's conflict handling (Tasks 2, 6, 10) resolves
  the conflict correctly, but doesn't surface it in the UI; needs whatever
  toast/notification component the app already uses elsewhere.
- Labeling the auto-linked local-host machine distinctly in Settings →
  Connections (currently it shows as an ordinary machine named "This
  computer (local sync)"), and perhaps hiding its disconnect button.
- Multi-machine mesh sync, explicitly out of scope for v1.
