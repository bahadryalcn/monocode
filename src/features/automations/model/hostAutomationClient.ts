import { invoke } from "@tauri-apps/api/core";
import { remoteRequest } from "../../connections/model/connections";
import { isLocalSyncMachine } from "../../connections/model/localSync";
import {
  isRemoteProvider,
  type HostProject,
  type RemoteMachine,
} from "../../connections/model/protocol";
import {
  parseRemotePath,
  remotePath,
} from "../../connections/model/remoteProjects";
import { pathKey } from "../../../shared/lib/paths";
import {
  createAutomationTrigger,
  type Automation,
  type AutomationDraft,
  type AutomationRun,
} from "./automations";
import {
  HOST_AUTOMATIONS,
  type HostAutomation,
  type HostAutomationInput,
  type HostAutomationRun,
} from "./hostAutomations";

export const BACKGROUND_TRIGGER_ERROR =
  "A background automation runs on one schedule. Remove the other triggers.";
export const BACKGROUND_MACHINE_ERROR =
  "This project’s machine isn’t connected, or its MonoCode Host needs an update.";

/** Machines whose host runs automations on its own, this computer's included. */
export async function backgroundMachines(): Promise<RemoteMachine[]> {
  const machines = await invoke<RemoteMachine[]>("remote_machines");
  const capable = await Promise.all(
    (Array.isArray(machines) ? machines : []).map(async (machine) => {
      try {
        const host = await remoteRequest<{ capabilities?: unknown }>(
          machine.id,
          "environment.describe",
        );
        return Array.isArray(host.capabilities) &&
          host.capabilities.includes(HOST_AUTOMATIONS)
          ? machine
          : null;
      } catch {
        return null;
      }
    }),
  );
  return capable.filter((machine) => machine !== null);
}

/** The machine that would run a background automation for the project at
 * `cwd`: the project's own machine, or this computer's host for a local one. */
export function backgroundMachineFor(
  machines: readonly RemoteMachine[],
  cwd: string,
): RemoteMachine | undefined {
  const remote = parseRemotePath(cwd);
  return remote
    ? machines.find((machine) => machine.environmentId === remote.environmentId)
    : machines.find(isLocalSyncMachine);
}

/** How this desktop addresses a host project: a plain path when the host is
 * this computer, a `remote://` path otherwise. */
export function hostProjectCwd(
  machine: RemoteMachine,
  project: HostProject,
): string {
  return isLocalSyncMachine(machine)
    ? project.cwd
    : remotePath(machine.environmentId, project.cwd);
}

export function automationFromHost(
  machine: RemoteMachine,
  cwd: string,
  host: HostAutomation,
): Automation {
  return {
    id: host.id,
    name: host.name,
    prompt: host.prompt,
    harness: host.harness,
    model: host.model,
    modelSettings: host.modelSettings,
    cwd,
    workspaceMode: "current",
    reuseSession: false,
    runtimeMode: host.runtimeMode,
    triggerKind: "time",
    triggerEvent: "",
    scheduleKind: host.scheduleKind,
    minute: host.minute,
    time: host.time,
    dayOfWeek: host.dayOfWeek,
    triggers: [
      createAutomationTrigger("time", host.scheduleKind, {
        id: `${host.id}:time`,
        scheduleKind: host.scheduleKind,
        minute: host.minute,
        time: host.time,
        dayOfWeek: host.dayOfWeek,
      }),
    ],
    missedRunGraceMinutes: 720,
    maxRunMinutes: host.maxRunMinutes,
    maxRunsPerDay: host.maxRunsPerDay,
    enabled: host.enabled,
    nextRunAt: host.nextRunAt,
    lastRunAt: host.lastRunAt,
    lastRunStatus: host.lastRunStatus,
    lastRunError: host.lastRunError,
    lastSessionId: host.lastSessionId,
    createdAt: host.createdAt,
    updatedAt: host.updatedAt,
    host: {
      machineId: machine.id,
      machineName: isLocalSyncMachine(machine) ? "this computer" : machine.name,
      projectId: host.projectId,
    },
  };
}

/** What the host stores for a draft. Throws when the draft uses something a
 * background automation cannot do. */
export function hostAutomationFromDraft(
  draft: AutomationDraft,
  id: string,
  projectId: string,
): HostAutomationInput {
  const [trigger, ...others] = draft.triggers;
  if (!trigger || trigger.kind !== "time" || others.length > 0)
    throw new Error(BACKGROUND_TRIGGER_ERROR);
  if (!isRemoteProvider(draft.harness))
    throw new Error("This agent cannot run in the background.");
  return {
    id,
    name: draft.name,
    prompt: draft.prompt,
    projectId,
    harness: draft.harness,
    model: draft.model,
    modelSettings: draft.modelSettings,
    runtimeMode: draft.runtimeMode,
    scheduleKind: trigger.scheduleKind,
    minute: trigger.minute,
    time: trigger.time,
    dayOfWeek: trigger.dayOfWeek,
    maxRunMinutes: draft.maxRunMinutes,
    maxRunsPerDay: draft.maxRunsPerDay,
    enabled: draft.enabled,
  };
}

/** Every reachable machine's background automations. A machine that does not
 * answer is left out rather than failing the list. */
export async function listHostAutomations(
  machines: readonly RemoteMachine[],
): Promise<Automation[]> {
  const lists = await Promise.all(
    machines.map(async (machine) => {
      try {
        const [automations, projects] = await Promise.all([
          remoteRequest<HostAutomation[]>(machine.id, "automations.list"),
          remoteRequest<HostProject[]>(machine.id, "projects.list"),
        ]);
        return automations.flatMap((automation) => {
          const project = projects.find(
            (entry) => entry.id === automation.projectId,
          );
          return project
            ? [
                automationFromHost(
                  machine,
                  hostProjectCwd(machine, project),
                  automation,
                ),
              ]
            : [];
        });
      } catch {
        return [];
      }
    }),
  );
  return lists.flat();
}

export async function saveHostAutomation(
  machines: readonly RemoteMachine[],
  draft: AutomationDraft,
): Promise<Automation> {
  const machine = backgroundMachineFor(machines, draft.cwd);
  if (!machine) throw new Error(BACKGROUND_MACHINE_ERROR);
  const hostPath = parseRemotePath(draft.cwd)?.hostPath ?? draft.cwd;
  const projects = await remoteRequest<HostProject[]>(
    machine.id,
    "projects.list",
  );
  const project =
    projects.find((entry) => pathKey(entry.cwd) === pathKey(hostPath)) ??
    (await remoteRequest<HostProject>(machine.id, "projects.open", {
      cwd: hostPath,
    }));
  const saved = await remoteRequest<HostAutomation>(
    machine.id,
    "automations.save",
    {
      automation: hostAutomationFromDraft(
        draft,
        draft.id ?? crypto.randomUUID(),
        project.id,
      ),
    },
    false,
    true,
  );
  return automationFromHost(machine, hostProjectCwd(machine, project), saved);
}

export async function deleteHostAutomation(
  automation: Automation,
): Promise<void> {
  if (!automation.host) return;
  await remoteRequest(
    automation.host.machineId,
    "automations.delete",
    { automationId: automation.id },
    false,
    true,
  );
}

export function listHostAutomationRuns(
  automation: Automation,
): Promise<AutomationRun[]> {
  if (!automation.host) return Promise.resolve([]);
  return remoteRequest<HostAutomationRun[]>(
    automation.host.machineId,
    "automations.runs",
    { automationId: automation.id },
  );
}

export async function runHostAutomationNow(
  automation: Automation,
): Promise<void> {
  if (!automation.host) return;
  await remoteRequest(
    automation.host.machineId,
    "automations.runNow",
    { automationId: automation.id },
    false,
    true,
  );
}
