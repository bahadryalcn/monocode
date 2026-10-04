import { isLocalSyncMachine } from "../../connections/model/localSync";
import type { RemoteMachine } from "../../connections/model/protocol";

/** What one machine gave for one list. On "error", `data` is what the machine
 * last answered successfully (flagged stale), or empty if it never did. */
export type MachineResult<T> = {
  machineId: string;
  machineName: string;
  status: "ok" | "error";
  data: T[];
  /** `data` is a last-known answer, not a current one. */
  stale: boolean;
  error?: string;
};

/** The last successful list of each machine, by machine ID. */
export type LastGoodLists<T> = Map<string, T[]>;

export function machineDisplayName(machine: RemoteMachine): string {
  return isLocalSyncMachine(machine) ? "this computer" : machine.name;
}

/** Loads every machine's list. A machine that fails keeps its last successful
 * list (marked stale by `markStale`) instead of reporting an empty one; a
 * successful empty list replaces it. `down` machines are known to be
 * unreachable and are not asked at all. */
export async function collectMachineResults<T>(
  lastGood: LastGoodLists<T>,
  machines: readonly RemoteMachine[],
  load: (machine: RemoteMachine) => Promise<T[]>,
  markStale: (item: T) => T,
  down: readonly RemoteMachine[] = [],
): Promise<MachineResult<T>[]> {
  const failed = (machine: RemoteMachine, error: string): MachineResult<T> => {
    const previous = lastGood.get(machine.id);
    return {
      machineId: machine.id,
      machineName: machineDisplayName(machine),
      status: "error",
      data: previous ? previous.map(markStale) : [],
      stale: previous !== undefined && previous.length > 0,
      error,
    };
  };
  const asked = await Promise.all(
    machines.map(async (machine): Promise<MachineResult<T>> => {
      try {
        const data = await load(machine);
        lastGood.set(machine.id, data);
        return {
          machineId: machine.id,
          machineName: machineDisplayName(machine),
          status: "ok",
          data,
          stale: false,
        };
      } catch (reason: unknown) {
        return failed(
          machine,
          reason instanceof Error ? reason.message : String(reason),
        );
      }
    }),
  );
  return [
    ...asked,
    ...down.map((machine) => failed(machine, "The machine is not reachable.")),
  ];
}

/** Names of the machines that did not answer. */
export function failedMachineNames(
  results: readonly MachineResult<unknown>[],
): string[] {
  return results
    .filter((result) => result.status === "error")
    .map((result) => result.machineName);
}

/** Names of the machines whose shown cards are a last-known answer. */
export function staleMachineNames(
  results: readonly MachineResult<unknown>[],
): string[] {
  return results.filter((result) => result.stale).map((r) => r.machineName);
}
