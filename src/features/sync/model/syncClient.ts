import { applyRemoteGroupRecords, captureLocalGroupChanges } from "./syncGroups";
import { applyRemoteLockRecords, captureLocalLockChanges } from "./syncLock";
import { applyRemoteProjectRecords, captureLocalProjectChanges, localProjectIdsByPath } from "./syncProjects";
import { applyPushResult, hasPendingOp, markPulled, peerRev, setPeerRev, takeOutbox } from "./syncPeerState";
import { parseSyncRecord } from "./syncProtocol";
import type { SyncPushResult, SyncRecord } from "./syncProtocol";

const mergedListeners = new Set<() => void>();

/** Fires when a push was rejected and the host's value replaced a local edit. */
export function subscribeSyncMerged(listener: () => void): () => void {
  mergedListeners.add(listener);
  return () => void mergedListeners.delete(listener);
}

export const SYNC_MERGED_MESSAGE = "This change was merged with an update from your other machine.";

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
