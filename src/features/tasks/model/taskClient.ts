import { remoteRequest as sendHostRequest } from "../../connections/model/connections";
import { subscribeRemoteMachineChannel } from "../../connections/model/remoteMachineChannel";
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
  probeMachines,
  type MachineReach,
} from "../../automations/model/hostAutomationClient";
import {
  collectMachineResults,
  type LastGoodLists,
  type MachineResult,
} from "../../automations/model/machineResults";
import {
  machineProjects,
  machineCapabilities,
} from "../../automations/model/machineSnapshot";
import type { HarnessId, RuntimeMode } from "../../sessions/model/session";
import {
  HOST_TASKS,
  HOST_TASKS_TODO,
  taskColumn,
  type HostTask,
  type HostTaskInput,
  type TaskColumn,
  type TaskStatus,
} from "./hostTasks";

export const TASK_MACHINE_ERROR =
  "This project’s machine isn’t connected, or its MonoCode Host needs an update.";
export const TASK_AGENT_ERROR =
  "This agent cannot run tasks in the background.";

/** A host task as this desktop shows it: on its machine, in its project. */
export type BoardTask = HostTask & {
  machineId: string;
  machineName: string;
  /** How this desktop addresses the task's project. */
  cwd: string;
  /** The machine did not answer; this is what it last reported. */
  stale?: boolean;
  reviewRecheckSupported?: boolean;
  blockedTakeoverSupported?: boolean;
};

/** What the task form edits. A draft with an ID edits that task. */
export type TaskDraft = {
  id?: string;
  /** The status of the task being edited. */
  status?: TaskStatus;
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
  /** Merge the branch once every check passes, without waiting for approval. */
  autoMerge: boolean;
};

/** Machines whose host keeps a task board, this computer's included. */
export function taskMachines(): Promise<RemoteMachine[]> {
  return backgroundMachines(HOST_TASKS);
}

/** Like `taskMachines`, plus the machines whose tasks cannot be shown. */
export function probeTaskMachines(): Promise<MachineReach> {
  return probeMachines(HOST_TASKS);
}

/** Why some machines' tasks are missing from the board, or null. */
export function missingMachinesNotice(
  reach: Pick<MachineReach, "outdated" | "unreachable">,
  /** Unreachable machines whose last-known tasks are still shown. */
  stale: readonly string[] = [],
): string | null {
  const parts: string[] = [];
  const unreachable = (names: string[], shown: boolean) => {
    if (!names.length) return;
    const one = names.length === 1;
    parts.push(
      `${names.join(", ")} ${one ? "isn’t" : "aren’t"} reachable right now, so ${one ? "its" : "their"} tasks ${shown ? "may be out of date" : "aren’t shown"}.`,
    );
  };
  unreachable(
    reach.unreachable.filter((name) => !stale.includes(name)),
    false,
  );
  unreachable(
    reach.unreachable.filter((name) => stale.includes(name)),
    true,
  );
  if (reach.outdated.length)
    parts.push(
      `Update MonoCode Host on ${reach.outdated.join(", ")} to see ${reach.outdated.length === 1 ? "its" : "their"} tasks.`,
    );
  return parts.length ? parts.join(" ") : null;
}

/** Machines whose host also keeps manual to-do items. */
export function todoMachines(): Promise<RemoteMachine[]> {
  return backgroundMachines(HOST_TASKS_TODO);
}

/** Why a to-do item cannot be added for the project at `cwd`: its machine
 * has a task board but an older host. Undefined when it can be added, or when
 * there is no machine at all, which has its own message. */
export function todoUnsupportedMessage(
  machines: readonly RemoteMachine[],
  todoCapable: readonly RemoteMachine[],
  cwd: string,
): string | undefined {
  const machine = backgroundMachineFor(machines, cwd);
  if (!machine || todoCapable.some((entry) => entry.id === machine.id))
    return undefined;
  return `Update MonoCode Host on ${
    isLocalSyncMachine(machine) ? "this computer" : machine.name
  } to add to-do items`;
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
    autoMerge: false,
  };
}

export function draftFromTask(task: BoardTask): TaskDraft {
  return {
    id: task.id,
    status: task.status,
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
    autoMerge: task.autoMerge === true,
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
    ...(draft.autoMerge && draft.isolate ? { autoMerge: true } : {}),
  };
}

/** The board's tasks in one column, oldest first; finished columns show the
 * most recently finished first. */
export function tasksInColumn(
  tasks: readonly BoardTask[],
  status: TaskColumn,
): BoardTask[] {
  const column = tasks.filter((task) => taskColumn(task.status) === status);
  return status === "todo" || status === "queued" || status === "running"
    ? column.sort((a, b) => a.createdAt - b.createdAt)
    : column.sort(
        (a, b) =>
          (b.completedAt ?? b.updatedAt) - (a.completedAt ?? a.updatedAt),
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
  if (task.status === "todo")
    return `Added ${formatTaskSpan(now - task.createdAt)} ago`;
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

const lastBoardTasks: LastGoodLists<BoardTask> = new Map();
const watchedTasks = new Map<
  string,
  {
    count: number;
    dirty: boolean;
    etag: string;
    stop: () => void;
    listeners: Set<() => void>;
  }
>();
function remoteRequest<T>(
  ...args: Parameters<typeof sendHostRequest>
): Promise<T> {
  return sendHostRequest<T>(...args).then((value) => {
    if (args[1] !== "tasks.list") {
      const watch = watchedTasks.get(args[0]);
      if (watch) watch.dirty = true;
    }
    return value;
  });
}

/** Task metadata rides the existing machine lane. Board refreshes still update
 * goals/limits, but do not fetch an unchanged task list on capable hosts. */
export function subscribeBoardTaskChanges(
  machines: readonly RemoteMachine[],
  listener: () => void,
): () => void {
  let disposed = false;
  const releases: (() => void)[] = [];
  for (const machine of machines) {
    void machineCapabilities(machine)
      .then((capabilities) => {
        if (disposed || !capabilities.includes("machine.changes")) return;
        let entry = watchedTasks.get(machine.id);
        if (!entry) {
          entry = {
            count: 0,
            dirty: true,
            etag: "",
            stop: () => {},
            listeners: new Set(),
          };
          const current = entry;
          entry.stop = subscribeRemoteMachineChannel(
            machine.id,
            () => ({ tasksKnown: current.etag }),
            (changes) => {
              if (
                !changes.reset &&
                (!changes.tasks || changes.tasks.etag === current.etag)
              )
                return;
              if (changes.tasks) current.etag = changes.tasks.etag;
              current.dirty = true;
              for (const notify of current.listeners) {
                try {
                  notify();
                } catch {
                  /* other boards still receive invalidation */
                }
              }
            },
            () => {
              current.dirty = true;
              for (const notify of current.listeners) {
                try {
                  notify();
                } catch {
                  /* one failed board refresh cannot interrupt other boards */
                }
              }
            },
          );
          watchedTasks.set(machine.id, entry);
        }
        entry.count++;
        const notify = () => listener();
        entry.listeners.add(notify);
        const current = entry;
        releases.push(() => {
          current.listeners.delete(notify);
          if (--current.count === 0) {
            current.stop();
            watchedTasks.delete(machine.id);
          }
        });
      })
      .catch(() => {});
  }
  return () => {
    disposed = true;
    for (const release of releases) release();
  };
}

/** Each machine's tasks. A machine that does not answer keeps its last
 * successful list, flagged stale; `down` machines are not asked. */
export async function listBoardTaskResults(
  machines: readonly RemoteMachine[],
  down: readonly RemoteMachine[] = [],
  force = false,
): Promise<Array<MachineResult<BoardTask> & { cached?: boolean }>> {
  const cachedMachines = new Set<string>();
  const results = await collectMachineResults(
    lastBoardTasks,
    machines,
    async (machine) => {
      const watch = watchedTasks.get(machine.id);
      const cached = lastBoardTasks.get(machine.id);
      if (!force && watch && !watch.dirty && cached) {
        cachedMachines.add(machine.id);
        return cached;
      }
      if (watch) watch.dirty = false;
      try {
        const [tasks, projects, capabilities] = await Promise.all([
          remoteRequest<HostTask[]>(machine.id, "tasks.list"),
          machineProjects(machine),
          machineCapabilities(machine).catch(() => [] as string[]),
        ]);
        return boardTasksFromHost(machine, projects, tasks).map((task) => ({
          ...task,
          reviewRecheckSupported: capabilities.includes("tasks.review-recheck"),
          blockedTakeoverSupported: capabilities.includes("tasks.blocked-takeover"),
        }));
      } catch (error) {
        if (watch) watch.dirty = true;
        throw error;
      }
    },
    (task) => ({ ...task, stale: true }),
    down,
  );
  return results.map((result): MachineResult<BoardTask> & { cached?: boolean } =>
    cachedMachines.has(result.machineId) ? { ...result, cached: true } : result,
  );
}

/** Every machine's tasks, last-known ones included. */
export async function listBoardTasks(
  machines: readonly RemoteMachine[],
): Promise<BoardTask[]> {
  return (await listBoardTaskResults(machines)).flatMap(
    (result) => result.data,
  );
}

/** Saves the draft on the machine that owns its project. A new task is added
 * to the queue unless `status` says to do; editing keeps a task's status. */
export async function saveTask(
  machines: readonly RemoteMachine[],
  draft: TaskDraft,
  status: "todo" | "queued" = "queued",
): Promise<BoardTask> {
  const machine = backgroundMachineFor(machines, draft.cwd);
  if (!machine) throw new Error(TASK_MACHINE_ERROR);
  if (status === "todo" && !draft.id) {
    // An older host would queue the item and start it.
    const unsupported = todoUnsupportedMessage(
      machines,
      await todoMachines(),
      draft.cwd,
    );
    if (unsupported) throw new Error(unsupported);
  }
  const project = await hostProjectFor(machine, draft.cwd);
  const saved = await remoteRequest<HostTask>(
    machine.id,
    "tasks.save",
    {
      task: {
        ...hostTaskFromDraft(
          draft,
          draft.id ?? crypto.randomUUID(),
          project.id,
        ),
        // An older host starts every new task queued, and ignores this.
        ...(draft.id ? {} : { status }),
      },
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

export async function recheckTaskReview(task: BoardTask): Promise<BoardTask> {
  const updated = await remoteRequest<HostTask>(
    task.machineId,
    "tasks.review.recheck",
    { taskId: task.id },
    false,
    true,
  );
  return { ...task, ...updated };
}

export async function readTaskNotes(
  task: BoardTask,
  noteIds: string[],
): Promise<BoardTask> {
  const updated = await remoteRequest<HostTask>(
    task.machineId,
    "tasks.notes.read",
    { taskId: task.id, noteIds },
    false,
    true,
  );
  return { ...task, ...updated };
}

export async function resolveTaskNote(
  task: BoardTask,
  noteId: string,
  resolved: boolean,
): Promise<BoardTask> {
  const updated = await remoteRequest<HostTask>(
    task.machineId,
    "tasks.notes.resolve",
    { taskId: task.id, noteId, resolved },
    false,
    true,
  );
  return { ...task, ...updated };
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
