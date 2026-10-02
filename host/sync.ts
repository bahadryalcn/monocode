import type { DatabaseSync } from "node:sqlite";
import { SYNC_TABLES } from "../src/features/sync/model/syncProtocol";
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

type SyncRow = Record<string, unknown>;

/** Maps a stored row to a record; a row whose JSON is corrupt reads as a
 * tombstone (value: null) so a push over it can still proceed. Returns
 * undefined only when `skipCorrupt` is set and the row is corrupt. */
function rowToRecord(row: SyncRow): SyncRecord & { corrupt: boolean } {
  let value: SyncRecordValue | null = null;
  let corrupt = false;
  if (row.value !== null) {
    try {
      value = JSON.parse(String(row.value)) as SyncRecordValue;
    } catch {
      corrupt = true;
    }
  }
  return {
    table: String(row.table_name) as SyncTable,
    id: String(row.id),
    rev: Number(row.rev),
    value,
    corrupt,
  };
}

function readRecord(db: DatabaseSync, table: SyncTable, id: string): SyncRecord | undefined {
  const row = db
    .prepare("SELECT table_name, id, value, rev FROM sync_records WHERE table_name=? AND id=?")
    .get(table, id);
  if (!row) return undefined;
  const { corrupt: _corrupt, ...record } = rowToRecord(row);
  return record;
}

/** Every record the host has accepted since `sinceRev`, oldest first. */
export function syncPull(db: DatabaseSync, sinceRev: number): SyncPullResult {
  const rows = db
    .prepare("SELECT table_name, id, value, rev FROM sync_records WHERE rev > ? ORDER BY rev")
    .all(sinceRev);
  const records: SyncRecord[] = [];
  for (const row of rows) {
    const { corrupt, ...record } = rowToRecord(row);
    if (!corrupt) records.push(record);
  }
  return { rev: currentRev(db), records };
}

const MAX_VALUE_BYTES = 64 * 1024;

function isValidOp(op: unknown): op is SyncOp {
  if (typeof op !== "object" || op === null) return false;
  const { table, id, baseRev, value } = op as Record<string, unknown>;
  if (!(SYNC_TABLES as readonly unknown[]).includes(table)) return false;
  if (typeof id !== "string" || id.length === 0 || id.length > 200) return false;
  if (typeof baseRev !== "number" || !Number.isSafeInteger(baseRev) || baseRev < 0) return false;
  if (value === null) return true;
  if (typeof value !== "object" || Array.isArray(value)) return false;
  try {
    return JSON.stringify(value).length <= MAX_VALUE_BYTES;
  } catch {
    return false;
  }
}

/**
 * Applies each op whose `baseRev` matches the record's current revision
 * (optimistic concurrency); an op based on a stale revision is rejected and
 * returned with the record's current value, so the caller can adopt it.
 * Ops for different records in one call are independent of each other.
 * Malformed ops are skipped (neither applied nor reported) and never throw,
 * so one poisoned op cannot make a whole batch retry forever.
 */
export function syncPush(db: DatabaseSync, ops: SyncOp[]): SyncPushResult {
  const applied: SyncPushResult["applied"] = [];
  const rejected: SyncPushResult["rejected"] = [];
  for (const op of ops) {
    if (!isValidOp(op)) continue;
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
