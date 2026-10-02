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
  "groupOrder",
  "lock",
] as const;

export type SyncTable = (typeof SYNC_TABLES)[number];

export type SyncProjectValue = { id: string; createdAt: number };
export type SyncProjectPathValue = {
  projectId: string;
  machineId: string;
  path: string;
  archived: boolean;
  /** The host running on that machine, through which its folders can be opened remotely. */
  hostEnvironmentId?: string;
};
export type SyncGroupValue = {
  id: string;
  name: string;
  /** Per-machine UI state; never sent, only tolerated from older clients. */
  collapsed?: boolean;
  colorIndex?: number;
  customColor?: string;
  mascot?: string;
  workspaceFile?: string;
  workspaceFolders?: string[];
  lockable?: boolean;
};
export type SyncAssignmentValue = { projectId: string; groupId: string };
export type SyncRailLayoutValue = { order: string[]; pinned: string[] };
export type SyncGroupOrderValue = { order: string[] };
export type SyncLockValue = { record: unknown | null };

export type SyncRecordValue =
  | SyncProjectValue
  | SyncProjectPathValue
  | SyncGroupValue
  | SyncAssignmentValue
  | SyncRailLayoutValue
  | SyncGroupOrderValue
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
