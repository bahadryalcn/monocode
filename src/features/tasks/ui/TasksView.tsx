import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { AccessPicker } from "../../sessions/ui/AccessPicker";
import { HarnessIcon } from "../../sessions/ui/HarnessIcon";
import {
  AlertCircle,
  Check,
  DashboardSquare,
  GitBranch,
  GitMerge,
  LoaderCircle,
  MessageSquare,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Sparkles,
  Square,
  Trash2,
  X,
} from "../../../shared/ui/icons";
import { ModelPicker } from "../../sessions/ui/ModelPicker";
import { SearchableProjectPicker } from "../../projects/ui/SearchableProjectPicker";
import { SearchableSelect } from "../../../shared/ui/SearchableSelect";
import { SkillPromptField } from "../../skills/ui/SkillPromptField";
import { OverlayNav } from "../../../app/shell/TitleBar";
import { WindowControls } from "../../../app/shell/WindowControls";
import { useLockOverscroll } from "../../../shared/hooks/useLockOverscroll";
import { backgroundMachineFor } from "../../automations/model/hostAutomationClient";
import type { RemoteMachine } from "../../connections/model/protocol";
import { parseRemotePath } from "../../connections/model/remoteProjects";
import { useLockSnapshot } from "../../group-lock/hooks/useGroupLock";
import { isProjectLockedIn } from "../../group-lock/model/lockState";
import { IS_MAC } from "../../../platform/tauri/platform";
import {
  looksLikeProject,
  type RecentProject,
} from "../../projects/model/recents";
import {
  defaultSessionChoice,
  firstEnabledHarness,
  modelsFor,
  preferredModelId,
  resolveModel,
} from "../../sessions/model/models";
import { projectKey, projectName } from "../../../shared/lib/paths";
import {
  loadTabGroupLabels,
  resolveTabGroupLabel,
} from "../../workspace/model/tabGroups";
import {
  TASK_COLUMNS,
  canEditTask,
  canMoveTask,
  hasUnmergedBranch,
  unfinishedDependencies,
  type TaskColumn,
  type TaskStatus,
  type TaskVerification,
} from "../model/hostTasks";
import {
  MAX_GOAL_PROJECTS,
  goalProgress,
  type GoalStatus,
} from "../model/hostGoals";
import {
  approveGoal,
  cancelGoal,
  createGoal,
  deleteGoal,
  goalKey,
  goalMachines,
  listBoardGoals,
  newGoalDraft,
  replanGoal,
  sameGoalMachine,
  toggleGoalProject,
  type BoardGoal,
  type GoalDraft,
} from "../model/goalClient";
import {
  TASK_MACHINE_ERROR,
  deleteTask,
  draftFromTask,
  listBoardTasks,
  moveTask,
  newTaskDraft,
  saveTask,
  taskMachines,
  taskTimeLabel,
  tasksInColumn,
  type BoardTask,
  type TaskDraft,
} from "../model/taskClient";
import type { BackgroundSessionTarget } from "../model/backgroundSession";

type Props = {
  besideRail?: boolean;
  compactRail?: boolean;
  cwd?: string;
  recents: RecentProject[];
  onClose: () => void;
  onToggleSidebar?: () => void;
  /** Opens the session a task ran in, on whichever machine ran it. */
  onOpenBackgroundSession: (
    target: BackgroundSessionTarget,
  ) => void | Promise<void>;
};

const ACTION =
  "inline-flex items-center gap-1.5 rounded-md px-3 text-[12px] disabled:cursor-default disabled:opacity-40";
const ACTION_FILLED = `${ACTION} h-6.5 bg-content font-medium text-background-base hover:bg-content/80`;
const ACTION_OUTLINE = `${ACTION} h-7 border border-content/15 text-content/80 hover:border-content/30 hover:bg-content/10 hover:text-content`;
const CARD_ACTION =
  "inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] text-content/60 hover:bg-content/10 hover:text-content disabled:cursor-default disabled:opacity-40";

const CHECKBOX =
  "size-3.5 cursor-pointer rounded border border-content/20 accent-accent";

const COLUMN_LABELS: Record<TaskColumn, string> = {
  queued: "Queued",
  running: "Running",
  review: "Review",
  done: "Done",
  blocked: "Blocked",
};

const COLUMN_EMPTY: Record<TaskColumn, string> = {
  queued: "Nothing waiting",
  running: "Nothing running",
  review: "Nothing to review",
  done: "Nothing done yet",
  blocked: "Nothing blocked",
};

// The same choices as an automation's run time limit.
const RUN_TIME_LIMIT_OPTIONS = [
  { value: "0", label: "No limit" },
  { value: "15", label: "15 minutes" },
  { value: "30", label: "30 minutes" },
  { value: "60", label: "1 hour" },
  { value: "120", label: "2 hours" },
  { value: "240", label: "4 hours" },
  { value: "480", label: "8 hours" },
] as const;

const GOAL_STATUS_LABELS: Record<GoalStatus, string> = {
  planning: "Planning",
  "awaiting-approval": "Plan ready",
  running: "Running",
  done: "Done",
  blocked: "Blocked",
  cancelled: "Cancelled",
};

const GOAL_STATUS_STYLES: Record<GoalStatus, string> = {
  planning: "bg-sky-500/12 text-sky-400",
  "awaiting-approval": "bg-amber-500/12 text-amber-400",
  running: "bg-sky-500/12 text-sky-400",
  done: "bg-emerald-500/12 text-emerald-400",
  blocked: "bg-rose-500/12 text-rose-400",
  cancelled: "bg-content/8 text-content/50",
};

const ALL_GOALS = "all";

export function TasksView({
  besideRail = false,
  compactRail = false,
  cwd,
  recents,
  onClose,
  onToggleSidebar,
  onOpenBackgroundSession,
}: Props) {
  return (
    <div
      role="region"
      aria-label="Tasks"
      data-app-tasks
      className="flex min-h-0 min-w-0 flex-1 flex-col text-content"
    >
      <div
        className="flex h-10 shrink-0 select-none items-center border-b border-stroke"
        data-tauri-drag-region="deep"
      >
        {IS_MAC && compactRail ? <div className="w-4 shrink-0" /> : null}
        {IS_MAC && !besideRail ? <div className="w-[78px] shrink-0" /> : null}
        {besideRail ? null : (
          <OverlayNav onBack={onClose} onToggleSidebar={onToggleSidebar} />
        )}
        <div className="flex min-w-0 flex-1 items-center gap-2 px-3 text-[13px]">
          <DashboardSquare
            className="size-3.5 shrink-0 text-content/45"
            strokeWidth={1.75}
          />
          <span className="min-w-0 truncate text-content">Tasks</span>
        </div>
        {IS_MAC ? null : <WindowControls />}
      </div>
      <TasksContent
        cwd={cwd}
        recents={recents}
        onOpenBackgroundSession={onOpenBackgroundSession}
      />
    </div>
  );
}

function TasksContent({
  cwd,
  recents,
  onOpenBackgroundSession,
}: Pick<Props, "cwd" | "recents" | "onOpenBackgroundSession">) {
  // Tasks for a project in a locked group are not shown.
  const lock = useLockSnapshot();
  // Machines whose host keeps a task board, this computer's included.
  const [machines, setMachines] = useState<RemoteMachine[]>([]);
  const [storedTasks, setTasks] = useState<BoardTask[]>([]);
  const [now, setNow] = useState(Date.now);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<TaskDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [groupLabels] = useState(loadTabGroupLabels);
  const boardLock = useLockOverscroll<HTMLDivElement>();
  // Machines whose host carries out goals, and their goals.
  const [goalCapable, setGoalCapable] = useState<RemoteMachine[]>([]);
  const [storedGoals, setGoals] = useState<BoardGoal[]>([]);
  const [goalDraft, setGoalDraft] = useState<GoalDraft | null>(null);
  const [goalFilter, setGoalFilter] = useState(ALL_GOALS);

  const visibleTasks = useMemo(
    () => storedTasks.filter((task) => !isProjectLockedIn(lock, task.cwd)),
    [lock, storedTasks],
  );
  const goals = useMemo(
    () =>
      storedGoals.filter(
        (goal) =>
          !goal.projects.some((project) => isProjectLockedIn(lock, project.cwd)),
      ),
    [lock, storedGoals],
  );
  const goalTitles = useMemo(
    () =>
      new Map(goals.map((goal) => [goalKey(goal.machineId, goal.id), goal.title])),
    [goals],
  );
  const tasks = useMemo(
    () =>
      goalFilter === ALL_GOALS
        ? visibleTasks
        : visibleTasks.filter(
            (task) =>
              task.goalId && goalKey(task.machineId, task.goalId) === goalFilter,
          ),
    [goalFilter, visibleTasks],
  );

  const refresh = useCallback(async () => {
    try {
      const [capable, goalHosts] = await Promise.all([
        taskMachines(),
        goalMachines(),
      ]);
      setMachines(capable);
      setGoalCapable(goalHosts);
      const [nextTasks, nextGoals] = await Promise.all([
        listBoardTasks(capable),
        listBoardGoals(goalHosts),
      ]);
      setTasks(nextTasks);
      setGoals(nextGoals);
      setNow(Date.now());
    } catch {
      // A machine that does not answer keeps its last known tasks.
    } finally {
      setLoading(false);
    }
  }, []);

  // The host reports no changes, so the board is polled while this view is open.
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const beginCreate = () => {
    const project =
      cwd && looksLikeProject(cwd) ? cwd : (recents[0]?.path ?? "~");
    const preferred = defaultSessionChoice(project);
    const harness = firstEnabledHarness(project, preferred.harness);
    const model =
      (preferred.harness === harness ? preferred.model : undefined) ??
      modelsFor(harness)[0]?.id ??
      preferredModelId(harness);
    setError(null);
    setDraft(newTaskDraft(project, harness, model));
  };

  const beginGoal = () => {
    const project =
      cwd && looksLikeProject(cwd) ? cwd : (recents[0]?.path ?? "");
    const preferred = defaultSessionChoice(project || "~");
    const harness = firstEnabledHarness(project || "~", preferred.harness);
    const model =
      (preferred.harness === harness ? preferred.model : undefined) ??
      modelsFor(harness)[0]?.id ??
      preferredModelId(harness);
    setError(null);
    const draft = newGoalDraft(project, harness, model);
    setGoalDraft(
      looksLikeProject(project) ? draft : { ...draft, cwds: [], leadCwd: "" },
    );
  };

  const onCreateGoal = async (event: FormEvent) => {
    event.preventDefault();
    if (saving || !goalDraft) return;
    setSaving(true);
    try {
      await createGoal(goalCapable, goalDraft);
      setGoalDraft(null);
      setError(null);
      await refresh();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSaving(false);
    }
  };

  const actOnGoal = (goal: BoardGoal, action: () => Promise<unknown>) =>
    act({ id: `goal:${goalKey(goal.machineId, goal.id)}` }, action);

  const onDeleteGoal = (goal: BoardGoal) => {
    if (!window.confirm(`Delete the goal “${goal.title}”? Its tasks stay on the board.`))
      return;
    if (goalFilter === goalKey(goal.machineId, goal.id)) setGoalFilter(ALL_GOALS);
    void actOnGoal(goal, () => deleteGoal(goal));
  };

  const onOpenPlanner = async (goal: BoardGoal) => {
    const lead = goal.projects.find(
      (project) => project.id === goal.leadProjectId,
    );
    if (!goal.plannerSessionId || !lead) return;
    try {
      await onOpenBackgroundSession({
        machineId: goal.machineId,
        cwd: lead.cwd,
        projectId: lead.id,
        sessionId: goal.plannerSessionId,
      });
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const act = async (
    task: Pick<BoardTask, "id">,
    action: () => Promise<unknown>,
  ) => {
    if (acting) return;
    setActing(task.id);
    try {
      await action();
      setError(null);
      await refresh();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
      // A merge that failed is recorded on its task, which stays in review.
      await refresh();
    } finally {
      setActing(null);
    }
  };

  const onOpenSession = async (task: BoardTask) => {
    if (!task.sessionId) return;
    try {
      await onOpenBackgroundSession({
        machineId: task.machineId,
        cwd: task.cwd,
        projectId: task.projectId,
        sessionId: task.sessionId,
      });
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const onSave = async (event: FormEvent) => {
    event.preventDefault();
    if (saving || !draft) return;
    setSaving(true);
    try {
      await saveTask(machines, draft);
      setDraft(null);
      setError(null);
      await refresh();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = (task: BoardTask) => {
    const discard = hasUnmergedBranch(task);
    if (
      !window.confirm(
        discard
          ? `Delete “${task.title}”? Its work on ${task.branch} was never merged, and the branch will be discarded.`
          : `Delete “${task.title}”?`,
      )
    )
      return;
    void act(task, () => deleteTask(task, discard));
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col text-content">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-stroke px-3">
        <span className="min-w-0 flex-1 truncate text-[12px] text-content/45">
          {machines.length > 0
            ? "Each task runs on its project’s machine, with this app open or closed."
            : loading
              ? "Looking for machines…"
              : "No connected machine has a task board. Connect one, or update its MonoCode Host."}
        </span>
        {goals.length > 0 ? (
          <SearchableSelect
            variant="pill"
            searchable={goals.length > 8}
            align="end"
            label="Show goal"
            value={goalFilter}
            options={[
              { value: ALL_GOALS, label: "All tasks" },
              ...goals.map((goal) => ({
                value: goalKey(goal.machineId, goal.id),
                label: goal.title,
              })),
            ]}
            onChange={setGoalFilter}
          />
        ) : null}
        <button
          type="button"
          onClick={beginGoal}
          disabled={goalDraft != null || draft != null}
          className={ACTION_OUTLINE}
        >
          <Sparkles className="size-3.5" strokeWidth={1.75} />
          New goal
        </button>
        <button
          type="button"
          onClick={beginCreate}
          disabled={draft != null || goalDraft != null}
          className={ACTION_OUTLINE}
        >
          <Plus className="size-3.5" strokeWidth={1.75} />
          New task
        </button>
      </div>
      {error ? (
        <div className="mx-4 mt-4 flex shrink-0 items-start gap-2 rounded-lg border border-red-400/20 bg-red-400/8 px-3 py-2 text-[12px] text-red-300">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}
      {draft ? (
        <TaskForm
          key={draft.id ?? "new"}
          draft={draft}
          recents={recents}
          machine={machineName(machines, draft.cwd)}
          saving={saving}
          onChange={setDraft}
          onCancel={() => setDraft(null)}
          onSubmit={onSave}
        />
      ) : null}
      {goalDraft ? (
        <GoalForm
          draft={goalDraft}
          recents={recents}
          machine={
            goalDraft.cwds[0]
              ? machineName(goalCapable, goalDraft.cwds[0])
              : undefined
          }
          saving={saving}
          onChange={setGoalDraft}
          onCancel={() => setGoalDraft(null)}
          onSubmit={onCreateGoal}
        />
      ) : null}
      {goals.length > 0 ? (
        <ul
          aria-label="Goals"
          className="flex max-h-[45%] shrink-0 flex-col gap-1.5 overflow-y-auto border-b border-stroke p-3"
        >
          {goals
            .filter(
              (goal) =>
                goalFilter === ALL_GOALS ||
                goalKey(goal.machineId, goal.id) === goalFilter,
            )
            .map((goal) => {
              const key = goalKey(goal.machineId, goal.id);
              return (
                <li key={key}>
                  <GoalCard
                    goal={goal}
                    tasks={storedTasks.filter(
                      (task) => task.machineId === goal.machineId,
                    )}
                    busy={acting === `goal:${key}`}
                    onApprove={() => void actOnGoal(goal, () => approveGoal(goal))}
                    onReplan={(feedback) =>
                      actOnGoal(goal, () => replanGoal(goal, feedback))
                    }
                    onCancel={() => {
                      if (
                        window.confirm(
                          `Cancel the goal “${goal.title}”? Its running tasks are stopped; their branches stay.`,
                        )
                      )
                        void actOnGoal(goal, () => cancelGoal(goal));
                    }}
                    onDelete={() => onDeleteGoal(goal)}
                    onOpenPlanner={
                      goal.plannerSessionId
                        ? () => void onOpenPlanner(goal)
                        : undefined
                    }
                  />
                </li>
              );
            })}
        </ul>
      ) : null}
      <div
        ref={boardLock}
        className="min-h-0 min-w-0 flex-1 overflow-auto overscroll-none p-3"
      >
        {loading ? (
          <div className="grid h-full place-items-center text-content/35">
            <LoaderCircle className="size-4 animate-spin" />
          </div>
        ) : (
          <div className="grid h-full min-w-[1000px] grid-cols-5 gap-3">
            {TASK_COLUMNS.map((status) => {
              const column = tasksInColumn(tasks, status);
              return (
                <section
                  key={status}
                  aria-label={COLUMN_LABELS[status]}
                  data-task-column={status}
                  className="flex min-h-0 min-w-0 flex-col rounded-md border border-content/10 bg-content/3"
                >
                  <h2 className="flex h-9 shrink-0 items-center gap-2 px-3 text-[12px] font-medium text-content/60">
                    {COLUMN_LABELS[status]}
                    <span className="tabular-nums text-content/35">
                      {column.length}
                    </span>
                  </h2>
                  <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-1.5 pb-1.5">
                    {column.map((task) => (
                      <li key={`${task.machineId}:${task.id}`}>
                        <TaskCard
                          task={task}
                          now={now}
                          project={resolveTabGroupLabel(
                            projectKey(task.cwd),
                            groupLabels,
                            projectName(task.cwd),
                          )}
                          busy={acting === task.id}
                          goal={
                            task.goalId
                              ? goalTitles.get(goalKey(task.machineId, task.goalId))
                              : undefined
                          }
                          waitingFor={
                            task.status === "queued"
                              ? unfinishedDependencies(
                                  task,
                                  storedTasks.filter(
                                    (other) => other.machineId === task.machineId,
                                  ),
                                ).map((other) => other.title)
                              : []
                          }
                          onMove={(to) => void act(task, () => moveTask(task, to))}
                          onEdit={() => {
                            setError(null);
                            setDraft(draftFromTask(task));
                          }}
                          onDelete={() => onDelete(task)}
                          onOpenSession={
                            task.sessionId
                              ? () => void onOpenSession(task)
                              : undefined
                          }
                        />
                      </li>
                    ))}
                    {column.length === 0 ? (
                      <li className="px-2 py-6 text-center text-[11px] text-content/35">
                        {COLUMN_EMPTY[status]}
                      </li>
                    ) : null}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/** The machine that would run a task for the project at `cwd`, if connected. */
function machineName(
  machines: readonly RemoteMachine[],
  cwd: string,
): string | undefined {
  const machine = backgroundMachineFor(machines, cwd);
  if (!machine) return undefined;
  return parseRemotePath(cwd) ? machine.name : "this computer";
}

function TaskCard({
  task,
  now,
  project,
  busy,
  goal,
  waitingFor,
  onMove,
  onEdit,
  onDelete,
  onOpenSession,
}: {
  task: BoardTask;
  now: number;
  project: string;
  busy: boolean;
  /** The title of the goal the task was planned for. */
  goal?: string;
  /** Titles of the tasks it waits for. */
  waitingFor: readonly string[];
  onMove: (to: TaskStatus) => void;
  onEdit: () => void;
  onDelete: () => void;
  /** Missing while the task has no session yet. */
  onOpenSession?: () => void;
}) {
  const model = resolveModel(task.harness, task.model);
  const can = (to: TaskStatus) => canMoveTask(task.status, to);
  return (
    <article
      aria-label={task.title}
      className="rounded-md border border-content/10 bg-background-base px-2.5 py-2"
    >
      {goal ? (
        <p
          data-task-goal
          title={`Part of the goal “${goal}”`}
          className="mb-1 flex min-w-0 items-center gap-1 text-[10px] text-content/45"
        >
          <Sparkles className="size-2.5 shrink-0" />
          <span className="min-w-0 truncate">{goal}</span>
        </p>
      ) : null}
      <h3
        title={task.prompt}
        className="line-clamp-2 text-[13px] font-semibold leading-snug text-content"
      >
        {task.title}
      </h3>
      <p className="mt-1 truncate text-[11px] text-content/45">
        {project} · on {task.machineName}
      </p>
      <p className="mt-1 flex min-w-0 items-center gap-1 text-[11px] text-content/50">
        <HarnessIcon harness={task.harness} className="size-3.5 shrink-0" />
        <span title={model.name} className="min-w-0 truncate">
          {model.name}
        </span>
        <span className="ml-auto shrink-0 tabular-nums text-content/40">
          {taskTimeLabel(task, now)}
        </span>
      </p>
      {task.branch ? (
        <p
          title={task.merged ? `Merged into ${task.baseBranch}` : task.branch}
          className="mt-1 flex min-w-0 items-center gap-1 text-[11px] text-content/45"
        >
          <GitBranch className="size-3 shrink-0" />
          <span className="min-w-0 truncate">
            {task.merged
              ? `${task.branch} merged into ${task.baseBranch}`
              : task.branch}
          </span>
        </p>
      ) : null}
      {waitingFor.length > 0 ? (
        <p className="mt-1 break-words text-[11px] leading-snug text-content/50">
          Waiting for: {waitingFor.join(", ")}
        </p>
      ) : null}
      {task.status === "verifying" ? (
        <p className="mt-1.5 mr-1 inline-flex h-5 items-center rounded-full bg-sky-500/12 px-2 text-[11px] font-medium text-sky-400">
          Verifying
        </p>
      ) : null}
      {task.needsInput ? (
        <p className="mt-1.5 inline-flex h-5 items-center rounded-full bg-amber-500/12 px-2 text-[11px] font-medium text-amber-400">
          Needs input
        </p>
      ) : null}
      {task.status === "blocked" && task.error ? (
        <p className="mt-1.5 line-clamp-4 break-words text-[11px] leading-snug text-rose-400">
          {task.error}
        </p>
      ) : null}
      {task.verification &&
      (task.status === "review" || task.status === "blocked") ? (
        <VerificationSummary verification={task.verification} />
      ) : null}
      {task.status === "review" && task.diffStat ? (
        <pre
          aria-label="Changes"
          className="mt-1.5 max-h-32 overflow-auto rounded bg-content/5 px-1.5 py-1 font-mono text-[10px] leading-snug text-content/60"
        >
          {task.diffStat}
        </pre>
      ) : null}
      {task.status === "review" && task.mergeError ? (
        <p
          role="alert"
          className="mt-1.5 break-words text-[11px] leading-snug text-rose-400"
        >
          {task.mergeError}
        </p>
      ) : null}
      <div className="mt-1.5 flex flex-wrap items-center gap-0.5">
        {busy ? (
          <LoaderCircle className="mx-1.5 size-3 animate-spin text-content/40" />
        ) : null}
        {can("done") ? (
          hasUnmergedBranch(task) ? (
            <CardAction
              label={`Merge into ${task.baseBranch}`}
              disabled={busy}
              onClick={() => onMove("done")}
            >
              <GitMerge className="size-3" />
            </CardAction>
          ) : (
            <CardAction
              label="Approve"
              disabled={busy}
              onClick={() => onMove("done")}
            >
              <Check className="size-3" />
            </CardAction>
          )
        ) : null}
        {can("queued") ? (
          <CardAction
            label={task.status === "blocked" ? "Retry" : "Run again"}
            disabled={busy}
            onClick={() => onMove("queued")}
          >
            {task.status === "blocked" ? (
              <RotateCcw className="size-3" />
            ) : (
              <Play className="size-3" />
            )}
          </CardAction>
        ) : null}
        {can("blocked") ? (
          <CardAction label="Stop" disabled={busy} onClick={() => onMove("blocked")}>
            <Square className="size-3" />
          </CardAction>
        ) : null}
        {onOpenSession ? (
          <CardAction label="Open session" disabled={false} onClick={onOpenSession}>
            <MessageSquare className="size-3" />
          </CardAction>
        ) : null}
        {canEditTask(task.status) ? (
          <CardAction label="Edit" disabled={busy} onClick={onEdit}>
            <Pencil className="size-3" />
          </CardAction>
        ) : null}
        {task.status === "running" || task.status === "verifying" ? null : (
          <CardAction label="Delete" disabled={busy} onClick={onDelete}>
            <Trash2 className="size-3" />
          </CardAction>
        )}
      </div>
    </article>
  );
}

/** What the host checked before review: the check command's result, with its
 * output on demand, and the reviewer's verdict. */
function VerificationSummary({
  verification,
}: {
  verification: TaskVerification;
}) {
  const { command, review } = verification;
  if (!command && !review) return null;
  const passed = command && !command.timedOut && command.exitCode === 0;
  return (
    <div className="mt-1.5 space-y-1 text-[11px] leading-snug text-content/60">
      {command ? (
        <details>
          <summary className="cursor-pointer select-none">
            Check command{" "}
            <span className={passed ? "text-emerald-400" : "text-rose-400"}>
              {passed
                ? "passed"
                : command.timedOut
                  ? "timed out"
                  : command.exitCode === null
                    ? "could not run"
                    : `failed (exit code ${command.exitCode})`}
            </span>
          </summary>
          <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-content/5 px-1.5 py-1 font-mono text-[10px] text-content/60">
            {command.output.trim() || "No output."}
          </pre>
        </details>
      ) : null}
      {review ? (
        <p className="break-words">
          Reviewer{" "}
          <span
            className={
              review.verdict === "pass" ? "text-emerald-400" : "text-rose-400"
            }
          >
            {review.verdict === "pass" ? "passed" : "failed"}
          </span>
          {review.note ? ` · ${review.note}` : null}
        </p>
      ) : null}
    </div>
  );
}

function CardAction({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={CARD_ACTION}
    >
      {children}
      {label}
    </button>
  );
}

function TaskForm({
  draft,
  recents,
  machine,
  saving,
  onChange,
  onCancel,
  onSubmit,
}: {
  draft: TaskDraft;
  recents: RecentProject[];
  /** The machine whose host would run this draft, when it is connected. */
  machine?: string;
  saving: boolean;
  onChange: (draft: TaskDraft) => void;
  onCancel: () => void;
  onSubmit: (event: FormEvent) => void;
}) {
  const update = <K extends keyof TaskDraft>(key: K, value: TaskDraft[K]) =>
    onChange({ ...draft, [key]: value });
  const valid =
    draft.title.trim().length > 0 &&
    draft.prompt.trim().length > 0 &&
    looksLikeProject(draft.cwd) &&
    draft.model.length > 0 &&
    machine != null;
  return (
    <form
      aria-label={draft.id ? "Edit task" : "New task"}
      onSubmit={onSubmit}
      className="shrink-0 border-b border-stroke px-4 py-3"
    >
      <div className="flex items-start gap-4">
        <input
          autoFocus
          aria-label="Task title"
          value={draft.title}
          onChange={(event) => update("title", event.target.value)}
          placeholder="What should get done?"
          className="min-w-0 flex-1 bg-transparent text-[16px] font-semibold leading-tight text-content outline-none placeholder:text-content/35"
        />
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={onCancel} className={ACTION_OUTLINE}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={!valid || saving}
            className={ACTION_FILLED}
          >
            {saving ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
            {draft.id ? "Save" : "Add to queue"}
          </button>
        </div>
      </div>
      <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2 text-[12px] text-content/50">
        {draft.id ? (
          // A task stays in the project it was created for.
          <span className="truncate">{projectName(draft.cwd)}</span>
        ) : (
          <SearchableProjectPicker
            cwd={draft.cwd}
            recents={recents}
            onSelectProject={(cwd) => update("cwd", cwd)}
          />
        )}
        <span aria-hidden className="h-3 w-px shrink-0 bg-content/15" />
        {machine ? (
          <span className="truncate">Runs on {machine}</span>
        ) : (
          <span role="alert" className="text-amber-400">
            {TASK_MACHINE_ERROR}
          </span>
        )}
      </div>
      <div className="relative mt-2 rounded-md border border-content/10 bg-content/3 has-focus:border-content/20">
        <SkillPromptField
          value={draft.prompt}
          harness={draft.harness}
          cwd={draft.cwd}
          onChange={(prompt) => update("prompt", prompt)}
        />
        <div className="flex flex-wrap items-center gap-1 px-2 pb-2">
          <ModelPicker
            harness={draft.harness}
            model={draft.model}
            values={draft.modelSettings}
            project={draft.cwd}
            onChange={(harness, model) => onChange({ ...draft, harness, model })}
            onSettingsChange={(modelSettings) =>
              update("modelSettings", modelSettings)
            }
          />
          {draft.harness !== "fx" ? (
            <AccessPicker
              value={draft.runtimeMode}
              onChange={(runtimeMode) => update("runtimeMode", runtimeMode)}
            />
          ) : null}
          <span className="ml-auto flex items-center gap-2 text-[11px] text-content/45">
            Time limit
            <SearchableSelect
              variant="pill"
              searchable={false}
              align="end"
              label="Time limit"
              value={String(draft.maxRunMinutes)}
              options={RUN_TIME_LIMIT_OPTIONS}
              onChange={(value) => update("maxRunMinutes", Number(value))}
            />
          </span>
        </div>
      </div>
      <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-content/60">
        <label
          title="In a git project the task works on a new branch in its own worktree, and nothing reaches the project until you merge it."
          className="flex cursor-pointer items-center gap-1.5"
        >
          <input
            type="checkbox"
            checked={draft.isolate}
            onChange={(event) => update("isolate", event.target.checked)}
            className={CHECKBOX}
          />
          Run on its own branch
        </label>
        <label className="flex cursor-pointer items-center gap-1.5">
          <input
            type="checkbox"
            checked={draft.review}
            onChange={(event) => update("review", event.target.checked)}
            className={CHECKBOX}
          />
          Review with a second agent
        </label>
        <label className="flex min-w-[220px] flex-1 items-center gap-2">
          <span className="shrink-0">Check command</span>
          <input
            aria-label="Check command"
            value={draft.verifyCommand}
            onChange={(event) => update("verifyCommand", event.target.value)}
            placeholder="npm test"
            spellCheck={false}
            className="h-7 min-w-0 flex-1 rounded-md border border-content/10 bg-content/3 px-2 font-mono text-[12px] text-content outline-none placeholder:text-content/30 focus:border-content/20"
          />
        </label>
      </div>
    </form>
  );
}

/** One goal above the board: where it stands, how many of its tasks are done,
 * and what the owner can do about it. A plan waiting for approval is shown in
 * full; a plan that failed shows why. */
function GoalCard({
  goal,
  tasks,
  busy,
  onApprove,
  onReplan,
  onCancel,
  onDelete,
  onOpenPlanner,
}: {
  goal: BoardGoal;
  /** The tasks on the goal's machine. */
  tasks: readonly BoardTask[];
  busy: boolean;
  onApprove: () => void;
  onReplan: (feedback: string) => Promise<unknown>;
  onCancel: () => void;
  onDelete: () => void;
  onOpenPlanner?: () => void;
}) {
  const [replanning, setReplanning] = useState(false);
  const [feedback, setFeedback] = useState("");
  const progress = goalProgress(goal, tasks);
  const failedPlanning = goal.status === "blocked" && goal.taskIds.length === 0;
  const canReplan = goal.status === "awaiting-approval" || failedPlanning;
  const projectOf = (id: string | undefined, path: string) =>
    goal.projects.find((project) => project.id === id)?.name ??
    projectName(path);
  const titleOf = (key: string) =>
    goal.plan?.tasks.find((task) => task.key === key)?.title ?? key;
  const reason = goal.planError ?? goal.error;
  return (
    <article
      aria-label={goal.title}
      data-goal-status={goal.status}
      className="rounded-md border border-content/10 bg-content/3 px-3 py-2"
    >
      <div className="flex min-w-0 items-center gap-2">
        <Sparkles className="size-3.5 shrink-0 text-content/45" />
        <h3
          title={goal.prompt}
          className="min-w-0 truncate text-[13px] font-semibold text-content"
        >
          {goal.title}
        </h3>
        <span
          className={`inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[11px] font-medium ${GOAL_STATUS_STYLES[goal.status]}`}
        >
          {goal.status === "planning" ? (
            <LoaderCircle className="mr-1 size-3 animate-spin" />
          ) : null}
          {GOAL_STATUS_LABELS[goal.status]}
        </span>
        {progress.total > 0 ? (
          <span className="shrink-0 tabular-nums text-[11px] text-content/50">
            {progress.done}/{progress.total} done
          </span>
        ) : null}
        <span className="min-w-0 truncate text-[11px] text-content/40">
          {goal.projects.map((project) => project.name).join(", ")} · on{" "}
          {goal.machineName}
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          {busy ? (
            <LoaderCircle className="mx-1.5 size-3 animate-spin text-content/40" />
          ) : null}
          {goal.status === "awaiting-approval" ? (
            <CardAction label="Approve" disabled={busy} onClick={onApprove}>
              <Check className="size-3" />
            </CardAction>
          ) : null}
          {canReplan ? (
            <CardAction
              label="Replan"
              disabled={busy}
              onClick={() => setReplanning((open) => !open)}
            >
              <RotateCcw className="size-3" />
            </CardAction>
          ) : null}
          {onOpenPlanner ? (
            <CardAction
              label="Open planner"
              disabled={false}
              onClick={onOpenPlanner}
            >
              <MessageSquare className="size-3" />
            </CardAction>
          ) : null}
          {goal.status === "done" || goal.status === "cancelled" ? null : (
            <CardAction label="Cancel" disabled={busy} onClick={onCancel}>
              <Square className="size-3" />
            </CardAction>
          )}
          {goal.status === "planning" || goal.status === "running" ? null : (
            <CardAction label="Delete" disabled={busy} onClick={onDelete}>
              <Trash2 className="size-3" />
            </CardAction>
          )}
        </div>
      </div>
      {goal.status === "blocked" && reason ? (
        <p className="mt-1 break-words text-[11px] leading-snug text-rose-400">
          {reason}
        </p>
      ) : null}
      {goal.status === "awaiting-approval" && goal.plan ? (
        <ol aria-label="Plan" className="mt-1.5 space-y-1">
          {goal.plan.tasks.map((task) => (
            <li
              key={task.key}
              title={task.prompt}
              className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-[12px] leading-snug"
            >
              <span className="text-content/80">{task.title}</span>
              <span className="text-[11px] text-content/45">
                in {projectOf(task.projectId, task.project)}
              </span>
              {task.dependsOn.length ? (
                <span className="text-[11px] text-content/45">
                  · after {task.dependsOn.map(titleOf).join(", ")}
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
      {replanning && canReplan ? (
        <form
          aria-label="Replan"
          className="mt-1.5 flex items-start gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void onReplan(feedback).then(() => {
              setReplanning(false);
              setFeedback("");
            });
          }}
        >
          <textarea
            autoFocus
            aria-label="Plan feedback"
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
            placeholder="What should the plan do differently? (optional)"
            rows={2}
            className="min-w-0 flex-1 resize-y rounded-md border border-content/10 bg-background-base px-2 py-1 text-[12px] text-content outline-none placeholder:text-content/30 focus:border-content/20"
          />
          <button type="submit" disabled={busy} className={ACTION_FILLED}>
            Plan again
          </button>
        </form>
      ) : null}
    </article>
  );
}

/** The new goal form: the job, the projects it may touch on one machine, the
 * lead project the planner reads from, and the agent every task runs with. */
function GoalForm({
  draft,
  recents,
  machine,
  saving,
  onChange,
  onCancel,
  onSubmit,
}: {
  draft: GoalDraft;
  recents: RecentProject[];
  /** The machine whose host would carry out this goal, when it is connected. */
  machine?: string;
  saving: boolean;
  onChange: (draft: GoalDraft) => void;
  onCancel: () => void;
  onSubmit: (event: FormEvent) => void;
}) {
  const update = <K extends keyof GoalDraft>(key: K, value: GoalDraft[K]) =>
    onChange({ ...draft, [key]: value });
  // After the first pick, only projects on the same machine can be added.
  const choices = recents.filter(
    (recent) =>
      looksLikeProject(recent.path) &&
      !draft.cwds.includes(recent.path) &&
      (draft.cwds.length === 0 || sameGoalMachine(draft.cwds[0], recent.path)),
  );
  const lead = draft.leadCwd || draft.cwds[0] || "";
  const valid =
    draft.title.trim().length > 0 &&
    draft.prompt.trim().length > 0 &&
    draft.cwds.length > 0 &&
    draft.model.length > 0 &&
    machine != null;
  return (
    <form
      aria-label="New goal"
      onSubmit={onSubmit}
      className="shrink-0 border-b border-stroke px-4 py-3"
    >
      <div className="flex items-start gap-4">
        <input
          autoFocus
          aria-label="Goal title"
          value={draft.title}
          onChange={(event) => update("title", event.target.value)}
          placeholder="Name the main job"
          className="min-w-0 flex-1 bg-transparent text-[16px] font-semibold leading-tight text-content outline-none placeholder:text-content/35"
        />
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={onCancel} className={ACTION_OUTLINE}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={!valid || saving}
            className={ACTION_FILLED}
          >
            {saving ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
            Plan it
          </button>
        </div>
      </div>
      <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5 text-[12px] text-content/50">
        <span className="shrink-0">Projects</span>
        {draft.cwds.map((cwd) => (
          <span
            key={cwd}
            data-goal-project={cwd}
            className="inline-flex h-6 max-w-[220px] items-center gap-1 rounded-full border border-content/12 pl-2 pr-1 text-[12px] text-content/75"
          >
            <span className="min-w-0 truncate">{projectName(cwd)}</span>
            {cwd === lead ? (
              <span className="shrink-0 text-[10px] text-content/45">lead</span>
            ) : null}
            <button
              type="button"
              aria-label={`Remove ${projectName(cwd)}`}
              onClick={() => onChange(toggleGoalProject(draft, cwd))}
              className="grid size-4 shrink-0 place-items-center rounded-full text-content/45 hover:bg-content/10 hover:text-content"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        {draft.cwds.length < MAX_GOAL_PROJECTS ? (
          <SearchableProjectPicker
            cwd=""
            recents={choices}
            onSelectProject={(cwd) => onChange(toggleGoalProject(draft, cwd))}
          />
        ) : null}
        {draft.cwds.length > 1 ? (
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="h-3 w-px shrink-0 bg-content/15" />
            Lead
            <SearchableSelect
              variant="pill"
              searchable={false}
              label="Lead project"
              value={lead}
              options={draft.cwds.map((cwd) => ({
                value: cwd,
                label: projectName(cwd),
              }))}
              onChange={(cwd) => update("leadCwd", cwd)}
            />
          </span>
        ) : null}
        <span aria-hidden className="h-3 w-px shrink-0 bg-content/15" />
        {machine ? (
          <span className="truncate">Runs on {machine}</span>
        ) : draft.cwds.length ? (
          <span role="alert" className="text-amber-400">
            {TASK_MACHINE_ERROR}
          </span>
        ) : (
          <span>Choose the projects the job may touch, all on one machine.</span>
        )}
      </div>
      <div className="relative mt-2 rounded-md border border-content/10 bg-content/3 has-focus:border-content/20">
        <textarea
          aria-label="Main job"
          value={draft.prompt}
          onChange={(event) => update("prompt", event.target.value)}
          placeholder="Describe the whole job. A planner agent reads the projects and splits it into tasks, which agents then carry out."
          rows={4}
          className="block w-full resize-y bg-transparent px-3 py-2 text-[13px] leading-relaxed text-content outline-none placeholder:text-content/35"
        />
        <div className="flex flex-wrap items-center gap-1 px-2 pb-2">
          <ModelPicker
            harness={draft.harness}
            model={draft.model}
            values={draft.modelSettings}
            project={lead || "~"}
            onChange={(harness, model) => onChange({ ...draft, harness, model })}
            onSettingsChange={(modelSettings) =>
              update("modelSettings", modelSettings)
            }
          />
          {draft.harness !== "fx" ? (
            <AccessPicker
              value={draft.runtimeMode}
              onChange={(runtimeMode) => update("runtimeMode", runtimeMode)}
            />
          ) : null}
          <span className="ml-auto flex items-center gap-2 text-[11px] text-content/45">
            Time limit
            <SearchableSelect
              variant="pill"
              searchable={false}
              align="end"
              label="Time limit"
              value={String(draft.maxRunMinutes)}
              options={RUN_TIME_LIMIT_OPTIONS}
              onChange={(value) => update("maxRunMinutes", Number(value))}
            />
          </span>
        </div>
      </div>
      <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-content/60">
        <label
          title="The planned tasks are created only once you approve the plan."
          className="flex cursor-pointer items-center gap-1.5"
        >
          <input
            type="checkbox"
            checked={draft.approvePlan}
            onChange={(event) => update("approvePlan", event.target.checked)}
            className={CHECKBOX}
          />
          Review the plan before starting
        </label>
        <label className="flex cursor-pointer items-center gap-1.5">
          <input
            type="checkbox"
            checked={draft.review}
            onChange={(event) => update("review", event.target.checked)}
            className={CHECKBOX}
          />
          Review each task with a second agent
        </label>
        <span className="text-[11px] text-content/40">
          Each task runs on its own branch and waits for you to merge it.
        </span>
      </div>
    </form>
  );
}
