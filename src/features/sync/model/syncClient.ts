import { applyRemoteGroupRecords, captureLocalGroupChanges } from "./syncGroups";
import { applyRemoteLockRecords, captureLocalLockChanges } from "./syncLock";
import { applyRemoteProjectRecords, captureLocalProjectChanges, localProjectIdsByPath } from "./syncProjects";
import { applyPushResult, hasPendingOp, markPulled, peerRev, setPeerRev, takeOutbox } from "./syncPeerState";
import { remoteErrorText } from "../../connections/model/remoteFailure";
import { parseSyncRecord } from "./syncProtocol";
import type { SyncPushResult, SyncRecord } from "./syncProtocol";

const mergedListeners = new Set<() => void>();

/** Fires when a push was rejected and the host's value replaced a local edit. */
export function subscribeSyncMerged(listener: () => void): () => void {
  mergedListeners.add(listener);
  return () => void mergedListeners.delete(listener);
}

export const SYNC_MERGED_MESSAGE = "This change was merged with an update from your other machine.";

export type SyncState = "idle" | "syncing" | "ok" | "error" | "unsupported" | "unlinked";
export type SyncStatus = { state: SyncState; lastSyncAt?: number; lastError?: string; pendingOps: number };

const NOT_STARTED: SyncStatus = { state: "idle", pendingOps: 0 };
const statuses = new Map<string, SyncStatus>();
const statusListeners = new Set<() => void>();

/** Returns the same object until the status changes, so it is safe as a useSyncExternalStore snapshot. */
export function getSyncStatus(machineId: string): SyncStatus {
  return statuses.get(machineId) ?? NOT_STARTED;
}

export function subscribeSyncStatus(listener: () => void): () => void {
  statusListeners.add(listener);
  return () => void statusListeners.delete(listener);
}

/** Merges a change into a machine's status; lastSyncAt and lastError carry over unless overridden. */
export function recordSyncStatus(machineId: string, patch: Partial<SyncStatus> & { state: SyncState }): void {
  statuses.set(machineId, { ...getSyncStatus(machineId), ...patch });
  for (const listener of [...statusListeners]) listener();
}

function pendingCount(machineId: string): number {
  try {
    return takeOutbox(machineId).length;
  } catch {
    return 0;
  }
}

export type SyncRequest = (method: string, params: unknown) => Promise<unknown>;

function applyIncoming(machineId: string, records: readonly SyncRecord[]): void {
  applyRemoteProjectRecords(machineId, records);
  applyRemoteGroupRecords(machineId, records);
  applyRemoteLockRecords(machineId, records);
}

function asObject(result: unknown, method: string): Record<string, unknown> {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error(`${method} returned a malformed result`);
  }
  return result as Record<string, unknown>;
}

function parsePushResult(result: unknown): SyncPushResult {
  const raw = asObject(result, "sync.push");
  const applied = (Array.isArray(raw.applied) ? raw.applied : []).flatMap((entry) => {
    const record = parseSyncRecord({ ...(entry as object), value: null });
    return record ? [{ table: record.table, id: record.id, rev: record.rev }] : [];
  });
  const rejected = (Array.isArray(raw.rejected) ? raw.rejected : []).flatMap((entry) => {
    const current = parseSyncRecord((entry as { current?: unknown } | null)?.current);
    return current ? [{ table: current.table, id: current.id, current }] : [];
  });
  return { rev: Number.isInteger(raw.rev) ? (raw.rev as number) : 0, applied, rejected };
}

/** One push-then-pull round for a single peer. Project/rail capture always
 * runs before group capture, so an assignment for a path captured in this
 * same cycle (Task 7) is queued immediately rather than next cycle. */
export async function runSyncCycle(machineId: string, request: SyncRequest): Promise<void> {
  recordSyncStatus(machineId, { state: "syncing" });
  try {
    await runSyncCycleInner(machineId, request);
  } catch (error) {
    console.warn("[sync]", machineId, error);
    recordSyncStatus(machineId, {
      state: "error",
      lastError: remoteErrorText(error),
      pendingOps: pendingCount(machineId),
    });
    throw error;
  }
  recordSyncStatus(machineId, {
    state: "ok",
    lastSyncAt: Date.now(),
    lastError: undefined,
    pendingOps: pendingCount(machineId),
  });
}

async function runSyncCycleInner(machineId: string, request: SyncRequest): Promise<void> {
  captureLocalProjectChanges(machineId);
  captureLocalGroupChanges(machineId, localProjectIdsByPath());
  captureLocalLockChanges(machineId);

  const outbox = takeOutbox(machineId);
  if (outbox.length > 0) {
    const pushResult = parsePushResult(await request("sync.push", { ops: outbox }));
    const toAdopt = applyPushResult(machineId, pushResult, outbox);
    if (toAdopt.length > 0) {
      const overwrote = toAdopt.some((record) => {
        const sent = outbox.find((op) => op.table === record.table && op.id === record.id);
        return !!sent && JSON.stringify(sent.value) !== JSON.stringify(record.value);
      });
      applyIncoming(machineId, toAdopt);
      if (overwrote) for (const listener of [...mergedListeners]) listener();
    }
  }

  const pullRaw = asObject(await request("sync.pull", { sinceRev: peerRev(machineId) }), "sync.pull");
  const records = (Array.isArray(pullRaw.records) ? pullRaw.records : []).flatMap((entry) => {
    const record = parseSyncRecord(entry);
    return record ? [record] : [];
  });
  if (records.length > 0) {
    applyIncoming(machineId, records.filter((record) => !hasPendingOp(machineId, record.table, record.id)));
    markPulled(machineId, records);
  }
  if (Number.isInteger(pullRaw.rev)) setPeerRev(machineId, pullRaw.rev as number);
}

const CYCLE_INTERVAL_MS = 10_000;

let activeSyncNow: ((machineId?: string) => Promise<void>) | undefined;

/** Runs a cycle now through the running loop (all machines, or just one when
 * the loop is idle); resolves when done. No-op if the loop isn't started. */
export function syncNow(machineId?: string): Promise<void> {
  return activeSyncNow ? activeSyncNow(machineId) : Promise.resolve();
}

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
  let current: Promise<void> = Promise.resolve();
  const runAll = (only?: string): Promise<void> => {
    if (running) {
      pending = true;
      return current;
    }
    running = true;
    current = (async () => {
      try {
        for (const machineId of only ? [only] : listMachineIds()) {
          await runSyncCycle(machineId, requestFor(machineId)).catch(() => undefined);
        }
      } finally {
        running = false;
      }
      if (pending) {
        pending = false;
        await runAll();
      }
    })();
    return current;
  };
  const timer = setInterval(() => void runAll(), CYCLE_INTERVAL_MS);
  void runAll();
  activeSyncNow = runAll;
  return {
    stop: () => {
      clearInterval(timer);
      if (activeSyncNow === runAll) activeSyncNow = undefined;
    },
    nudge: () => void runAll(),
  };
}
