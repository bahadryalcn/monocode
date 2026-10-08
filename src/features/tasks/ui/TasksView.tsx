import { t, useLocale, getLocale } from "../../../shared/i18n";
import { invalidateMachineSnapshot } from "../../automations/model/machineSnapshot";
import { PRODUCT_IDENTITY } from "../../../shared/lib/productIdentity";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { AccessPicker } from "../../sessions/ui/AccessPicker";
import { HarnessIcon } from "../../sessions/ui/HarnessIcon";
import {
  AlertCircle,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  DashboardSquare,
  Gauge,
  GitBranch,
  GitMerge,
  LoaderCircle,
  MessageSquare,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Square,
  Trash2,
  Undo2,
  X,
} from "../../../shared/ui/icons";
import {
  AUTOMATION_WEEKDAYS,
  automationScheduleLabel,
  nextRunPreview,
} from "../../automations/model/automations";
import { RUNTIME_MODE_LABEL } from "../../sessions/model/session";
import { ModelPicker } from "../../sessions/ui/ModelPicker";
import { SearchableProjectPicker } from "../../projects/ui/SearchableProjectPicker";
import { SearchableSelect } from "../../../shared/ui/SearchableSelect";
import { SkillPromptField } from "../../skills/ui/SkillPromptField";
import { AgentMarkdown } from "../../sessions/ui/AgentMarkdown";
import { TaskReviewNotes } from "./TaskReviewNotes";
import { TaskAttemptHistory, repairStopLabel } from "./TaskAttemptHistory";
import { unreadReviewNotes } from "../model/taskReviewNotes";
import { OverlayNav } from "../../../app/shell/TitleBar";
import { WindowControls } from "../../../app/shell/WindowControls";
import { useLockOverscroll } from "../../../shared/hooks/useLockOverscroll";
import { backgroundMachineFor } from "../../automations/model/hostAutomationClient";
import {
  failedMachineNames,
  staleMachineNames,
} from "../../automations/model/machineResults";
import { useRefreshLoop } from "../../automations/model/refreshScheduler";
import type { RemoteMachine } from "../../connections/model/protocol";
import { RemoteDataStatus } from "../../connections/ui/RemoteDataStatus";
import type { RemoteDataState } from "../../connections/model/remoteDataState";
import { parseRemotePath } from "../../connections/model/remoteProjects";
import { useLockSnapshot } from "../../group-lock/hooks/useGroupLock";
import { isProjectLockedIn } from "../../group-lock/model/lockState";
import {
  DAILY_SUMMARY_OPEN_EVENT,
  DAILY_SUMMARY_STORED_EVENT,
  gatherDailySummary,
  loadStoredDailySummary,
  takeSummaryPanelRequest,
} from "../model/dailySummaryClient";
import type { DailySummary, SummaryTask } from "../model/dailySummary";
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
  EMPTY_PROMPT_ERROR,
  TASK_COLUMNS,
  canEditTask,
  canMoveTask,
  canTakeOverBlockedTask,
  taskRequiresInstructions,
  hasUnmergedBranch,
  unfinishedDependencies,
  type TaskColumn,
  type TaskStatus,
  type TaskVerification,
} from "../model/hostTasks";
import { taskInstructionsMarkdown, taskInstructionsSummary } from "../model/taskInstructions";
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
  listBoardGoalResults,
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
  listBoardTaskResults,
  subscribeBoardTaskChanges,
  missingMachinesNotice,
  moveTask,
  recheckTaskReview,
  readTaskNotes,
  resolveTaskNote,
  newTaskDraft,
  saveTask,
  probeTaskMachines,
  formatTaskSpan,
  taskTimeLabel,
  tasksInColumn,
  todoMachines,
  todoUnsupportedMessage,
  type BoardTask,
  type TaskDraft,
} from "../model/taskClient";
import {
  MAX_OPEN_LIMIT,
  MAX_PROPOSALS_LIMIT,
} from "../model/hostStewards";
import {
  STEWARD_STATUS_LABELS,
  declineProposal,
  deleteSteward,
  draftFromSteward,
  isStewardProposal,
  listBoardStewardResults,
  newStewardDraft,
  runStewardNow,
  saveSteward,
  setStewardEnabled,
  stewardMachines,
  stewardProjectName,
  type BoardSteward,
  type StewardDraft,
} from "../model/stewardClient";
import {
  DAILY_LIMIT_CHOICES,
  MAX_RUNNING_TASKS_LIMIT,
  formatAgentMinutes,
  type HostSettings,
} from "../model/hostSettings";
import {
  dailyLimitNotice,
  listMachineLimits,
  saveMachineLimits,
  settingsMachines,
  type MachineLimits,
} from "../model/settingsClient";
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
  todo: "To do",
  queued: "Queued",
  running: "Running",
  review: "Review",
  done: "Done",
  blocked: "Blocked",
};

const COLUMN_EMPTY: Record<TaskColumn, string> = {
  todo: "Nothing to do yet",
  queued: "Nothing waiting",
  running: "Nothing running",
  review: "Nothing to review",
  done: "Nothing done yet",
  blocked: "Nothing blocked",
};

// The same choices as an automation's run time limit.
const RUN_TIME_LIMIT_OPTIONS = [
  { value: "0", get label() { return t("No limit"); } },
  { value: "15", get label() { return t("15 minutes"); } },
  { value: "30", get label() { return t("30 minutes"); } },
  { value: "60", get label() { return t("1 hour"); } },
  { value: "120", get label() { return t("2 hours"); } },
  { value: "240", get label() { return t("4 hours"); } },
  { value: "480", get label() { return t("8 hours"); } },
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
  useLocale();
  return (
    <div
      role="region"
      aria-label={t("Tasks")}
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
          <span className="min-w-0 truncate text-content">{t("Tasks")}</span>
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
  useLocale();
  // Tasks for a project in a locked group are not shown.
  const lock = useLockSnapshot();
  // Machines whose host keeps a task board, this computer's included.
  const [machines, setMachines] = useState<RemoteMachine[]>([]);
  // Machines whose tasks are missing: offline, or with an older host.
  const [missingNotice, setMissingNotice] = useState<string | null>(null);
  // The ones whose host also keeps manual to-do items.
  const [todoCapable, setTodoCapable] = useState<RemoteMachine[]>([]);
  const [storedTasks, setTasks] = useState<BoardTask[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now);
  const [loading, setLoading] = useState(true);
  const [boardDataState, setBoardDataState] = useState<RemoteDataState>({
    phase: "loading",
  });
  const forceBoardRefresh = useRef(false);
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
  // Machines whose host runs project stewards, and their stewards.
  const [stewardCapable, setStewardCapable] = useState<RemoteMachine[]>([]);
  const [storedStewards, setStewards] = useState<BoardSteward[]>([]);
  const [stewardDraft, setStewardDraft] = useState<StewardDraft | null>(null);
  const [stewardsOpen, setStewardsOpen] = useState(false);
  // Machines whose host keeps work limits, and what each reports.
  const [limitCapable, setLimitCapable] = useState<RemoteMachine[]>([]);
  const [limits, setLimits] = useState<MachineLimits[]>([]);
  const [limitsOpen, setLimitsOpen] = useState(false);
  // The daily summary: the last one sent, or a fresh one built on request.
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [storedSummary, setStoredSummary] = useState(loadStoredDailySummary);
  const [freshSummary, setFreshSummary] = useState<DailySummary | null>(null);
  const [summaryBusy, setSummaryBusy] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

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
  const stewards = useMemo(
    () =>
      storedStewards.filter((steward) => !isProjectLockedIn(lock, steward.cwd)),
    [lock, storedStewards],
  );
  const dailyNotice = useMemo(() => dailyLimitNotice(limits), [limits]);
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
  const newReviewNotes = tasks.reduce(
    (count, task) => count + unreadReviewNotes(task.reviewNotes),
    0,
  );

  // A click on the summary notification opens the panel, also when the view
  // was not showing yet.
  useEffect(() => {
    const open = () => {
      if (takeSummaryPanelRequest()) setSummaryOpen(true);
    };
    const stored = () => setStoredSummary(loadStoredDailySummary());
    open();
    window.addEventListener(DAILY_SUMMARY_OPEN_EVENT, open);
    window.addEventListener(DAILY_SUMMARY_STORED_EVENT, stored);
    return () => {
      window.removeEventListener(DAILY_SUMMARY_OPEN_EVENT, open);
      window.removeEventListener(DAILY_SUMMARY_STORED_EVENT, stored);
    };
  }, []);
  const onRefreshSummary = async () => {
    setSummaryBusy(true);
    setSummaryError(null);
    try {
      const at = Date.now();
      setFreshSummary(await gatherDailySummary(at - 24 * 60 * 60 * 1000, at));
    } catch (cause) {
      setSummaryError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSummaryBusy(false);
    }
  };

  const refreshBoard = useCallback(async (isCurrent: () => boolean) => {
    const force = forceBoardRefresh.current;
    forceBoardRefresh.current = false;
    if (force) {
      invalidateMachineSnapshot();
      setBoardDataState((current) => ({
        ...current,
        phase: current.updatedAt ? "refreshing" : "loading",
      }));
    }
    try {
      const [reach, goalHosts, todoHosts, stewardHosts, limitHosts] =
        await Promise.all([
          probeTaskMachines(force),
          goalMachines(force),
          todoMachines(force),
          stewardMachines(force),
          settingsMachines(force),
        ]);
      if (!isCurrent()) return;
      const capable = reach.capable;
      setMachines(capable);
      setTodoCapable(todoHosts);
      setGoalCapable(goalHosts);
      setStewardCapable(stewardHosts);
      setLimitCapable(limitHosts);
      const [taskResults, goalResults, stewardResults, limitResults] =
        await Promise.all([
          listBoardTaskResults(capable, reach.unreachableMachines, force),
          listBoardGoalResults(goalHosts, reach.unreachableMachines),
          listBoardStewardResults(stewardHosts, reach.unreachableMachines),
          listMachineLimits(
            limitHosts.filter(
              (machine) =>
                !reach.unreachableMachines.some((down) => down.id === machine.id),
            ),
          ),
        ]);
      if (!isCurrent()) return;
      // A machine that does not answer keeps its last known cards, marked stale.
      const results = [...taskResults, ...goalResults, ...stewardResults];
      setMissingNotice(
        missingMachinesNotice(
          {
            outdated: reach.outdated,
            unreachable: [
              ...new Set([...reach.unreachable, ...failedMachineNames(results)]),
            ],
          },
          staleMachineNames(results),
        ),
      );
      setTasks(taskResults.flatMap((result) => result.data));
      setGoals(goalResults.flatMap((result) => result.data));
      setStewards(stewardResults.flatMap((result) => result.data));
      setLimits(limitResults);
      setNow(Date.now());
      const boardResults = [...taskResults, ...goalResults, ...stewardResults];
      const failedResults = boardResults.filter((result) => result.status === "error");
      const refreshProblems = [
        ...new Set(
          failedResults.map(
            (result) =>
              `${result.machineName}: ${reach.unreachableErrors?.[result.machineId] ?? result.error ?? "request failed"}`,
          ),
        ),
        ...reach.outdated.map((name) => `${name}: update ${PRODUCT_IDENTITY.displayName} Host to refresh its board`),
      ];
      const error = refreshProblems.length
        ? `Some machine data could not be refreshed: ${refreshProblems.join("; ")}`
        : undefined;
      const freshTaskRead = taskResults.some(
        (result) => result.status === "ok" && !result.cached,
      );
      setBoardDataState((current) => ({
        phase: error
          ? current.updatedAt
            ? "stale"
            : "error"
          : taskResults.every((result) => result.data.length === 0) &&
              goalResults.every((result) => result.data.length === 0) &&
              stewardResults.every((result) => result.data.length === 0)
            ? "empty"
            : "ready",
        updatedAt: error || !freshTaskRead ? current.updatedAt : Date.now(),
        error,
      }));
    } catch (reason) {
      if (!isCurrent()) return;
      setBoardDataState((current) => ({
        phase: "error",
        updatedAt: current.updatedAt,
        error: reason instanceof Error ? reason.message : String(reason),
      }));
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, []);

  // Shared host metadata invalidates task lists; the bounded periodic refresh
  // still updates goals/limits and supports older hosts. Reads never overlap.
  const refresh = useRefreshLoop(refreshBoard, 15_000);
  const retryBoard = () => {
    forceBoardRefresh.current = true;
    void refresh();
  };
  const taskSubscriptionKey = JSON.stringify(
    machines.map(machine => [machine.id, machine.environmentId]).sort(),
  );
  useEffect(
    () => subscribeBoardTaskChanges(machines, refresh),
    [taskSubscriptionKey, refresh],
  );

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

  const beginSteward = () => {
    const project =
      cwd && looksLikeProject(cwd) ? cwd : (recents[0]?.path ?? "~");
    const preferred = defaultSessionChoice(project);
    const harness = firstEnabledHarness(project, preferred.harness);
    const model =
      (preferred.harness === harness ? preferred.model : undefined) ??
      modelsFor(harness)[0]?.id ??
      preferredModelId(harness);
    setError(null);
    setStewardDraft(newStewardDraft(project, harness, model));
  };

  const onSaveSteward = async (event: FormEvent) => {
    event.preventDefault();
    if (saving || !stewardDraft) return;
    setSaving(true);
    try {
      await saveSteward(stewardCapable, stewardDraft);
      setStewardDraft(null);
      setError(null);
      await refresh();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSaving(false);
    }
  };

  const actOnSteward = (
    steward: BoardSteward,
    action: () => Promise<unknown>,
  ) => act({ id: `steward:${steward.machineId}:${steward.id}` }, action);

  const onDeleteSteward = (steward: BoardSteward) => {
    if (
      !window.confirm(
        `Delete the steward for ${stewardProjectName(steward)}? Its suggestions stay on the board.`,
      )
    )
      return;
    void actOnSteward(steward, () => deleteSteward(steward));
  };

  const onChangeLimits = async (
    machineId: string,
    settings: Partial<HostSettings>,
  ) => {
    const machine = limitCapable.find((entry) => entry.id === machineId);
    if (!machine) return;
    try {
      const saved = await saveMachineLimits(machine, settings);
      setLimits((current) =>
        current.map((entry) => (entry.machineId === machineId ? saved : entry)),
      );
      setError(null);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
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

  const onMove = (task: BoardTask, to: TaskStatus) => {
    if (to === "queued" && !task.prompt.trim()) {
      setError(EMPTY_PROMPT_ERROR);
      return;
    }
    void act(task, () => moveTask(task, to));
  };

  /** `queued` starts a new task right away; `save` keeps an edited task's status. */
  const onSave = async (mode: "todo" | "queued" | "save") => {
    if (saving || !draft) return;
    setSaving(true);
    try {
      await saveTask(machines, draft, mode === "todo" ? "todo" : "queued");
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

  const onEdit = (task: BoardTask) => {
    setError(null);
    setDraft(draftFromTask(task));
  };

  /** Saves a new title and description from the detail panel; true when saved. */
  const onSaveDetails = async (
    task: BoardTask,
    title: string,
    prompt: string,
  ): Promise<boolean> => {
    try {
      await saveTask(machines, { ...draftFromTask(task), title, prompt });
      setError(null);
      await refresh();
      return true;
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
      return false;
    }
  };

  const taskContext = (task: BoardTask) => ({
    project: resolveTabGroupLabel(
      projectKey(task.cwd),
      groupLabels,
      projectName(task.cwd),
    ),
    goal: task.goalId
      ? goalTitles.get(goalKey(task.machineId, task.goalId))
      : undefined,
    waitingFor:
      task.status === "queued"
        ? unfinishedDependencies(
            task,
            storedTasks.filter((other) => other.machineId === task.machineId),
          ).map((other) => other.title)
        : [],
  });
  const actionsFor = (task: BoardTask) => ({
    busy: acting === task.id,
    onRecheckReview: () => void act(task, () => recheckTaskReview(task)),
    onMove: (to: TaskStatus) => onMove(task, to),
    onEdit: () => onEdit(task),
    onDelete: () => onDelete(task),
    onDecline: () => void act(task, () => declineProposal(task)),
    onOpenSession: task.sessionId ? () => void onOpenSession(task) : undefined,
    onReadNotes: (ids: string[]) =>
      void act(task, () => readTaskNotes(task, ids)),
    onResolveNote: (id: string, resolved: boolean) =>
      void act(task, () => resolveTaskNote(task, id, resolved)),
    onOpenReview: (sessionId: string) => void onOpenSession({ ...task, sessionId }),
  });
  const selected = selectedKey
    ? visibleTasks.find(
        (task) => `${task.machineId}:${task.id}` === selectedKey,
      )
    : undefined;
  // A task that is gone from the board takes its panel with it.
  useEffect(() => {
    if (selectedKey && !loading && !selected) setSelectedKey(null);
  }, [loading, selected, selectedKey]);

  return (
    <div className="imece-tasks flex min-h-0 min-w-0 flex-1 flex-col text-content">
      <header className="imece-workspace-heading">
        <div className="imece-heading-mark" aria-hidden="true"><DashboardSquare className="size-6" /></div>
        <div className="min-w-0 flex-1">
          <h1>{t("Work in motion")}</h1>
          <p>{t("Follow an idea from its first step to a reviewed result.")}</p>
        </div>
        <div className="imece-heading-count"><strong>{visibleTasks.length}</strong><span>{t("tasks")}</span></div>
      </header>
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-stroke px-3">
        <span className="min-w-0 flex-1 truncate text-[12px] text-content/45">
          {machines.length > 0
            ? t("Each task runs on its project’s machine, with this app open or closed.")
            : loading
              ? t("Looking for machines…")
              : t("No connected machine has a task board. Connect one, or update its {p0} Host.", { p0: PRODUCT_IDENTITY.displayName })}
        </span>
        {newReviewNotes > 0 ? (
          <span data-new-review-notes className="shrink-0 text-[11px] text-amber-400">
            {newReviewNotes}{t(" new review ")}{newReviewNotes === 1 ? t("note") : t("notes")}
          </span>
        ) : null}
        {goals.length > 0 ? (
          <SearchableSelect
            variant="pill"
            searchable={goals.length > 8}
            align="end"
            label={t("Show goal")}
            value={goalFilter}
            options={[
              { value: ALL_GOALS, get label() { return t("All tasks"); } },
              ...goals.map((goal) => ({
                value: goalKey(goal.machineId, goal.id),
                label: goal.title,
              })),
            ]}
            onChange={setGoalFilter}
          />
        ) : null}
        {stewardCapable.length > 0 ? (
          <button
            type="button"
            aria-expanded={stewardsOpen}
            onClick={() => setStewardsOpen((open) => !open)}
            className={ACTION_OUTLINE}
          >
            <Bot className="size-3.5" strokeWidth={1.75} />{t("Stewards")}{stewards.length > 0 ? (
              <span className="tabular-nums text-content/45">
                {stewards.length}
              </span>
            ) : null}
          </button>
        ) : null}
        <button
          type="button"
          aria-expanded={summaryOpen}
          onClick={() => setSummaryOpen((open) => !open)}
          className={ACTION_OUTLINE}
        >
          <Check className="size-3.5" strokeWidth={1.75} />{t("Summary")}</button>
        {limits.length > 0 ? (
          <button
            type="button"
            aria-expanded={limitsOpen}
            onClick={() => setLimitsOpen((open) => !open)}
            className={ACTION_OUTLINE}
          >
            <Gauge className="size-3.5" strokeWidth={1.75} />{t("Limits")}</button>
        ) : null}
        <button
          type="button"
          onClick={beginGoal}
          disabled={goalDraft != null || draft != null}
          className={ACTION_OUTLINE}
        >
          <Sparkles className="size-3.5" strokeWidth={1.75} />{t("New goal")}</button>
        <button
          type="button"
          onClick={beginCreate}
          disabled={draft != null || goalDraft != null}
          className={ACTION_OUTLINE}
        >
          <Plus className="size-3.5" strokeWidth={1.75} />{t("New task")}</button>
      </div>
      <RemoteDataStatus
        state={boardDataState}
        onRefresh={retryBoard}
        label={t("task board")}
      />
      {error ? (
        <div className="mx-4 mt-4 flex shrink-0 items-start gap-2 rounded-lg border border-red-400/20 bg-red-400/8 px-3 py-2 text-[12px] text-red-300">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}
      {missingNotice ? (
        <div className="mx-4 mt-4 flex shrink-0 items-start gap-2 rounded-lg border border-content/10 bg-content/4 px-3 py-2 text-[12px] text-content/60">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
          <span>{missingNotice}</span>
        </div>
      ) : null}
      {dailyNotice ? (
        <div
          role="status"
          className="mx-4 mt-4 flex shrink-0 items-start gap-2 rounded-lg border border-amber-400/20 bg-amber-400/8 px-3 py-2 text-[12px] text-amber-400"
        >
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
          <span>{dailyNotice}</span>
        </div>
      ) : null}
      {summaryOpen ? (
        <SummaryPanel
          summary={freshSummary ?? storedSummary}
          busy={summaryBusy}
          error={summaryError}
          onRefresh={() => void onRefreshSummary()}
          onOpenTask={setSelectedKey}
        />
      ) : null}
      {limitsOpen && limits.length > 0 ? (
        <LimitsPanel limits={limits} onChange={onChangeLimits} />
      ) : null}
      {draft ? (
        <TaskForm
          key={draft.id ?? "new"}
          draft={draft}
          recents={recents}
          machine={machineName(machines, draft.cwd)}
          todoUnsupported={todoUnsupportedMessage(
            machines,
            todoCapable,
            draft.cwd,
          )}
          saving={saving}
          onChange={setDraft}
          onCancel={() => setDraft(null)}
          onSubmit={(mode) => void onSave(mode)}
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
      {stewardsOpen && stewardCapable.length > 0 ? (
        <StewardsPanel
          stewards={stewards}
          draft={stewardDraft}
          recents={recents}
          machine={
            stewardDraft
              ? machineName(stewardCapable, stewardDraft.cwd)
              : undefined
          }
          saving={saving}
          acting={acting}
          now={now}
          onAdd={beginSteward}
          onEdit={(steward) => {
            setError(null);
            setStewardDraft(draftFromSteward(steward));
          }}
          onChange={setStewardDraft}
          onCancel={() => setStewardDraft(null)}
          onSubmit={onSaveSteward}
          onToggle={(steward) =>
            void actOnSteward(steward, () =>
              setStewardEnabled(steward, !steward.enabled),
            )
          }
          onRunNow={(steward) =>
            void actOnSteward(steward, () => runStewardNow(steward))
          }
          onDelete={onDeleteSteward}
        />
      ) : null}
      {goals.length > 0 ? (
        <ul
          aria-label={t("Goals")}
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
      <div className="flex min-h-0 min-w-0 flex-1">
      <div
        ref={boardLock}
        className="min-h-0 min-w-0 flex-1 overflow-auto overscroll-none p-3"
      >
        {loading ? (
          <div className="grid h-full place-items-center text-content/35">
            <LoaderCircle className="size-4 animate-spin" />
          </div>
        ) : (
          <div className="grid h-full min-w-[1200px] grid-cols-6 gap-3">
            {TASK_COLUMNS.map((status) => {
              const column = tasksInColumn(tasks, status);
              return (
                <section
                  key={status}
                  aria-label={COLUMN_LABELS[status]}
                  data-task-column={status}
                  className="imece-task-column flex min-h-0 min-w-0 flex-col rounded-md border border-content/10 bg-content/3"
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
                          {...taskContext(task)}
                          {...actionsFor(task)}
                          selected={`${task.machineId}:${task.id}` === selectedKey}
                          onOpen={() =>
                            setSelectedKey(`${task.machineId}:${task.id}`)
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
      {selected ? (
        <TaskDetail
          key={`${selected.machineId}:${selected.id}`}
          task={selected}
          now={now}
          {...taskContext(selected)}
          {...actionsFor(selected)}
          onClose={() => setSelectedKey(null)}
          onSaveDetails={(title, prompt) =>
            onSaveDetails(selected, title, prompt)
          }
        />
      ) : null}
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
  goal,
  waitingFor,
  selected,
  onOpen,
  ...actions
}: {
  task: BoardTask;
  now: number;
  project: string;
  /** The title of the goal the task was planned for. */
  goal?: string;
  /** Titles of the tasks it waits for. */
  waitingFor: readonly string[];
  /** Its detail panel is open. */
  selected: boolean;
  onOpen: () => void;
} & TaskActionHandlers) {
  useLocale();
  const model = resolveModel(task.harness, task.model);
  const description = taskInstructionsSummary(task.prompt);
  const unread = unreadReviewNotes(task.reviewNotes);
  return (
    // A click anywhere on the card but its buttons opens the detail panel.
    <article
      aria-label={task.title}
      aria-current={selected || undefined}
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget && event.key === "Enter")
          onOpen();
      }}
      className={`cursor-pointer rounded-md border bg-background-base px-2.5 py-2 hover:border-content/20 ${
        selected ? "border-content/30" : "border-content/10"
      }`}
    >
      {goal ? (
        <p
          data-task-goal
          title={t("Part of the goal “{p0}”", { p0: goal })}
          className="mb-1 flex min-w-0 items-center gap-1 text-[10px] text-content/45"
        >
          <Sparkles className="size-2.5 shrink-0" />
          <span className="min-w-0 truncate">{goal}</span>
        </p>
      ) : null}
      {task.source === "steward" ? (
        <p
          data-task-suggested
          title={t("Suggested by a project steward")}
          className="mb-1 inline-flex h-4 items-center gap-1 rounded-full bg-violet-500/12 px-1.5 text-[10px] font-medium text-violet-400"
        >
          <Bot className="size-2.5 shrink-0" />{t("Suggested")}</p>
      ) : null}
      <h3
        title={description}
        className="line-clamp-2 text-[13px] font-semibold leading-snug text-content"
      >
        {task.title}
      </h3>
      {description ? (
        <p
          data-task-description
          className="mt-0.5 line-clamp-2 whitespace-pre-line break-words text-[11px] leading-snug text-content/45"
        >
          {description}
        </p>
      ) : null}
      <p className="mt-1 truncate text-[11px] text-content/45">
        {project}{t(" · on ")}{task.machineName}
        {task.stale ? t(" (offline, last known)") : ""}
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
          title={task.merged ? t("Merged into {p0}", { p0: task.baseBranch }) : task.branch}
          className="mt-1 flex min-w-0 items-center gap-1 text-[11px] text-content/45"
        >
          <GitBranch className="size-3 shrink-0" />
          <span className="min-w-0 truncate">
            {task.merged
              ? t("{p0} merged into {p1}", { p0: task.branch, p1: task.baseBranch })
              : task.branch}
          </span>
        </p>
      ) : null}
      {task.autoMerged ? (
        <p
          data-task-auto-merged
          className="mt-1 inline-flex h-4 items-center rounded-full bg-emerald-500/12 px-1.5 text-[10px] font-medium text-emerald-400"
        >{t("Merged automatically")}</p>
      ) : null}
      {waitingFor.length > 0 ? (
        <p className="mt-1 break-words text-[11px] leading-snug text-content/50">{t("Waiting for: ")}{waitingFor.join(", ")}
        </p>
      ) : null}
      {task.status === "verifying" ? (
        <p className="mt-1.5 mr-1 inline-flex h-5 items-center rounded-full bg-sky-500/12 px-2 text-[11px] font-medium text-sky-400">{t("Verifying")}</p>
      ) : null}
      {task.needsInput || taskRequiresInstructions(task) ? (
        <p className="mt-1.5 inline-flex h-5 items-center rounded-full bg-amber-500/12 px-2 text-[11px] font-medium text-amber-400">{t("Needs input")}</p>
      ) : null}
      {task.repairAttempts ? (
        <p title={task.repairNote} className="mt-1.5 text-[11px] text-amber-400">
          {task.status === "blocked" ? t("Automatic corrections used") : t("Automatic correction")}{t(" · attempt ")}{task.repairAttempts}
        </p>
      ) : null}
      {repairStopLabel(task) ? <p className="mt-1.5 text-[11px] text-amber-400">{repairStopLabel(task)}</p> : null}
      {task.reviewNotes?.length ? (
        <p data-task-review-notes className={`mt-1.5 text-[11px] ${unread ? "text-amber-400" : "text-content/50"}`}>
          {unread
            ? t((unread === 1 ? "{p0} new review note" : "{p0} new review notes"), { p0: unread })
            : t((task.reviewNotes.length === 1 ? "{p0} review note" : "{p0} review notes"), { p0: task.reviewNotes.length })}
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
          aria-label={"Changes"}
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
      <TaskActions task={task} {...actions} />
    </article>
  );
}

type TaskActionHandlers = {
  busy: boolean;
  onMove: (to: TaskStatus) => void;
  onEdit: () => void;
  onDelete: () => void;
  /** Deletes a steward's to-do suggestion and keeps it from coming back. */
  onDecline: () => void;
  /** Missing while the task has no session yet. */
  onOpenSession?: () => void;
  onReadNotes: (noteIds: string[]) => void;
  onResolveNote: (noteId: string, resolved: boolean) => void;
  onOpenReview: (sessionId: string) => void;
  onRecheckReview: () => void;
};

/** What the owner can do with a task, as the card and the detail panel both
 * offer it. Clicks stay on the buttons rather than opening the panel. */
function TaskActions({
  task,
  busy,
  onMove,
  onEdit,
  onDelete,
  onDecline,
  onOpenSession,
  onRecheckReview,
}: { task: BoardTask } & TaskActionHandlers) {
  useLocale();
  const can = (to: TaskStatus) => canMoveTask(task.status, to);
  return (
    <div
      className="mt-1.5 flex flex-wrap items-center gap-0.5"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {busy ? (
        <LoaderCircle className="mx-1.5 size-3 animate-spin text-content/40" />
      ) : null}
      {can("done") ? (
        hasUnmergedBranch(task) ? (
          <CardAction
            label={t("Merge into {p0}", { p0: task.baseBranch })}
            disabled={busy}
            onClick={() => onMove("done")}
          >
            <GitMerge className="size-3" />
          </CardAction>
        ) : (
          <CardAction
            label={task.status === "todo" ? t("Mark done") : t("Approve")}
            disabled={busy}
            onClick={() => onMove("done")}
          >
            <Check className="size-3" />
          </CardAction>
        )
      ) : null}
      {can("queued") && !taskRequiresInstructions(task) && !canTakeOverBlockedTask(task) ? (
        <CardAction
          label={
            task.status === "todo"
              ? t("Start")
              : task.status === "blocked"
                ? t("Retry")
                : t("Run again")
          }
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
      {task.status === "blocked" && !taskRequiresInstructions(task) && !canTakeOverBlockedTask(task) && task.reviewRecheckSupported && task.verification?.review?.verdict === "fail" && task.sessionId ? (
        <CardAction label={t("Recheck review")} disabled={busy} onClick={onRecheckReview}>
          <RefreshCw className="size-3" />
        </CardAction>
      ) : null}
      {can("todo") ? (
        <CardAction
          label={task.status === "done" ? t("Reopen") : t("Move to To do")}
          disabled={busy}
          onClick={() => onMove("todo")}
        >
          <Undo2 className="size-3" />
        </CardAction>
      ) : null}
      {can("blocked") ? (
        <CardAction label={t("Stop")} disabled={busy} onClick={() => onMove("blocked")}>
          <Square className="size-3" />
        </CardAction>
      ) : null}
      {onOpenSession ? (
        <CardAction label={t("Open session")} disabled={false} onClick={onOpenSession}>
          <MessageSquare className="size-3" />
        </CardAction>
      ) : null}
      {canEditTask(task.status) ? (
        <CardAction label={taskRequiresInstructions(task) ? t("Update instructions") : t("Edit")} disabled={busy} onClick={onEdit}>
          <Pencil className="size-3" />
        </CardAction>
      ) : null}
      {isStewardProposal(task) ? (
        <CardAction label={t("Decline")} disabled={busy} onClick={onDecline}>
          <X className="size-3" />
        </CardAction>
      ) : task.status === "running" || task.status === "verifying" ? null : (
        <CardAction label={t("Delete")} disabled={busy} onClick={onDelete}>
          <Trash2 className="size-3" />
        </CardAction>
      )}
    </div>
  );
}

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To do",
  queued: "Queued",
  running: "Running",
  verifying: "Verifying",
  review: "Review",
  done: "Done",
  blocked: "Blocked",
};

function formatTime(at: number | undefined): string | undefined {
  return at ? new Date(at).toLocaleString(getLocale()) : undefined;
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  useLocale();
  return (
    <div className="flex min-w-0 gap-2 text-[12px] leading-snug">
      <dt className="w-24 shrink-0 text-content/45">{label}</dt>
      <dd className="min-w-0 flex-1 break-words text-content/80">{children}</dd>
    </div>
  );
}

/** A task in full, beside the board: its description, where and how it runs,
 * and everything the host recorded about it. The title and description can be
 * edited in place while the task may be edited at all. */
function TaskDetail({
  task,
  now,
  project,
  goal,
  waitingFor,
  onClose,
  onSaveDetails,
  ...actions
}: {
  task: BoardTask;
  now: number;
  project: string;
  goal?: string;
  waitingFor: readonly string[];
  onClose: () => void;
  /** Resolves true once the new title and description are saved. */
  onSaveDetails: (title: string, prompt: string) => Promise<boolean>;
} & TaskActionHandlers) {
  useLocale();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [prompt, setPrompt] = useState(task.prompt);
  const [saving, setSaving] = useState(false);
  const model = resolveModel(task.harness, task.model);
  const description = task.prompt.trim();
  const editable = canEditTask(task.status);
  const canSave =
    title.trim().length > 0 &&
    (task.status === "todo" || prompt.trim().length > 0) &&
    !saving;

  // The task may stop being editable while its panel is open.
  useEffect(() => {
    if (!editable) setEditing(false);
  }, [editable]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (editing) setEditing(false);
      else onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editing, onClose]);

  const beginEdit = () => {
    setTitle(task.title);
    setPrompt(task.prompt);
    setEditing(true);
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSave) return;
    setSaving(true);
    try {
      if (await onSaveDetails(title.trim(), prompt)) setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const { command, review } = task.verification ?? {};
  return (
    <aside
      aria-label={t("Task details")}
      className="flex min-h-0 w-[380px] max-w-[45%] shrink-0 flex-col border-l border-stroke"
    >
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-stroke px-3">
        <span className="inline-flex h-5 items-center rounded-full bg-content/8 px-2 text-[11px] font-medium text-content/70">
          {STATUS_LABELS[task.status]}
        </span>
        {task.needsInput || taskRequiresInstructions(task) ? (
          <span className="inline-flex h-5 items-center rounded-full bg-amber-500/12 px-2 text-[11px] font-medium text-amber-400">{t("Needs input")}</span>
        ) : null}
        {task.source === "steward" ? (
          <span
            data-task-suggested
            className="inline-flex h-5 items-center rounded-full bg-violet-500/12 px-2 text-[11px] font-medium text-violet-400"
          >{t("Suggested")}</span>
        ) : null}
        <button
          type="button"
          aria-label={t("Close details")}
          onClick={onClose}
          className="ml-auto grid size-6 place-items-center rounded-md text-content/50 hover:bg-content/10 hover:text-content"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {editing ? (
          <form aria-label={t("Edit details")} onSubmit={save} className="space-y-2">
            <input
              autoFocus
              aria-label={t("Title")}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="w-full rounded-md border border-content/10 bg-content/3 px-2 py-1 text-[14px] font-semibold text-content outline-none focus:border-content/20"
            />
            <textarea
              aria-label={t("Description")}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={t("Details, acceptance criteria, links…")}
              rows={8}
              className="block w-full resize-y rounded-md border border-content/10 bg-content/3 px-2 py-1.5 text-[13px] leading-relaxed text-content outline-none placeholder:text-content/35 focus:border-content/20"
            />
            <div className="flex items-center gap-2">
              <button type="submit" disabled={!canSave} className={ACTION_FILLED}>
                {saving ? <LoaderCircle className="size-3.5 animate-spin" /> : null}{t("Save")}</button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className={ACTION_OUTLINE}
              >{t("Cancel")}</button>
            </div>
          </form>
        ) : (
          <>
            <div className="flex items-start gap-2">
              <h2 className="min-w-0 flex-1 break-words text-[15px] font-semibold leading-snug text-content">
                {task.title}
              </h2>
              {editable ? (
                <button
                  type="button"
                  onClick={beginEdit}
                  className={CARD_ACTION}
                  aria-label={t("Edit title and description")}
                >
                  <Pencil className="size-3" />{t("Edit")}</button>
              ) : null}
            </div>
            <div data-task-detail-description className="text-[13px] text-content/80">
              {description ? (
                <AgentMarkdown text={taskInstructionsMarkdown(task.prompt)} allowRemoteMedia={false} />
              ) : (
                <p className="text-content/45">{t("No description.")}</p>
              )}
            </div>
          </>
        )}
        <TaskActions task={task} {...actions} />
        <TaskAttemptHistory task={task} onOpenSession={actions.onOpenReview} />
        {task.reviewNotes ? (
          <TaskReviewNotes notes={task.reviewNotes} busy={actions.busy} stale={task.stale}
            onRead={actions.onReadNotes} onResolve={actions.onResolveNote} onOpenReview={actions.onOpenReview} />
        ) : null}
        {goal ? (
          <p className="flex min-w-0 items-center gap-1 text-[12px] text-content/55">
            <Sparkles className="size-3 shrink-0" />
            <span className="min-w-0 truncate">{t("Part of the goal “")}{goal}”</span>
          </p>
        ) : null}
        {task.status === "blocked" && task.error ? (
          <p
            role="alert"
            className="break-words text-[12px] leading-snug text-rose-400"
          >
            {task.error}
          </p>
        ) : null}
        <dl className="space-y-1.5">
          <DetailRow label={t("Project")}>{project}</DetailRow>
          <DetailRow label={t("Machine")}>{task.machineName}</DetailRow>
          <DetailRow label={t("Agent")}>
            <span className="inline-flex items-center gap-1">
              <HarnessIcon harness={task.harness} className="size-3.5 shrink-0" />
              {model.name}
            </span>
          </DetailRow>
          <DetailRow label={t("Access")}>{RUNTIME_MODE_LABEL[task.runtimeMode]}</DetailRow>
          <DetailRow label={t("Time limit")}>
            {RUN_TIME_LIMIT_OPTIONS.find(
              (option) => option.value === String(task.maxRunMinutes),
            )?.label ?? t("{p0} minutes", { p0: task.maxRunMinutes })}
          </DetailRow>
          {task.branch ? (
            <DetailRow label={t("Branch")}>
              {task.merged
                ? t("{p0} merged into {p1}", { p0: task.branch, p1: task.baseBranch })
                : task.branch}
            </DetailRow>
          ) : null}
          {task.baseBranch ? (
            <DetailRow label={t("Base branch")}>{task.baseBranch}</DetailRow>
          ) : null}
          {task.autoMerged ? (
            <DetailRow label={t("Merge")}>{t("Merged automatically")}{task.mergedAt ? ` · ${formatTime(task.mergedAt)}` : ""}
            </DetailRow>
          ) : null}
          {waitingFor.length > 0 ? (
            <DetailRow label={t("Waiting for")}>{waitingFor.join(", ")}</DetailRow>
          ) : null}
          <DetailRow label={t("Created")}>{formatTime(task.createdAt)}</DetailRow>
          {task.startedAt ? (
            <DetailRow label={t("Started")}>{formatTime(task.startedAt)}</DetailRow>
          ) : null}
          {task.completedAt ? (
            <DetailRow label={t("Completed")}>{formatTime(task.completedAt)}</DetailRow>
          ) : null}
          <DetailRow label={t("Status")}>{taskTimeLabel(task, now)}</DetailRow>
          {task.repairAttempts ? (
            <DetailRow label={t("Automatic correction")}>{t("Attempt ")}{task.repairAttempts} · {task.repairNote}
            </DetailRow>
          ) : null}
          {task.verifyCommand ? (
            <DetailRow label={t("Check command")}>
              <code className="font-mono text-[11px]">{task.verifyCommand}</code>
            </DetailRow>
          ) : null}
        </dl>
        {command ? (
          <section aria-label={t("Check output")} className="space-y-1">
            <h3 className="text-[12px] text-content/55">{t("Check command")}{" "}
              <span
                className={
                  !command.timedOut && command.exitCode === 0
                    ? "text-emerald-400"
                    : "text-rose-400"
                }
              >
                {!command.timedOut && command.exitCode === 0
                  ? t("passed")
                  : command.timedOut
                    ? t("timed out")
                    : command.exitCode === null
                      ? t("could not run")
                      : t("failed (exit code {p0})", { p0: command.exitCode })}
              </span>
            </h3>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-content/5 px-2 py-1.5 font-mono text-[11px] text-content/65">
              {command.output.trim() || "No output."}
            </pre>
          </section>
        ) : null}
        {review ? (
          <p className="break-words text-[12px] leading-snug text-content/65">{t("Reviewer")}{" "}
            <span
              className={
                review.verdict === "pass" ? "text-emerald-400" : "text-rose-400"
              }
            >
              {review.verdict === "pass" ? t("passed") : t("failed")}
            </span>
            {review.note ? ` · ${review.note}` : null}
          </p>
        ) : null}
        {task.diffStat ? (
          <pre
            aria-label={"Diff stat"}
            className="max-h-48 overflow-auto rounded bg-content/5 px-2 py-1.5 font-mono text-[11px] leading-snug text-content/65"
          >
            {task.diffStat}
          </pre>
        ) : null}
        {task.mergeError ? (
          <p
            role="alert"
            className="break-words text-[12px] leading-snug text-rose-400"
          >
            {task.mergeError}
          </p>
        ) : null}
      </div>
    </aside>
  );
}

/** What the host checked before review: the check command's result, with its
 * output on demand, and the reviewer's verdict. */
function VerificationSummary({
  verification,
}: {
  verification: TaskVerification;
}) {
  useLocale();
  const { command, review } = verification;
  if (!command && !review) return null;
  const passed = command && !command.timedOut && command.exitCode === 0;
  return (
    <div className="mt-1.5 space-y-1 text-[11px] leading-snug text-content/60">
      {command ? (
        <details>
          <summary className="cursor-pointer select-none">{t("Check command")}{" "}
            <span className={passed ? "text-emerald-400" : "text-rose-400"}>
              {passed
                ? t("passed")
                : command.timedOut
                  ? t("timed out")
                  : command.exitCode === null
                    ? t("could not run")
                    : t("failed (exit code {p0})", { p0: command.exitCode })}
            </span>
          </summary>
          <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-content/5 px-1.5 py-1 font-mono text-[10px] text-content/60">
            {command.output.trim() || "No output."}
          </pre>
        </details>
      ) : null}
      {review ? (
        <p className="break-words">{t("Reviewer")}{" "}
          <span
            className={
              review.verdict === "pass" ? "text-emerald-400" : "text-rose-400"
            }
          >
            {review.verdict === "pass" ? t("passed") : t("failed")}
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
  useLocale();
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
  todoUnsupported,
  saving,
  onChange,
  onCancel,
  onSubmit,
}: {
  draft: TaskDraft;
  recents: RecentProject[];
  /** The machine whose host would run this draft, when it is connected. */
  machine?: string;
  /** Why a to-do item cannot be added on that machine, when it cannot. */
  todoUnsupported?: string;
  saving: boolean;
  onChange: (draft: TaskDraft) => void;
  onCancel: () => void;
  /** `todo` and `queued` add a new task; `save` keeps an edited task's status. */
  onSubmit: (mode: "todo" | "queued" | "save") => void;
}) {
  useLocale();
  // A to-do item is mostly title and description; the agent comes later.
  const [agentOpen, setAgentOpen] = useState(
    draft.id ? draft.status !== "todo" : false,
  );
  const update = <K extends keyof TaskDraft>(key: K, value: TaskDraft[K]) =>
    onChange({ ...draft, [key]: value });
  const hasDescription = draft.prompt.trim().length > 0;
  const ready =
    draft.title.trim().length > 0 &&
    looksLikeProject(draft.cwd) &&
    draft.model.length > 0 &&
    machine != null;
  const canTodo = ready && !todoUnsupported;
  const canSave = ready && (draft.status === "todo" || hasDescription);
  return (
    <form
      aria-label={draft.id ? t("Edit task") : t("New task")}
      onSubmit={(event) => {
        event.preventDefault();
        if (saving) return;
        if (draft.id) {
          if (canSave) onSubmit("save");
        } else if (canTodo) onSubmit("todo");
      }}
      className="shrink-0 border-b border-stroke px-4 py-3"
    >
      <div className="flex items-start gap-4">
        <input
          autoFocus
          aria-label={t("Task title")}
          value={draft.title}
          onChange={(event) => update("title", event.target.value)}
          placeholder={t("What should get done?")}
          className="min-w-0 flex-1 bg-transparent text-[16px] font-semibold leading-tight text-content outline-none placeholder:text-content/35"
        />
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={onCancel} className={ACTION_OUTLINE}>{t("Cancel")}</button>
          {draft.id ? (
            <button
              type="submit"
              disabled={!canSave || saving}
              className={ACTION_FILLED}
            >
              {saving ? <LoaderCircle className="size-3.5 animate-spin" /> : null}{t("Save")}</button>
          ) : (
            <>
              <button
                type="button"
                disabled={!ready || !hasDescription || saving}
                title={
                  hasDescription
                    ? undefined
                    : t("Add a description to start this with an agent.")
                }
                onClick={() => onSubmit("queued")}
                className={ACTION_OUTLINE}
              >{t("Add and start")}</button>
              <button
                type="submit"
                disabled={!canTodo || saving}
                className={ACTION_FILLED}
              >
                {saving ? <LoaderCircle className="size-3.5 animate-spin" /> : null}{t("Add to To do")}</button>
            </>
          )}
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
          <span className="truncate">{t("Runs on ")}{machine}</span>
        ) : (
          <span role="alert" className="text-amber-400">
            {TASK_MACHINE_ERROR}
          </span>
        )}
        {!draft.id && todoUnsupported ? (
          <span role="status" className="text-amber-400">
            {todoUnsupported}
          </span>
        ) : null}
      </div>
      <div className="relative mt-2 rounded-md border border-content/10 bg-content/3 has-focus:border-content/20">
        <SkillPromptField
          value={draft.prompt}
          harness={draft.harness}
          cwd={draft.cwd}
          onChange={(prompt) => update("prompt", prompt)}
          label={t("Description")}
          placeholder={t("Details, acceptance criteria, links…")}
        />
      </div>
      <button
        type="button"
        aria-expanded={agentOpen}
        onClick={() => setAgentOpen((open) => !open)}
        className="mt-2 inline-flex h-6 items-center gap-1 rounded-md text-[12px] text-content/55 hover:text-content"
      >
        {agentOpen ? (
          <ChevronDown className="size-3" />
        ) : (
          <ChevronRight className="size-3" />
        )}{t("Agent settings")}</button>
      {agentOpen ? (
        <div className="mt-1 space-y-2">
          <div className="flex flex-wrap items-center gap-1 rounded-md border border-content/10 bg-content/3 px-2 py-2">
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
            <span className="ml-auto flex items-center gap-2 text-[11px] text-content/45">{t("Time limit")}<SearchableSelect
                variant="pill"
                searchable={false}
                align="end"
                label={t("Time limit")}
                value={String(draft.maxRunMinutes)}
                options={RUN_TIME_LIMIT_OPTIONS}
                onChange={(value) => update("maxRunMinutes", Number(value))}
              />
            </span>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-content/60">
            <label
              title={t("In a git project the task works on a new branch in its own worktree, and nothing reaches the project until you merge it.")}
              className="flex cursor-pointer items-center gap-1.5"
            >
              <input
                type="checkbox"
                checked={draft.isolate}
                onChange={(event) => update("isolate", event.target.checked)}
                className={CHECKBOX}
              />{t("Run on its own branch")}</label>
            <label className="flex cursor-pointer items-center gap-1.5">
              <input
                type="checkbox"
                checked={draft.review}
                onChange={(event) => update("review", event.target.checked)}
                className={CHECKBOX}
              />{t("Review with a second agent")}</label>
            <AutoMergeField
              checked={draft.autoMerge && draft.isolate}
              disabled={!draft.isolate}
              onChange={(checked) => update("autoMerge", checked)}
            />
            <label className="flex min-w-[220px] flex-1 items-center gap-2">
              <span className="shrink-0">{t("Check command")}</span>
              <input
                aria-label={t("Check command")}
                value={draft.verifyCommand}
                onChange={(event) => update("verifyCommand", event.target.value)}
                placeholder={"npm test"}
                spellCheck={false}
                className="h-7 min-w-0 flex-1 rounded-md border border-content/10 bg-content/3 px-2 font-mono text-[12px] text-content outline-none placeholder:text-content/30 focus:border-content/20"
              />
            </label>
          </div>
        </div>
      ) : null}
    </form>
  );
}

/** The option to merge a task's branch once every check passes. */
function AutoMergeField({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  useLocale();
  return (
    <label
      className={`flex items-center gap-1.5 ${disabled ? "opacity-50" : "cursor-pointer"}`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className={CHECKBOX}
      />{t("Merge automatically")}<span className="text-[11px] text-content/40">{t("Merges into the base branch when every check passes")}</span>
    </label>
  );
}

const DAILY_LIMIT_LABELS: Record<number, string> = {
  0: "No limit",
  60: "1 hour",
  120: "2 hours",
  240: "4 hours",
  480: "8 hours",
  720: "12 hours",
};

/** Each machine's work limits: how many tasks run at once, how much agent time
 * a day may use, and how much of today's is gone. */
const SUMMARY_TIME = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const SUMMARY_HEADING =
  "text-[11px] font-medium uppercase tracking-wide text-content/45";

/** What the agents did over a period, across every machine. */
function SummaryPanel({
  summary,
  busy,
  error,
  onRefresh,
  onOpenTask,
}: {
  summary: DailySummary | null;
  busy: boolean;
  error: string | null;
  onRefresh: () => void;
  onOpenTask: (key: string) => void;
}) {
  useLocale();
  const taskSection = (
    label: string,
    items: readonly SummaryTask[],
    note = "",
  ) =>
    items.length ? (
      <section aria-label={label} className="flex flex-col gap-1">
        <h3 className={SUMMARY_HEADING}>
          {label} · {items.length}
          {note}
        </h3>
        <ul className="flex flex-col gap-0.5">
          {items.map((item) => (
            <li key={item.key} className="min-w-0 text-[12px] text-content/60">
              <button
                type="button"
                onClick={() => onOpenTask(item.key)}
                className="max-w-full truncate text-left font-medium text-content/85 hover:text-content hover:underline"
              >
                {item.title}
              </button>{" "}
              <span className="text-content/45">
                {item.project} · {item.machineName}
                {item.detail ? ` · ${item.detail}` : ""}
              </span>
            </li>
          ))}
        </ul>
      </section>
    ) : null;
  const goalSection = (label: string, goals: DailySummary["goals"]) =>
    goals.length ? (
      <section aria-label={label} className="flex flex-col gap-1">
        <h3 className={SUMMARY_HEADING}>
          {label} · {goals.length}
        </h3>
        <ul className="flex flex-col gap-0.5">
          {goals.map((goal) => (
            <li
              key={`${goal.machineName}:${goal.title}`}
              className="text-[12px] text-content/60"
            >
              <span className="font-medium text-content/85">{goal.title}</span>{" "}
              <span className="text-content/45">
                {goal.done}{t(" of ")}{goal.total}{t(" tasks done · ")}{goal.machineName}
              </span>
            </li>
          ))}
        </ul>
      </section>
    ) : null;
  const empty =
    summary != null &&
    !summary.finished.length &&
    !summary.blocked.length &&
    !summary.waiting.length &&
    !summary.suggestions.length &&
    !summary.goals.length &&
    !summary.goalsFinished.length;
  return (
    <section
      aria-label={t("Summary")}
      className="mx-4 mt-4 flex max-h-[45%] shrink-0 flex-col gap-3 overflow-y-auto rounded-lg border border-content/10 bg-content/3 p-3"
    >
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 text-[12px] text-content/50">
          {summary
            ? t("From {p0} to {p1}", { p0: SUMMARY_TIME.format(summary.since), p1: SUMMARY_TIME.format(summary.until) })
            : t("No summary yet. One is sent every day at the time set in Settings.")}
        </p>
        <button
          type="button"
          onClick={onRefresh}
          disabled={busy}
          className={ACTION_OUTLINE}
        >
          <RefreshCw className="size-3.5" strokeWidth={1.75} />
          {busy ? t("Refreshing…") : t("Refresh now")}
        </button>
      </div>
      {error ? <p className="text-[12px] text-red-300">{error}</p> : null}
      {summary ? (
        <>
          {empty ? (
            <p className="text-[12px] text-content/50">{t("No background activity.")}</p>
          ) : null}
          {taskSection(
            "Finished",
            summary.finished,
            summary.autoMerged
              ? ` (${summary.autoMerged} merged automatically)`
              : "",
          )}
          {taskSection("Blocked", summary.blocked)}
          {taskSection("Waiting for you", summary.waiting)}
          {taskSection("New suggestions", summary.suggestions)}
          {goalSection("Goals in progress", summary.goals)}
          {goalSection("Goals finished", summary.goalsFinished)}
          {summary.usage.length ? (
            <section aria-label={t("Agent time")} className="flex flex-col gap-1">
              <h3 className={SUMMARY_HEADING}>{t("Agent time today")}</h3>
              <ul className="flex flex-col gap-0.5">
                {summary.usage.map((entry) => (
                  <li
                    key={entry.machineName}
                    className="text-[12px] text-content/60"
                  >
                    <span className="font-medium text-content/85">
                      {entry.machineName}
                    </span>{" "}
                    {formatAgentMinutes(entry.usedMinutes)}
                    {entry.dailyAgentMinutes
                      ? t(" of {p0}", { p0: formatAgentMinutes(entry.dailyAgentMinutes) })
                      : ""}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {summary.unreachable.length || summary.outdated.length ? (
            <p className="text-[12px] text-content/50">{t("Not included:")}{" "}
              {[
                ...summary.unreachable.map((name) => `${name} (not reachable)`),
                ...summary.outdated.map(
                  (name) => `${name} (host needs an update)`,
                ),
              ].join(", ")}
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function CustomDailyLimit({
  entry,
  onChange,
}: {
  entry: MachineLimits;
  onChange: (machineId: string, settings: Partial<HostSettings>) => void;
}) {
  useLocale();
  const [hours, setHours] = useState(String(entry.dailyAgentMinutes / 60));
  useEffect(() => {
    setHours(String(entry.dailyAgentMinutes / 60));
  }, [entry.dailyAgentMinutes]);
  const minutes = Math.round(Number(hours) * 60);
  const valid = hours.trim() !== "" && Number(hours) >= 0 && Number.isSafeInteger(minutes);
  return (
    <form
      aria-label={t("Custom daily agent time on {p0}", { p0: entry.machineName })}
      className="flex items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) onChange(entry.machineId, { dailyAgentMinutes: minutes });
      }}
    >
      <label className="flex items-center gap-2">{t("Hours")}<input
          type="number"
          min="0"
          step="any"
          aria-label={t("Daily agent hours on {p0}", { p0: entry.machineName })}
          value={hours}
          onChange={(event) => setHours(event.target.value)}
          className="w-24 rounded border border-content/15 bg-content/5 px-2 py-1 text-content outline-none focus:border-content/40"
        />
      </label>
      <button type="submit" disabled={!valid} className={ACTION_OUTLINE}>{t("Save")}</button>
      <span className="text-[11px] text-content/40">{t("0 = no limit")}</span>
    </form>
  );
}

function LimitsPanel({
  limits,
  onChange,
}: {
  limits: readonly MachineLimits[];
  onChange: (machineId: string, settings: Partial<HostSettings>) => void;
}) {
  useLocale();
  // A limit set some other way stays selectable.
  const choices = (current: number) =>
    [...new Set([...DAILY_LIMIT_CHOICES, current])]
      .sort((a, b) => (a === 0 ? -1 : b === 0 ? 1 : a - b))
      .map((minutes) => ({
        value: String(minutes),
        label: DAILY_LIMIT_LABELS[minutes] ?? formatAgentMinutes(minutes),
      }));
  return (
    <ul
      aria-label={t("Work limits")}
      className="mx-4 mt-4 flex shrink-0 flex-col gap-2 rounded-lg border border-content/10 bg-content/3 p-3"
    >
      {limits.map((entry) => (
        <li
          key={entry.machineId}
          className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-content/60"
        >
          <span className="min-w-24 font-medium text-content/80">
            {entry.machineName}
          </span>
          <span className="flex items-center gap-2">{t("Max concurrent tasks")}<SearchableSelect
              variant="pill"
              searchable={false}
              label={t("Max concurrent tasks on {p0}", { p0: entry.machineName })}
              value={String(entry.maxRunningTasks)}
              options={Array.from({ length: MAX_RUNNING_TASKS_LIMIT }, (_, i) => ({
                value: String(i + 1),
                label: String(i + 1),
              }))}
              onChange={(value) =>
                onChange(entry.machineId, { maxRunningTasks: Number(value) })
              }
            />
          </span>
          <span className="flex items-center gap-2">{t("Daily agent time")}<SearchableSelect
              variant="pill"
              searchable={false}
              label={t("Daily agent time on {p0}", { p0: entry.machineName })}
              value={String(entry.dailyAgentMinutes)}
              options={choices(entry.dailyAgentMinutes)}
              onChange={(value) =>
                onChange(entry.machineId, { dailyAgentMinutes: Number(value) })
              }
            />
          </span>
          <CustomDailyLimit entry={entry} onChange={onChange} />
          <span className="tabular-nums text-content/50">{t("Used today: ")}{formatAgentMinutes(entry.usedMinutes)}
          </span>
        </li>
      ))}
    </ul>
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
  useLocale();
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
            {progress.done}/{progress.total}{t(" done")}</span>
        ) : null}
        <span className="min-w-0 truncate text-[11px] text-content/40">
          {goal.projects.map((project) => project.name).join(", ")}{t(" · on")}{" "}
          {goal.machineName}
          {goal.stale ? t(" (offline, last known)") : ""}
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          {busy ? (
            <LoaderCircle className="mx-1.5 size-3 animate-spin text-content/40" />
          ) : null}
          {goal.status === "awaiting-approval" ? (
            <CardAction label={t("Approve")} disabled={busy} onClick={onApprove}>
              <Check className="size-3" />
            </CardAction>
          ) : null}
          {canReplan ? (
            <CardAction
              label={t("Replan")}
              disabled={busy}
              onClick={() => setReplanning((open) => !open)}
            >
              <RotateCcw className="size-3" />
            </CardAction>
          ) : null}
          {onOpenPlanner ? (
            <CardAction
              label={t("Open planner")}
              disabled={false}
              onClick={onOpenPlanner}
            >
              <MessageSquare className="size-3" />
            </CardAction>
          ) : null}
          {goal.status === "done" || goal.status === "cancelled" ? null : (
            <CardAction label={t("Cancel")} disabled={busy} onClick={onCancel}>
              <Square className="size-3" />
            </CardAction>
          )}
          {goal.status === "planning" || goal.status === "running" ? null : (
            <CardAction label={t("Delete")} disabled={busy} onClick={onDelete}>
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
        <ol aria-label={t("Plan")} className="mt-1.5 space-y-1">
          {goal.plan.tasks.map((task) => (
            <li
              key={task.key}
              title={task.prompt}
              className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-[12px] leading-snug"
            >
              <span className="text-content/80">{task.title}</span>
              <span className="text-[11px] text-content/45">{t("in ")}{projectOf(task.projectId, task.project)}
              </span>
              {task.dependsOn.length ? (
                <span className="text-[11px] text-content/45">{t("· after ")}{task.dependsOn.map(titleOf).join(", ")}
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
      {replanning && canReplan ? (
        <form
          aria-label={t("Replan")}
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
            aria-label={t("Plan feedback")}
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
            placeholder={t("What should the plan do differently? (optional)")}
            rows={2}
            className="min-w-0 flex-1 resize-y rounded-md border border-content/10 bg-background-base px-2 py-1 text-[12px] text-content outline-none placeholder:text-content/30 focus:border-content/20"
          />
          <button type="submit" disabled={busy} className={ACTION_FILLED}>{t("Plan again")}</button>
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
  useLocale();
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
      aria-label={t("New goal")}
      onSubmit={onSubmit}
      className="shrink-0 border-b border-stroke px-4 py-3"
    >
      <div className="flex items-start gap-4">
        <input
          autoFocus
          aria-label={t("Goal title")}
          value={draft.title}
          onChange={(event) => update("title", event.target.value)}
          placeholder={t("Name the main job")}
          className="min-w-0 flex-1 bg-transparent text-[16px] font-semibold leading-tight text-content outline-none placeholder:text-content/35"
        />
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={onCancel} className={ACTION_OUTLINE}>{t("Cancel")}</button>
          <button
            type="submit"
            disabled={!valid || saving}
            className={ACTION_FILLED}
          >
            {saving ? <LoaderCircle className="size-3.5 animate-spin" /> : null}{t("Plan it")}</button>
        </div>
      </div>
      <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5 text-[12px] text-content/50">
        <span className="shrink-0">{t("Projects")}</span>
        {draft.cwds.map((cwd) => (
          <span
            key={cwd}
            data-goal-project={cwd}
            className="inline-flex h-6 max-w-[220px] items-center gap-1 rounded-full border border-content/12 pl-2 pr-1 text-[12px] text-content/75"
          >
            <span className="min-w-0 truncate">{projectName(cwd)}</span>
            {cwd === lead ? (
              <span className="shrink-0 text-[10px] text-content/45">{t("lead")}</span>
            ) : null}
            <button
              type="button"
              aria-label={t("Remove {p0}", { p0: projectName(cwd) })}
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
            <span aria-hidden className="h-3 w-px shrink-0 bg-content/15" />{t("Lead")}<SearchableSelect
              variant="pill"
              searchable={false}
              label={t("Lead project")}
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
          <span className="truncate">{t("Runs on ")}{machine}</span>
        ) : draft.cwds.length ? (
          <span role="alert" className="text-amber-400">
            {TASK_MACHINE_ERROR}
          </span>
        ) : (
          <span>{t("Choose the projects the job may touch, all on one machine.")}</span>
        )}
      </div>
      <div className="relative mt-2 rounded-md border border-content/10 bg-content/3 has-focus:border-content/20">
        <textarea
          aria-label={t("Main job")}
          value={draft.prompt}
          onChange={(event) => update("prompt", event.target.value)}
          placeholder={t("Describe the whole job. A planner agent reads the projects and splits it into tasks, which agents then carry out.")}
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
          <span className="ml-auto flex items-center gap-2 text-[11px] text-content/45">{t("Time limit")}<SearchableSelect
              variant="pill"
              searchable={false}
              align="end"
              label={t("Time limit")}
              value={String(draft.maxRunMinutes)}
              options={RUN_TIME_LIMIT_OPTIONS}
              onChange={(value) => update("maxRunMinutes", Number(value))}
            />
          </span>
        </div>
      </div>
      <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-content/60">
        <label
          title={t("The planned tasks are created only once you approve the plan.")}
          className="flex cursor-pointer items-center gap-1.5"
        >
          <input
            type="checkbox"
            checked={draft.approvePlan}
            onChange={(event) => update("approvePlan", event.target.checked)}
            className={CHECKBOX}
          />{t("Review the plan before starting")}</label>
        <label className="flex cursor-pointer items-center gap-1.5">
          <input
            type="checkbox"
            checked={draft.review}
            onChange={(event) => update("review", event.target.checked)}
            className={CHECKBOX}
          />{t("Review each task with a second agent")}</label>
        <AutoMergeField
          checked={draft.autoMerge}
          onChange={(checked) => update("autoMerge", checked)}
        />
        <span className="text-[11px] text-content/40">
          {draft.autoMerge
            ? t("Each task runs on its own branch.")
            : t("Each task runs on its own branch and waits for you to merge it.")}
        </span>
      </div>
    </form>
  );
}

function scheduleOf(draft: StewardDraft) {
  return {
    scheduleKind: draft.scheduleKind,
    minute: draft.minute,
    time: draft.time,
    dayOfWeek: draft.dayOfWeek,
  };
}

const SCHEDULE_OPTIONS = [
  { value: "hourly", get label() { return t("Hourly"); } },
  { value: "daily", get label() { return t("Daily"); } },
  { value: "weekdays", get label() { return t("Weekdays"); } },
  { value: "weekly", get label() { return t("Weekly"); } },
] as const;

/** The stewards above the board: one row per project with its schedule and
 * last run, and the form that adds or edits one. */
function StewardsPanel({
  stewards,
  draft,
  recents,
  machine,
  saving,
  acting,
  now,
  onAdd,
  onEdit,
  onChange,
  onCancel,
  onSubmit,
  onToggle,
  onRunNow,
  onDelete,
}: {
  stewards: readonly BoardSteward[];
  draft: StewardDraft | null;
  recents: RecentProject[];
  /** The machine that would run the draft's steward, when it is connected. */
  machine?: string;
  saving: boolean;
  acting: string | null;
  now: number;
  onAdd: () => void;
  onEdit: (steward: BoardSteward) => void;
  onChange: (draft: StewardDraft) => void;
  onCancel: () => void;
  onSubmit: (event: FormEvent) => void;
  onToggle: (steward: BoardSteward) => void;
  onRunNow: (steward: BoardSteward) => void;
  onDelete: (steward: BoardSteward) => void;
}) {
  useLocale();
  return (
    <section
      aria-label={t("Stewards")}
      className="flex max-h-[45%] shrink-0 flex-col gap-1.5 overflow-y-auto border-b border-stroke p-3"
    >
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 text-[12px] text-content/50">{t("A steward reads its project on a schedule and suggests the next work as To do items. Nothing runs until you start it.")}</p>
        <button
          type="button"
          onClick={onAdd}
          disabled={draft != null}
          className={ACTION_OUTLINE}
        >
          <Plus className="size-3.5" strokeWidth={1.75} />{t("Add steward")}</button>
      </div>
      {draft ? (
        <StewardForm
          draft={draft}
          recents={recents}
          machine={machine}
          saving={saving}
          onChange={onChange}
          onCancel={onCancel}
          onSubmit={onSubmit}
        />
      ) : null}
      <ul aria-label={t("Steward list")} className="flex flex-col gap-1.5">
        {stewards.map((steward) => {
          const busy = acting === `steward:${steward.machineId}:${steward.id}`;
          const running = steward.run != null;
          return (
            <li key={`${steward.machineId}:${steward.id}`}>
              <article
                aria-label={t("Steward for {p0}", { p0: stewardProjectName(steward) })}
                data-steward-status={steward.lastRunStatus}
                className="rounded-md border border-content/10 bg-content/3 px-3 py-2"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <Bot className="size-3.5 shrink-0 text-content/45" />
                  <h3
                    title={steward.focus || undefined}
                    className="min-w-0 truncate text-[13px] font-semibold text-content"
                  >
                    {stewardProjectName(steward)}
                  </h3>
                  <span className="min-w-0 truncate text-[11px] text-content/40">{t("on ")}{steward.machineName}
                    {steward.stale ? t(" (offline, last known)") : ""} ·{" "}
                    {automationScheduleLabel(steward)}
                  </span>
                  <div className="ml-auto flex shrink-0 items-center gap-0.5">
                    {busy ? (
                      <LoaderCircle className="mx-1.5 size-3 animate-spin text-content/40" />
                    ) : null}
                    <label className="flex cursor-pointer items-center gap-1.5 px-1.5 text-[11px] text-content/60">
                      <input
                        type="checkbox"
                        aria-label={t("Enabled")}
                        checked={steward.enabled}
                        disabled={busy}
                        onChange={() => onToggle(steward)}
                        className={CHECKBOX}
                      />{t("Enabled")}</label>
                    <CardAction
                      label={t("Run now")}
                      disabled={busy || running}
                      onClick={() => onRunNow(steward)}
                    >
                      <Play className="size-3" />
                    </CardAction>
                    <CardAction
                      label={t("Edit")}
                      disabled={busy}
                      onClick={() => onEdit(steward)}
                    >
                      <Pencil className="size-3" />
                    </CardAction>
                    <CardAction
                      label={t("Delete")}
                      disabled={busy}
                      onClick={() => onDelete(steward)}
                    >
                      <Trash2 className="size-3" />
                    </CardAction>
                  </div>
                </div>
                <p className="mt-1 break-words text-[11px] leading-snug text-content/50">
                  {steward.lastRunStatus ? (
                    <>{t("Last run: ")}{STEWARD_STATUS_LABELS[steward.lastRunStatus]}
                      {steward.lastRunAt
                        ? t(" {p0} ago", { p0: formatTaskSpan(now - steward.lastRunAt) })
                        : ""}
                      {steward.lastRunStatus === "succeeded" &&
                      steward.lastProposed !== undefined
                        ? t((steward.lastProposed === 1 ? " · {p0} new suggestion" : " · {p0} new suggestions"), { p0: steward.lastProposed })
                        : ""}
                    </>
                  ) : (
                    t("Has not run yet")
                  )}
                  {steward.enabled
                    ? ` · ${nextRunPreview(steward.nextRunAt)}`
                    : t(" · Paused")}
                </p>
                {steward.lastRunError &&
                (steward.lastRunStatus === "failed" ||
                  steward.lastRunStatus === "skipped") ? (
                  <p
                    className={`mt-0.5 break-words text-[11px] leading-snug ${
                      steward.lastRunStatus === "failed"
                        ? "text-rose-400"
                        : "text-content/45"
                    }`}
                  >
                    {steward.lastRunError}
                  </p>
                ) : null}
              </article>
            </li>
          );
        })}
        {stewards.length === 0 && !draft ? (
          <li className="px-1 py-2 text-[11px] text-content/35">{t("No stewards yet.")}</li>
        ) : null}
      </ul>
    </section>
  );
}

/** The steward form: the project, what to look for, when to look, and the
 * agent that does it. */
function StewardForm({
  draft,
  recents,
  machine,
  saving,
  onChange,
  onCancel,
  onSubmit,
}: {
  draft: StewardDraft;
  recents: RecentProject[];
  machine?: string;
  saving: boolean;
  onChange: (draft: StewardDraft) => void;
  onCancel: () => void;
  onSubmit: (event: FormEvent) => void;
}) {
  useLocale();
  const update = <K extends keyof StewardDraft>(
    key: K,
    value: StewardDraft[K],
  ) => onChange({ ...draft, [key]: value });
  const valid =
    looksLikeProject(draft.cwd) && draft.model.length > 0 && machine != null;
  const number = (
    label: string,
    value: number,
    max: number,
    key: "maxProposals" | "maxOpen" | "minute",
    min = 1,
  ) => (
    <label className="flex items-center gap-2">
      <span className="shrink-0">{label}</span>
      <input
        type="number"
        aria-label={label}
        min={min}
        max={max}
        value={value}
        onChange={(event) => {
          const next = Math.trunc(Number(event.target.value));
          if (Number.isFinite(next))
            update(key, Math.min(max, Math.max(min, next)));
        }}
        className="h-7 w-16 rounded-md border border-content/10 bg-content/3 px-2 text-[12px] text-content outline-none focus:border-content/20"
      />
    </label>
  );
  return (
    <form
      aria-label={draft.id ? t("Edit steward") : t("New steward")}
      onSubmit={onSubmit}
      className="rounded-md border border-content/10 bg-background-base px-3 py-2"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2 text-[12px] text-content/50">
        {draft.id ? (
          // A steward stays with the project it was created for.
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
          <span className="truncate">{t("Runs on ")}{machine}</span>
        ) : (
          <span role="alert" className="text-amber-400">
            {TASK_MACHINE_ERROR}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={onCancel} className={ACTION_OUTLINE}>{t("Cancel")}</button>
          <button
            type="submit"
            disabled={!valid || saving}
            className={ACTION_FILLED}
          >
            {saving ? <LoaderCircle className="size-3.5 animate-spin" /> : null}{t("Save")}</button>
        </div>
      </div>
      <textarea
        aria-label={t("Focus")}
        value={draft.focus}
        onChange={(event) => update("focus", event.target.value)}
        placeholder={t("What should it look for? e.g. follow docs/ROADMAP.md, or find bugs and missing tests")}
        rows={2}
        className="mt-2 block w-full resize-y rounded-md border border-content/10 bg-content/3 px-2 py-1.5 text-[13px] leading-relaxed text-content outline-none placeholder:text-content/35 focus:border-content/20"
      />
      <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 text-[12px] text-content/60">
        <span className="shrink-0">{t("Look")}</span>
        <SearchableSelect
          variant="pill"
          searchable={false}
          label={t("Schedule")}
          value={draft.scheduleKind}
          options={SCHEDULE_OPTIONS}
          onChange={(value) =>
            update("scheduleKind", value as StewardDraft["scheduleKind"])
          }
        />
        {draft.scheduleKind === "weekly" ? (
          <SearchableSelect
            variant="pill"
            searchable={false}
            label={t("Day of week")}
            value={String(draft.dayOfWeek)}
            options={AUTOMATION_WEEKDAYS.map((day, index) => ({
              value: String(index),
              label: day,
            }))}
            onChange={(value) => update("dayOfWeek", Number(value))}
          />
        ) : null}
        {draft.scheduleKind === "hourly" ? (
          number("Minute", draft.minute, 59, "minute", 0)
        ) : (
          <input
            type="time"
            aria-label={t("Time")}
            value={draft.time}
            onChange={(event) => {
              if (event.target.value) update("time", event.target.value);
            }}
            className="h-7 rounded-md border border-content/10 bg-content/3 px-2 text-[12px] text-content outline-none focus:border-content/20"
          />
        )}
        <span className="text-[11px] text-content/40">
          {automationScheduleLabel(scheduleOf(draft))}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1 rounded-md border border-content/10 bg-content/3 px-2 py-2">
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
      </div>
      <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-content/60">
        {number(
          "Max suggestions per run",
          draft.maxProposals,
          MAX_PROPOSALS_LIMIT,
          "maxProposals",
        )}
        {number(
          "Pause at open suggestions",
          draft.maxOpen,
          MAX_OPEN_LIMIT,
          "maxOpen",
        )}
        <label className="flex cursor-pointer items-center gap-1.5">
          <input
            type="checkbox"
            checked={draft.autoStart}
            onChange={(event) => update("autoStart", event.target.checked)}
            className={CHECKBOX}
          />{t("Start suggestions automatically")}</label>
        <AutoMergeField
          checked={draft.autoMerge}
          onChange={(checked) => update("autoMerge", checked)}
        />
        {draft.autoStart ? (
          <span role="status" className="text-[11px] text-amber-400">{t("Suggestions will run without you reviewing the idea first.")}{draft.autoMerge
              ? ""
              : t(" Each still waits for your review before it is merged.")}
          </span>
        ) : null}
      </div>
    </form>
  );
}
