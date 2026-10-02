import { applyRemoteAppearanceRecords, captureLocalAppearanceChanges } from "./syncAppearance";
import { applyRemoteGroupRecords, captureLocalGroupChanges } from "./syncGroups";
import { applyRemoteLockRecords, captureLocalLockChanges } from "./syncLock";
import { applyRemoteProjectRecords, captureLocalProjectChanges, localProjectIdsByPath } from "./syncProjects";
import { adoptLocalProjects, autoAddRemoteProjects, nameAutoAddedProjects } from "./syncRemoteProjects";
import { canonicalJson } from "./canonicalJson";
import {
  applyPushResult,
  hasPendingOp,
  hasPulled,
  markPullCompleted,
  markPulled,
  peerRev,
  setPeerRev,
  takeOutbox,
} from "./syncPeerState";
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
export const SYNC_UNSUPPORTED_MESSAGE = "Update the host on this machine";

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

let syncWriteDepth = 0;

/** True while sync itself is touching local library state (capturing it or
 * applying host records). Change events fired in that window are sync's own
 * echo and must not schedule another cycle. */
export function isApplyingRemote(): boolean {
  return syncWriteDepth > 0;
}

function duringSyncWrite<T>(run: () => T): T {
  syncWriteDepth += 1;
  try {
    return run();
  } finally {
    syncWriteDepth -= 1;
  }
}

function applyIncoming(machineId: string, records: readonly SyncRecord[]): void {
  duringSyncWrite(() => {
    applyRemoteProjectRecords(machineId, records);
    applyRemoteGroupRecords(machineId, records);
    applyRemoteAppearanceRecords(machineId, records);
    applyRemoteLockRecords(machineId, records);
  });
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

/** One push-then-pull round for a single peer (pull first on first contact,
 * so local state never overwrites host state this machine has not read).
 * Project/rail capture always runs before group capture, so an assignment
 * for a path captured in this same cycle is queued immediately. */
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
  // Needs the records just pulled; an unreachable machine is retried later
  // and never fails the cycle.
  const adopted = await adoptLocalProjects().catch(() => []);
  const added = await autoAddRemoteProjects().catch(() => []);
  // After this cycle's apply step, so a label that came with it wins.
  duringSyncWrite(() => nameAutoAddedProjects(machineId, [...adopted, ...added]));
  recordSyncStatus(machineId, {
    state: "ok",
    lastSyncAt: Date.now(),
    lastError: undefined,
    pendingOps: pendingCount(machineId),
  });
}

async function pullAndApply(machineId: string, request: SyncRequest): Promise<void> {
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
  markPullCompleted(machineId);
}

async function runSyncCycleInner(machineId: string, request: SyncRequest): Promise<void> {
  if (!hasPulled(machineId)) await pullAndApply(machineId, request);

  duringSyncWrite(() => {
    captureLocalProjectChanges(machineId);
    captureLocalGroupChanges(machineId, localProjectIdsByPath());
    captureLocalAppearanceChanges(machineId, localProjectIdsByPath());
    captureLocalLockChanges(machineId);
  });

  const outbox = takeOutbox(machineId);
  if (outbox.length > 0) {
    const pushResult = parsePushResult(await request("sync.push", { ops: outbox }));
    const toAdopt = applyPushResult(machineId, pushResult, outbox);
    if (toAdopt.length > 0) {
      const overwrote = toAdopt.some((record) => {
        const sent = outbox.find((op) => op.table === record.table && op.id === record.id);
        return !!sent && canonicalJson(sent.value) !== canonicalJson(record.value);
      });
      applyIncoming(machineId, toAdopt);
      if (overwrote) for (const listener of [...mergedListeners]) listener();
    }
  }

  await pullAndApply(machineId, request);
}

export const CYCLE_INTERVAL_MS = 30_000;
/** Cycles never start closer together than this; requests inside the window collapse into one trailing run. */
export const MIN_CYCLE_SPACING_MS = 3_000;

let activeSyncNow: ((machineId?: string) => Promise<void>) | undefined;

/** Runs a cycle now through the running loop (all machines, or just one when
 * the loop is idle); resolves when done. No-op if the loop isn't started. A
 * machine the loop does not sync is marked unsupported instead of being left
 * with whatever status it showed before. */
export function syncNow(machineId?: string): Promise<void> {
  return activeSyncNow ? activeSyncNow(machineId) : Promise.resolve();
}

/**
 * Runs a sync cycle for every currently known peer, on an interval and
 * whenever `nudge()` (returned alongside the stop function) is called.
 * Interval ticks and nudges respect `MIN_CYCLE_SPACING_MS`; an explicit
 * `syncNow` does not.
 */
export function startSyncLoop(
  listMachineIds: () => readonly string[],
  requestFor: (machineId: string) => SyncRequest,
): { stop: () => void; nudge: () => void } {
  let running = false;
  let pending = false;
  let stopped = false;
  let lastEndedAt = Number.NEGATIVE_INFINITY;
  let trailing: ReturnType<typeof setTimeout> | undefined;
  let current: Promise<void> = Promise.resolve();

  const start = (only?: string): Promise<void> => {
    running = true;
    if (!only && trailing !== undefined) {
      clearTimeout(trailing);
      trailing = undefined;
    }
    current = (async () => {
      try {
        const eligible = listMachineIds();
        if (only && !eligible.includes(only)) {
          const state = getSyncStatus(only).state;
          if (state !== "unsupported" && state !== "unlinked") {
            recordSyncStatus(only, { state: "unsupported", lastError: SYNC_UNSUPPORTED_MESSAGE });
          }
        }
        for (const machineId of only ? eligible.filter((id) => id === only) : eligible) {
          await runSyncCycle(machineId, requestFor(machineId)).catch(() => undefined);
        }
      } finally {
        running = false;
        lastEndedAt = Date.now();
      }
      if (pending) {
        pending = false;
        schedule();
      }
    })();
    return current;
  };
  const schedule = (): void => {
    if (stopped || trailing !== undefined) return;
    const wait = Math.max(0, lastEndedAt + MIN_CYCLE_SPACING_MS - Date.now());
    trailing = setTimeout(() => {
      trailing = undefined;
      requestRun();
    }, wait);
  };
  const requestRun = (): void => {
    if (stopped) return;
    if (running) pending = true;
    else if (Date.now() - lastEndedAt < MIN_CYCLE_SPACING_MS) schedule();
    else void start();
  };
  const runNow = (only?: string): Promise<void> => {
    if (running) {
      pending = true;
      return current;
    }
    return start(only);
  };
  const timer = setInterval(requestRun, CYCLE_INTERVAL_MS);
  requestRun();
  activeSyncNow = runNow;
  return {
    stop: () => {
      stopped = true;
      clearInterval(timer);
      if (trailing !== undefined) clearTimeout(trailing);
      trailing = undefined;
      if (activeSyncNow === runNow) activeSyncNow = undefined;
    },
    nudge: requestRun,
  };
}
