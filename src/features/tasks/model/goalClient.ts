import { remoteRequest } from "../../connections/model/connections";
import { isLocalSyncMachine } from "../../connections/model/localSync";
import {
  isRemoteProvider,
  type HostProject,
  type RemoteMachine,
} from "../../connections/model/protocol";
import { parseRemotePath } from "../../connections/model/remoteProjects";
import {
  backgroundMachineFor,
  backgroundMachines,
  hostProjectCwd,
  hostProjectFor,
} from "../../automations/model/hostAutomationClient";
import {
  collectMachineResults,
  type LastGoodLists,
  type MachineResult,
} from "../../automations/model/machineResults";
import { machineProjects } from "../../automations/model/machineSnapshot";
import type { HarnessId, RuntimeMode } from "../../sessions/model/session";
import { projectName } from "../../../shared/lib/paths";
import {
  HOST_GOALS,
  MAX_GOAL_PROJECTS,
  type HostGoal,
  type HostGoalInput,
} from "./hostGoals";
import { TASK_AGENT_ERROR, TASK_MACHINE_ERROR } from "./taskClient";

export const GOAL_MACHINE_ERROR =
  "A goal’s projects must all be on one machine.";

/** A goal's project as this desktop addresses it. */
export type BoardGoalProject = { id: string; cwd: string; name: string };

/** A host goal as this desktop shows it: on its machine, with its projects. */
export type BoardGoal = HostGoal & {
  machineId: string;
  machineName: string;
  /** The goal's projects the host still has, in the goal's order. */
  projects: BoardGoalProject[];
  /** The machine did not answer; this is what it last reported. */
  stale?: boolean;
};

/** What the goal form edits. */
export type GoalDraft = {
  title: string;
  prompt: string;
  /** The projects, all on one machine; the first is the lead unless
   * `leadCwd` says otherwise. */
  cwds: string[];
  leadCwd: string;
  harness: HarnessId;
  model: string;
  modelSettings: Record<string, string>;
  runtimeMode: RuntimeMode;
  maxRunMinutes: number;
  approvePlan: boolean;
  review: boolean;
  /** Merge every task once its checks pass, without waiting for approval. */
  autoMerge: boolean;
};

/** Machines whose host carries out goals, this computer's included. */
export function goalMachines(): Promise<RemoteMachine[]> {
  return backgroundMachines(HOST_GOALS);
}

export function newGoalDraft(
  cwd: string,
  harness: HarnessId,
  model: string,
): GoalDraft {
  return {
    title: "",
    prompt: "",
    cwds: [cwd],
    leadCwd: cwd,
    harness,
    model,
    modelSettings: {},
    runtimeMode: "auto",
    maxRunMinutes: 0,
    approvePlan: false,
    review: true,
    autoMerge: false,
  };
}

/** Whether two projects are on the same machine: both on this computer, or
 * both on the same remote environment. */
export function sameGoalMachine(a: string, b: string): boolean {
  return (
    parseRemotePath(a)?.environmentId === parseRemotePath(b)?.environmentId
  );
}

/** Adds a project to the draft, or removes it. A project on another machine
 * than the ones already chosen is not added; the lead moves to the first
 * project left when its own is removed. */
export function toggleGoalProject(draft: GoalDraft, cwd: string): GoalDraft {
  if (draft.cwds.includes(cwd)) {
    const cwds = draft.cwds.filter((entry) => entry !== cwd);
    return {
      ...draft,
      cwds,
      leadCwd: draft.leadCwd === cwd ? (cwds[0] ?? "") : draft.leadCwd,
    };
  }
  if (draft.cwds.length >= MAX_GOAL_PROJECTS) return draft;
  if (draft.cwds.length && !sameGoalMachine(draft.cwds[0], cwd)) return draft;
  return {
    ...draft,
    cwds: [...draft.cwds, cwd],
    leadCwd: draft.leadCwd || cwd,
  };
}

/** What the host stores for a draft. Throws when the draft's agent cannot run
 * on a host. */
export function hostGoalFromDraft(
  draft: GoalDraft,
  id: string,
  projectIds: string[],
  leadProjectId: string,
): HostGoalInput {
  if (!isRemoteProvider(draft.harness)) throw new Error(TASK_AGENT_ERROR);
  return {
    id,
    title: draft.title,
    prompt: draft.prompt,
    projectIds,
    leadProjectId,
    harness: draft.harness,
    model: draft.model,
    modelSettings: draft.modelSettings,
    runtimeMode: draft.runtimeMode,
    maxRunMinutes: draft.maxRunMinutes,
    verifyDefaults: { review: draft.review },
    approvePlan: draft.approvePlan,
    ...(draft.autoMerge ? { autoMerge: true } : {}),
  };
}

export function boardGoalsFromHost(
  machine: RemoteMachine,
  projects: readonly HostProject[],
  goals: readonly HostGoal[],
): BoardGoal[] {
  return goals.map((goal) => ({
    ...goal,
    machineId: machine.id,
    machineName: isLocalSyncMachine(machine) ? "this computer" : machine.name,
    projects: goal.projectIds.flatMap((id) => {
      const project = projects.find((entry) => entry.id === id);
      return project
        ? [
            {
              id,
              cwd: hostProjectCwd(machine, project),
              name: project.name || projectName(project.cwd),
            },
          ]
        : [];
    }),
  }));
}

const lastBoardGoals: LastGoodLists<BoardGoal> = new Map();

/** Each machine's goals. A machine that does not answer keeps its last
 * successful list, flagged stale; `down` machines are not asked. */
export function listBoardGoalResults(
  machines: readonly RemoteMachine[],
  down: readonly RemoteMachine[] = [],
): Promise<MachineResult<BoardGoal>[]> {
  return collectMachineResults(
    lastBoardGoals,
    machines,
    async (machine) => {
      const [goals, projects] = await Promise.all([
        remoteRequest<HostGoal[]>(machine.id, "goals.list"),
        machineProjects(machine),
      ]);
      return boardGoalsFromHost(machine, projects, goals);
    },
    (goal) => ({ ...goal, stale: true }),
    down,
  );
}

/** Every machine's goals, last-known ones included. */
export async function listBoardGoals(
  machines: readonly RemoteMachine[],
): Promise<BoardGoal[]> {
  return (await listBoardGoalResults(machines)).flatMap((result) => result.data);
}

/** Creates the goal on the machine that has its projects; its planner starts
 * right away. */
export async function createGoal(
  machines: readonly RemoteMachine[],
  draft: GoalDraft,
): Promise<void> {
  if (!draft.cwds.length) throw new Error("Choose at least one project.");
  if (draft.cwds.some((cwd) => !sameGoalMachine(draft.cwds[0], cwd)))
    throw new Error(GOAL_MACHINE_ERROR);
  const machine = backgroundMachineFor(machines, draft.cwds[0]);
  if (!machine) throw new Error(TASK_MACHINE_ERROR);
  const projects = [];
  for (const cwd of draft.cwds)
    projects.push(await hostProjectFor(machine, cwd));
  const lead = projects[draft.cwds.indexOf(draft.leadCwd)] ?? projects[0];
  await remoteRequest<HostGoal>(
    machine.id,
    "goals.create",
    {
      goal: hostGoalFromDraft(
        draft,
        crypto.randomUUID(),
        projects.map((project) => project.id),
        lead.id,
      ),
    },
    false,
    true,
  );
}

function goalRequest(
  goal: BoardGoal,
  method: string,
  params: Record<string, unknown> = {},
): Promise<unknown> {
  return remoteRequest(
    goal.machineId,
    method,
    { goalId: goal.id, ...params },
    false,
    true,
  );
}

export function approveGoal(goal: BoardGoal): Promise<unknown> {
  return goalRequest(goal, "goals.approve");
}

export function replanGoal(
  goal: BoardGoal,
  feedback: string,
): Promise<unknown> {
  return goalRequest(
    goal,
    "goals.replan",
    feedback.trim() ? { feedback: feedback.trim() } : {},
  );
}

export function cancelGoal(goal: BoardGoal): Promise<unknown> {
  return goalRequest(goal, "goals.cancel");
}

/** `withTasks` also deletes the goal's tasks, discarding unmerged branches. */
export function deleteGoal(
  goal: BoardGoal,
  withTasks = false,
): Promise<unknown> {
  return goalRequest(
    goal,
    "goals.delete",
    withTasks ? { withTasks: true } : {},
  );
}

/** The key a goal and its tasks share on the board. */
export function goalKey(machineId: string, goalId: string): string {
  return `${machineId}:${goalId}`;
}
