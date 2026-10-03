import { remoteRequest } from "../../connections/model/connections";
import { isLocalSyncMachine } from "../../connections/model/localSync";
import {
  isRemoteProvider,
  type HostProject,
  type RemoteMachine,
} from "../../connections/model/protocol";
import {
  backgroundMachineFor,
  backgroundMachines,
  hostProjectCwd,
  hostProjectFor,
} from "../../automations/model/hostAutomationClient";
import type { HarnessId, RuntimeMode } from "../../sessions/model/session";
import {
  HOST_TASKS,
  taskColumn,
  type HostTask,
  type HostTaskInput,
  type TaskColumn,
  type TaskStatus,
} from "./hostTasks";

export const TASK_MACHINE_ERROR =
  "This project’s machine isn’t connected, or its MonoCode Host needs an update.";
export const TASK_AGENT_ERROR = "This agent cannot run tasks in the background.";

/** A host task as this desktop shows it: on its machine, in its project. */
export type BoardTask = HostTask & {
  machineId: string;
  machineName: string;
  /** How this desktop addresses the task's project. */
  cwd: string;
};

/** What the task form edits. A draft with an ID edits that task. */
export type TaskDraft = {
  id?: string;
  title: string;
  prompt: string;
  cwd: string;
  harness: HarnessId;
  model: string;
  modelSettings: Record<string, string>;
  runtimeMode: RuntimeMode;
  maxRunMinutes: number;
  /** Run on a new branch of its own when the project is a git repository. */
  isolate: boolean;
  /** Empty for no check. */
  verifyCommand: string;
  review: boolean;
};

/** Machines whose host keeps a task board, this computer's included. */
export function taskMachines(): Promise<RemoteMachine[]> {
  return backgroundMachines(HOST_TASKS);
}

export function newTaskDraft(
  cwd: string,
  harness: HarnessId,
  model: string,
): TaskDraft {
  return {
    title: "",
    prompt: "",
    cwd,
    harness,
    model,
    modelSettings: {},
    runtimeMode: "auto",
    maxRunMinutes: 0,
    isolate: true,
    verifyCommand: "",
    review: true,
  };
}

export function draftFromTask(task: BoardTask): TaskDraft {
  return {
    id: task.id,
    title: task.title,
    prompt: task.prompt,
    cwd: task.cwd,
    harness: task.harness,
    model: task.model,
    modelSettings: task.modelSettings,
    runtimeMode: task.runtimeMode,
    maxRunMinutes: task.maxRunMinutes,
    isolate: task.isolate !== false,
    verifyCommand: task.verifyCommand ?? "",
    review: task.review !== false,
  };
}

export function boardTaskFromHost(
  machine: RemoteMachine,
  cwd: string,
  task: HostTask,
): BoardTask {
  return {
    ...task,
    machineId: machine.id,
    machineName: isLocalSyncMachine(machine) ? "this computer" : machine.name,
    cwd,
  };
}

/** One machine's tasks on the board. A task whose project the host no longer
 * has is left out. */
export function boardTasksFromHost(
  machine: RemoteMachine,
  projects: readonly HostProject[],
  tasks: readonly HostTask[],
): BoardTask[] {
  return tasks.flatMap((task) => {
    const project = projects.find((entry) => entry.id === task.projectId);
    return project
      ? [boardTaskFromHost(machine, hostProjectCwd(machine, project), task)]
      : [];
  });
}

/** What the host stores for a draft. Throws when the draft's agent cannot run
 * on a host. */
export function hostTaskFromDraft(
  draft: TaskDraft,
  id: string,
  projectId: string,
): HostTaskInput {
  if (!isRemoteProvider(draft.harness)) throw new Error(TASK_AGENT_ERROR);
  return {
    id,
    title: draft.title,
    prompt: draft.prompt,
    projectId,
    harness: draft.harness,
    model: draft.model,
    modelSettings: draft.modelSettings,
    runtimeMode: draft.runtimeMode,
    maxRunMinutes: draft.maxRunMinutes,
    isolate: draft.isolate,
    ...(draft.verifyCommand.trim()
      ? { verifyCommand: draft.verifyCommand.trim() }
      : {}),
    review: draft.review,
  };
}

/** The board's tasks in one column, oldest first; finished columns show the
 * most recently finished first. */
export function tasksInColumn(
  tasks: readonly BoardTask[],
  status: TaskColumn,
): BoardTask[] {
  const column = tasks.filter((task) => taskColumn(task.status) === status);
  return status === "queued" || status === "running"
    ? column.sort((a, b) => a.createdAt - b.createdAt)
    : column.sort(
        (a, b) => (b.completedAt ?? b.updatedAt) - (a.completedAt ?? a.updatedAt),
      );
}

/** A span of time as a card shows it: "under 1m", "12m", "3h 5m", "2d 4h". */
export function formatTaskSpan(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  if (minutes < 1) return "under 1m";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24)
    return minutes % 60 ? `${hours}h ${minutes % 60}m` : `${hours}h`;
  return hours % 24
    ? `${Math.floor(hours / 24)}d ${hours % 24}h`
    : `${Math.floor(hours / 24)}d`;
}

/** When a card's task got to where it is: how long it has waited or run, or
 * how long ago it finished. */
export function taskTimeLabel(
  task: Pick<
    HostTask,
    "status" | "createdAt" | "updatedAt" | "startedAt" | "completedAt"
  >,
  now: number,
): string {
  if (task.status === "queued")
    return `Waiting ${formatTaskSpan(now - task.updatedAt)}`;
  if (task.status === "running")
    return `Running ${formatTaskSpan(now - (task.startedAt ?? task.updatedAt))}`;
  if (task.status === "verifying")
    return `Verifying ${formatTaskSpan(now - task.updatedAt)}`;
  return `${task.status === "blocked" ? "Stopped" : "Finished"} ${formatTaskSpan(
    now - (task.completedAt ?? task.updatedAt),
  )} ago`;
}

/** Every reachable machine's tasks. A machine that does not answer is left out
 * rather than failing the board. */
export async function listBoardTasks(
  machines: readonly RemoteMachine[],
): Promise<BoardTask[]> {
  const lists = await Promise.all(
    machines.map(async (machine) => {
      try {
        const [tasks, projects] = await Promise.all([
          remoteRequest<HostTask[]>(machine.id, "tasks.list"),
          remoteRequest<HostProject[]>(machine.id, "projects.list"),
        ]);
        return boardTasksFromHost(machine, projects, tasks);
      } catch {
        return [];
      }
    }),
  );
  return lists.flat();
}

/** Saves the draft on the machine that owns its project. */
export async function saveTask(
  machines: readonly RemoteMachine[],
  draft: TaskDraft,
): Promise<BoardTask> {
  const machine = backgroundMachineFor(machines, draft.cwd);
  if (!machine) throw new Error(TASK_MACHINE_ERROR);
  const project = await hostProjectFor(machine, draft.cwd);
  const saved = await remoteRequest<HostTask>(
    machine.id,
    "tasks.save",
    {
      task: hostTaskFromDraft(
        draft,
        draft.id ?? crypto.randomUUID(),
        project.id,
      ),
    },
    false,
    true,
  );
  return boardTaskFromHost(machine, hostProjectCwd(machine, project), saved);
}

export async function moveTask(
  task: BoardTask,
  to: TaskStatus,
): Promise<BoardTask> {
  const moved = await remoteRequest<HostTask>(
    task.machineId,
    "tasks.move",
    { taskId: task.id, to },
    false,
    true,
  );
  return { ...task, ...moved };
}

/** `discard` also removes the branch and worktree of a task that was never
 * merged; the host refuses to delete such a task without it. */
export async function deleteTask(
  task: BoardTask,
  discard = false,
): Promise<void> {
  await remoteRequest(
    task.machineId,
    "tasks.delete",
    { taskId: task.id, ...(discard ? { discard: true } : {}) },
    false,
    true,
  );
}
