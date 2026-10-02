import { invoke } from "@tauri-apps/api/core";
import {
  cachedRemoteCapabilities,
  loadRemoteCapabilities,
  remoteRequest,
} from "../../connections/model/connections";
import type { RemoteMachine } from "../../connections/model/protocol";
import { subscribeLockRecordChanges } from "../../group-lock/model/groupLock";
import { subscribeProjectPathsChanged } from "../../projects/model/recents";
import { startSyncLoop } from "./syncClient";

export function collectSyncMachineIds(machines: readonly RemoteMachine[]): string[] {
  return machines.map((machine) => machine.id);
}

/** Older hosts don't know the sync methods and would answer "Unsupported host method". */
export function machineSupportsSync(capabilities: string[] | undefined): boolean {
  return !!capabilities?.includes("sync");
}

export const UNSUPPORTED_RECHECK_MS = 5 * 60_000;
export const NUDGE_DEBOUNCE_MS = 500;

/** Whether a machine's capabilities must be (re)loaded: never seen, or
 * advertised without "sync" and not checked in the last few minutes. */
export function shouldLoadCapabilities(
  capabilities: string[] | undefined,
  lastCheckedAt: number | undefined,
  now: number,
): boolean {
  if (capabilities === undefined) return true;
  if (machineSupportsSync(capabilities)) return false;
  return lastCheckedAt === undefined || now - lastCheckedAt >= UNSUPPORTED_RECHECK_MS;
}

/** Trailing-edge debounce; `cancel` drops a pending call. */
export function createDebouncer(run: () => void, delayMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    trigger() {
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        run();
      }, delayMs);
    },
    cancel() {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    },
  };
}

const lastCapabilityCheck = new Map<string, number>();

async function syncCapableMachines(machines: readonly RemoteMachine[]): Promise<RemoteMachine[]> {
  const checked = await Promise.all(
    machines.map(async (machine) => {
      let capabilities = cachedRemoteCapabilities(machine.environmentId);
      const now = Date.now();
      if (shouldLoadCapabilities(capabilities, lastCapabilityCheck.get(machine.id), now)) {
        lastCapabilityCheck.set(machine.id, now);
        capabilities =
          (await loadRemoteCapabilities(machine.environmentId).catch(() => undefined)) ?? capabilities;
      }
      return machineSupportsSync(capabilities) ? machine : undefined;
    }),
  );
  return checked.filter((machine): machine is RemoteMachine => !!machine);
}

let started = false;

/**
 * Starts this desktop's side of project/group sync: links to a MonoCode
 * Host running on this same machine when there is one (a no-op most of the
 * time), then runs the sync loop against every saved machine whose host
 * advertises the "sync" capability. Safe to call more than once; only the
 * first call does anything.
 */
export function startAppSync(): () => void {
  if (started) return () => {};
  started = true;
  let machines: readonly RemoteMachine[] = [];
  let stopped = false;
  const refreshMachines = () =>
    invoke<RemoteMachine[]>("remote_machines")
      .then((value) => syncCapableMachines(Array.isArray(value) ? value : []))
      .then((value) => {
        if (!stopped) machines = value;
      })
      .catch(() => undefined);
  const loop = startSyncLoop(
    () => collectSyncMachineIds(machines),
    (machineId) => (method, params) => remoteRequest(machineId, method, params),
  );
  void invoke("local_host_connect")
    .catch(() => undefined)
    .then(refreshMachines)
    .then(() => {
      if (!stopped) loop.nudge();
    });
  const nudger = createDebouncer(() => loop.nudge(), NUDGE_DEBOUNCE_MS);
  const unsubscribePaths = subscribeProjectPathsChanged(nudger.trigger);
  const unsubscribeLock = subscribeLockRecordChanges(nudger.trigger);
  const interval = setInterval(refreshMachines, 30_000);
  return () => {
    started = false;
    stopped = true;
    loop.stop();
    nudger.cancel();
    unsubscribePaths();
    unsubscribeLock();
    clearInterval(interval);
  };
}
