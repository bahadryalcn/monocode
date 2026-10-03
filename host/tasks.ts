import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { realpathSync, statSync } from "node:fs";
import { promisify } from "node:util";
import {
  canEditTask,
  canMoveTask,
  EMPTY_PROMPT_ERROR,
  hasUnmergedBranch,
  isNewTaskStatus,
  isTaskStatus,
  parseHostTask,
  parseReviewVerdict,
  unfinishedDependencies,
  type HostTask,
  type TaskVerification,
} from "../src/features/tasks/model/hostTasks";
import { createHostWorktree } from "./git-worktrees";
import {
  STOPPED_BY_USER,
  cancelSessionRun,
  errorMessage,
  launchSessionRun,
  sessionRunState,
  type SessionRunEngine,
} from "./sessionRuns";
import { runHostShell } from "./shell";
import type { HostStore } from "./store";

const TICK_MS = 30_000;
/** How many tasks this machine works on at once. */
export const MAX_RUNNING_TASKS = 2;
/** How long a task's check command may run. */
export const VERIFY_TIMEOUT_MS = 15 * 60_000;
const VERIFY_OUTPUT_LIMIT = 4000;
const DIFF_STAT_LIMIT = 2000;

const exec = promisify(execFile);

async function git(
  cwd: string,
  args: string[],
  timeout = 30_000,
): Promise<string> {
  const { stdout } = await exec("git", args, {
    cwd,
    timeout,
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true,
  });
  return stdout.trim();
}

/** What git said when a command failed, on one line. */
function gitError(error: unknown): string {
  const stderr = (error as { stderr?: unknown } | null)?.stderr;
  const text = typeof stderr === "string" && stderr.trim() ? stderr : "";
  return (text || errorMessage(error)).trim().split(/\r?\n/).at(-1)!.trim();
}

function available(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** The branch and commit a project checkout is on, or null when the folder is
 * not the top of a git working copy. Throws when it is one a task branch
 * cannot start from or be merged back into. */
async function checkoutBase(
  cwd: string,
): Promise<{ baseBranch: string } | null> {
  try {
    const top = await git(cwd, ["rev-parse", "--show-toplevel"]);
    if (realpathSync.native(top) !== realpathSync.native(cwd)) return null;
  } catch {
    return null;
  }
  try {
    await git(cwd, ["rev-parse", "--verify", "--quiet", "HEAD^{commit}"]);
  } catch {
    throw new Error(
      "This project has no commits yet. Commit once, or turn off “Run on its own branch”.",
    );
  }
  try {
    return {
      baseBranch: await git(cwd, ["symbolic-ref", "--quiet", "--short", "HEAD"]),
    };
  } catch {
    throw new Error(
      "This project is not on a branch. Check one out, or turn off “Run on its own branch”.",
    );
  }
}

/** Commits whatever the agent left uncommitted, so the task branch holds the
 * whole result. */
async function commitLeftovers(
  cwd: string,
  branch: string,
  title: string,
): Promise<void> {
  const current = await git(cwd, [
    "symbolic-ref",
    "--quiet",
    "--short",
    "HEAD",
  ]).catch(() => "");
  if (current !== branch)
    throw new Error(
      `The agent left the working copy on ${current || "no branch"} instead of ${branch}.`,
    );
  if (!(await git(cwd, ["status", "--porcelain"]))) return;
  try {
    await git(cwd, ["add", "-A"]);
    await git(cwd, ["commit", "-q", "-m", title], 120_000);
  } catch (error) {
    throw new Error(`Could not commit the agent’s changes: ${gitError(error)}`);
  }
}

/** Merges a task branch into the branch it started from, in the project
 * checkout. Throws, leaving the checkout as it was, when it cannot. */
async function mergeTaskBranch(
  cwd: string,
  branch: string,
  baseBranch: string,
): Promise<void> {
  const current = await git(cwd, [
    "symbolic-ref",
    "--quiet",
    "--short",
    "HEAD",
  ]).catch(() => "");
  if (current !== baseBranch)
    throw new Error(
      `The project is on ${current || "no branch"}. Check out ${baseBranch} there, then merge again.`,
    );
  if (await git(cwd, ["status", "--porcelain", "--untracked-files=no"]))
    throw new Error(
      "The project has uncommitted changes. Commit or stash them, then merge again.",
    );
  try {
    await git(cwd, ["merge", "--no-ff", "--no-edit", branch], 120_000);
  } catch (error) {
    const conflicts = await git(cwd, [
      "diff",
      "--name-only",
      "--diff-filter=U",
    ]).catch(() => "");
    await git(cwd, ["merge", "--abort"]).catch(() => {});
    throw new Error(
      conflicts
        ? `${branch} conflicts with ${baseBranch} in ${conflicts.split(/\r?\n/).join(", ")}. Nothing was merged.`
        : `Could not merge ${branch}: ${gitError(error)}`,
    );
  }
}

function reviewPrompt(task: HostTask): string {
  const changes =
    hasUnmergedBranch(task) && task.baseCommit
      ? `the changes made since commit ${task.baseCommit} (\`git diff ${task.baseCommit}\`)`
      : "the uncommitted changes in this folder (`git status`, `git diff`)";
  return [
    "You are reviewing work another agent just finished. Only inspect: do not edit, create or delete files, and do not commit.",
    "",
    `Task: ${task.title}`,
    "",
    "What was asked:",
    task.prompt,
    "",
    `Review ${changes} and judge whether they do what was asked, completely and correctly.`,
    "",
    "End your reply with exactly one final line, either",
    "VERDICT: PASS",
    "or",
    "VERDICT: FAIL - <one sentence saying why>",
  ].join("\n");
}

/** Works through this machine's task backlog with no desktop open. Each task
 * runs as an ordinary host session, on a branch of its own when its project
 * is a git repository, is verified, and then waits in review. Nothing reaches
 * the project checkout until the task is approved. */
export class HostTasks {
  private timer?: ReturnType<typeof setInterval>;
  private ticking?: Promise<void>;
  /** Verifications in progress, by task. A task keeps one at most. */
  private readonly jobs = new Map<string, Promise<void>>();
  /** Tasks being merged. */
  private readonly delivering = new Set<string>();
  /** Runs on every tick once running tasks are settled, before queued ones
   * start, so work it queues can start in the same tick. */
  private beforeStart?: () => Promise<void> | void;

  constructor(
    private readonly store: HostStore,
    private readonly engine: SessionRunEngine,
    private readonly now: () => number = Date.now,
    private readonly verifyTimeoutMs = VERIFY_TIMEOUT_MS,
  ) {
    store.db.exec(
      "CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, value TEXT NOT NULL);",
    );
  }

  start(): void {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.timer.unref?.();
  }

  stop(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  /** Lets a layer on top of the board, such as goals, share its timer. */
  onTick(hook: () => Promise<void> | void): void {
    this.beforeStart = hook;
  }

  /** Resolves once no tick or verification is in progress. */
  async idle(): Promise<void> {
    while (this.ticking || this.jobs.size)
      await Promise.all([this.ticking, ...this.jobs.values()]);
  }

  /** Oldest first. */
  list(): HostTask[] {
    return this.store.db
      .prepare("SELECT value FROM tasks")
      .all()
      .map((row) => JSON.parse(String(row.value)) as HostTask)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  /** Adds a task to the queue, or as a to-do item when asked to, or edits one
   * that is not running or finished. An edit keeps the task's status. */
  save(raw: unknown): HostTask {
    const input = parseHostTask(raw);
    const requested = (raw as { status?: unknown }).status;
    if (requested !== undefined && !isNewTaskStatus(requested))
      throw new Error("A new task starts as to do or queued.");
    const now = this.now();
    const previous = this.find(input.id);
    if (!previous) {
      const status = requested ?? "queued";
      if (status === "queued" && !input.prompt.trim())
        throw new Error(EMPTY_PROMPT_ERROR);
      this.store.project(input.projectId);
      return this.write({
        ...input,
        status,
        createdAt: now,
        updatedAt: now,
      });
    }
    if (previous.status === "running" || previous.status === "verifying")
      throw new Error("Stop this task before editing it.");
    if (!canEditTask(previous.status))
      throw new Error("Only a to-do, queued or blocked task can be edited.");
    if (previous.status === "queued" && !input.prompt.trim())
      throw new Error(EMPTY_PROMPT_ERROR);
    this.store.project(previous.projectId);
    const { verifyCommand, ...kept } = previous;
    return this.write({
      ...kept,
      ...input,
      projectId: previous.projectId,
      // Work already on a branch stays there.
      ...(hasUnmergedBranch(previous) ? { isolate: true } : {}),
      updatedAt: now,
    });
  }

  /** Moving a reviewed task to done merges its branch; that can fail, and the
   * task then stays in review. */
  async move(id: string, to: unknown): Promise<HostTask> {
    const task = this.find(id);
    if (!task) throw new Error("Task not found.");
    if (!isTaskStatus(to)) throw new Error("Invalid task status");
    if (!canMoveTask(task.status, to))
      throw new Error(`A ${task.status} task cannot be moved to ${to}.`);
    const now = this.now();
    if (to === "queued" && !task.prompt.trim())
      throw new Error(EMPTY_PROMPT_ERROR);
    if (to === "todo" && task.status === "queued") {
      // Only a task nothing has run for can be pulled back.
      if (task.sessionId || task.startedAt || hasUnmergedBranch(task))
        throw new Error("This task already started, so it cannot go back to To do.");
      return this.write({ ...task, status: "todo", updatedAt: now });
    }
    if (to === "done" && task.status === "todo") {
      if (hasUnmergedBranch(task))
        throw new Error(
          `This task’s earlier work is on ${task.branch}. Run it again to review and merge that, or delete it to discard.`,
        );
      // The owner did it by hand: nothing ran, so there is nothing to merge.
      return this.write({
        ...task,
        status: "done",
        completedAt: now,
        updatedAt: now,
      });
    }
    if (to === "queued" || to === "todo") {
      // A task that runs again starts over in a fresh session. Unmerged work
      // stays on its branch, and the next run continues there. A task put
      // back to to-do is cleared the same way.
      const {
        sessionId,
        runId,
        error,
        needsInput,
        startedAt,
        completedAt,
        verification,
        reviewer,
        diffStat,
        mergeError,
        ...rest
      } = task;
      if (!task.merged) return this.write({ ...rest, status: to, updatedAt: now });
      const { branch, worktreeCwd, baseBranch, baseCommit, merged, ...fresh } =
        rest;
      return this.write({ ...fresh, status: to, updatedAt: now });
    }
    if (to === "blocked") {
      if (task.status === "verifying") {
        // A check command still running finishes unheard.
        this.jobs.delete(id);
        if (
          task.reviewer &&
          sessionRunState(this.store, task.reviewer, 0, now).state === "running"
        )
          cancelSessionRun(this.engine, task.reviewer);
        return this.block(task, STOPPED_BY_USER, now);
      }
      const run = { ...task, startedAt: task.startedAt ?? task.createdAt };
      if (sessionRunState(this.store, run, 0, now).state === "running")
        cancelSessionRun(this.engine, run);
      return this.block(task, STOPPED_BY_USER, now);
    }
    if (to === "done" && hasUnmergedBranch(task)) return this.deliver(task);
    return this.write({ ...task, status: to, updatedAt: now });
  }

  /** A task whose branch was never merged is only deleted with `discard`,
   * which removes that branch and its worktree. */
  async delete(id: string, discard = false): Promise<void> {
    const task = this.find(id);
    if (task?.status === "running" || task?.status === "verifying")
      throw new Error("Stop this task before deleting it.");
    if (task && hasUnmergedBranch(task)) {
      if (this.delivering.has(id))
        throw new Error("This task is being merged.");
      if (!discard)
        throw new Error(
          `This task’s work is on ${task.branch} and was never merged. Deleting it discards that branch.`,
        );
      await this.discard(task);
    }
    this.store.db.prepare("DELETE FROM tasks WHERE id=?").run(id);
  }

  get(id: string): HostTask | undefined {
    return this.find(id);
  }

  /** Stops a running or verifying task as Stop does, and blocks a queued one
   * with `reason`. Anything else is left as it is. */
  async cancel(id: string, reason: string): Promise<void> {
    const task = this.find(id);
    if (task?.status === "running" || task?.status === "verifying")
      await this.move(id, "blocked");
    else if (task?.status === "queued") this.block(task, reason, this.now());
  }

  /** Settles running and verifying tasks, stops those past their time limit,
   * then starts queued ones while there is room. A tick already in progress
   * is not joined by a second one. */
  tick(): Promise<void> {
    this.ticking ??= this.work().finally(() => {
      this.ticking = undefined;
    });
    return this.ticking;
  }

  private async work(): Promise<void> {
    const now = this.now();
    for (const task of this.list()) {
      try {
        if (task.status === "running") this.settle(task, now);
        else if (task.status === "verifying")
          await this.settleVerification(task, now);
      } catch (error) {
        console.error("Could not settle a task:", errorMessage(error));
      }
    }
    try {
      await this.beforeStart?.();
    } catch (error) {
      console.error("Could not update goals:", errorMessage(error));
    }
    const tasks = this.list();
    const active = tasks.filter(
      (task) => task.status === "running" || task.status === "verifying",
    );
    for (const task of tasks) {
      if (active.length >= MAX_RUNNING_TASKS) break;
      if (task.status !== "queued") continue;
      // A task waits for every task it depends on to be merged, and then
      // starts from the project as it is, with their work in it.
      if (unfinishedDependencies(task, tasks).length) continue;
      try {
        const started = await this.launch(task, now, active);
        if (started.status === "running") active.push(started);
      } catch (error) {
        console.error("Could not start a task:", errorMessage(error));
      }
    }
  }

  private find(id: string): HostTask | undefined {
    const row = this.store.db
      .prepare("SELECT value FROM tasks WHERE id=?")
      .get(id);
    return row ? (JSON.parse(String(row.value)) as HostTask) : undefined;
  }

  private write(task: HostTask): HostTask {
    this.store.db
      .prepare(
        "INSERT INTO tasks VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET value=excluded.value",
      )
      .run(task.id, JSON.stringify(task));
    return task;
  }

  private block(task: HostTask, error: string, now: number): HostTask {
    return this.write({
      ...task,
      status: "blocked",
      error,
      needsInput: undefined,
      reviewer: undefined,
      completedAt: now,
      updatedAt: now,
    });
  }

  /** Gives the task its working copy: the worktree it already has, a new one
   * on a new branch, or none when it runs in the project folder. */
  private async workingCopy(task: HostTask): Promise<HostTask> {
    const project = this.store.project(task.projectId);
    if (hasUnmergedBranch(task)) {
      if (task.worktreeCwd && available(task.worktreeCwd)) return task;
      // The worktree was removed; the branch still holds the work.
      const tree = await createHostWorktree(project.cwd, task.branch, "", true);
      return { ...task, worktreeCwd: tree.path };
    }
    if (task.isolate === false) return task;
    const base = await checkoutBase(project.cwd);
    if (!base) return task;
    const branch = `mc/${randomUUID().replace(/-/g, "").slice(0, 8)}`;
    const tree = await createHostWorktree(project.cwd, branch, "HEAD", false);
    return {
      ...task,
      branch,
      worktreeCwd: tree.path,
      baseBranch: base.baseBranch,
      baseCommit: tree.head,
    };
  }

  private async launch(
    task: HostTask,
    now: number,
    active: readonly HostTask[],
  ): Promise<HostTask> {
    let ready: HostTask;
    try {
      ready = await this.workingCopy(task);
    } catch (error) {
      if (this.find(task.id)?.updatedAt !== task.updatedAt) return task;
      return this.block({ ...task, startedAt: now }, errorMessage(error), now);
    }
    // The task may have been edited or deleted while its worktree was made.
    if (this.find(task.id)?.updatedAt !== task.updatedAt) {
      if (ready.branch && !task.branch) await this.discard(ready);
      return task;
    }
    // Tasks sharing the project folder run one at a time.
    if (
      !ready.worktreeCwd &&
      active.some(
        (other) => other.projectId === task.projectId && !other.worktreeCwd,
      )
    )
      return task;
    const started = launchSessionRun(this.store, this.engine, ready);
    const next = {
      ...ready,
      sessionId: started.sessionId,
      runId: started.runId,
      startedAt: now,
    };
    if (started.error !== undefined) return this.block(next, started.error, now);
    return this.write({ ...next, status: "running", updatedAt: now });
  }

  private settle(task: HostTask, now: number): void {
    const outcome = sessionRunState(
      this.store,
      { ...task, startedAt: task.startedAt ?? task.createdAt },
      task.maxRunMinutes,
      now,
    );
    if (outcome.state === "running") {
      if (outcome.needsInput !== Boolean(task.needsInput))
        this.write({
          ...task,
          needsInput: outcome.needsInput || undefined,
          updatedAt: now,
        });
    } else if (outcome.state === "overLimit") {
      // The reason is saved first: the turn settles asynchronously, and a
      // later tick blocks the task with it.
      this.write({ ...task, error: outcome.error });
      cancelSessionRun(this.engine, task);
    } else if (outcome.status === "succeeded") {
      this.verify(
        this.write({
          ...task,
          status: "verifying",
          needsInput: undefined,
          verification: undefined,
          updatedAt: now,
        }),
      );
    } else {
      this.block(
        task,
        outcome.status === "cancelled"
          ? STOPPED_BY_USER
          : (outcome.error ?? "The run failed."),
        now,
      );
    }
  }

  /** Runs the task's checks in the background: commits what the agent left,
   * runs the check command, then hands over to the reviewer or to review. */
  private verify(task: HostTask): void {
    const { id } = task;
    /** The task, while this job still owns its verification. */
    const current = () => {
      const latest = this.jobs.get(id) === job ? this.find(id) : undefined;
      return latest?.status === "verifying" ? latest : undefined;
    };
    const run = async () => {
      // Lets the job be registered before it first asks whether it owns the task.
      await null;
      const project = this.store.project(task.projectId);
      const cwd = task.worktreeCwd ?? project.cwd;
      if (hasUnmergedBranch(task))
        await commitLeftovers(cwd, task.branch!, task.title);
      const verification: TaskVerification = {};
      if (task.verifyCommand) {
        const result = await runHostShell(
          cwd,
          task.verifyCommand,
          this.verifyTimeoutMs,
        );
        verification.command = {
          exitCode: result.exitCode,
          output: result.output.slice(-VERIFY_OUTPUT_LIMIT),
          timedOut: result.timedOut,
        };
        if (result.timedOut || result.exitCode !== 0) {
          const latest = current();
          if (latest)
            this.block(
              { ...latest, verification },
              result.timedOut
                ? "The check command timed out."
                : result.exitCode === null
                  ? "The check command could not run."
                  : `The check command failed (exit code ${result.exitCode}).`,
              this.now(),
            );
          return;
        }
      }
      if (task.review === false) {
        const diffStat = await this.diffStat(task);
        const latest = current();
        if (latest) this.enterReview({ ...latest, verification, diffStat });
        return;
      }
      const latest = current();
      if (!latest) return;
      const now = this.now();
      const started = launchSessionRun(this.store, this.engine, {
        ...task,
        title: `Review: ${task.title}`.slice(0, 200),
        prompt: reviewPrompt(task),
      });
      const reviewing = {
        ...latest,
        verification,
        reviewer: {
          sessionId: started.sessionId,
          runId: started.runId,
          startedAt: now,
        },
      };
      if (started.error !== undefined)
        this.block(
          reviewing,
          `Could not start the reviewer: ${started.error}`,
          now,
        );
      else this.write({ ...reviewing, updatedAt: now });
    };
    const job: Promise<void> = run()
      .catch((error) => {
        const latest = current();
        if (latest) this.block(latest, errorMessage(error), this.now());
      })
      .catch((error) =>
        console.error("Could not verify a task:", errorMessage(error)),
      )
      .finally(() => {
        if (this.jobs.get(id) === job) this.jobs.delete(id);
      });
    this.jobs.set(id, job);
  }

  /** Follows a verifying task's reviewer to its verdict. */
  private async settleVerification(task: HostTask, now: number): Promise<void> {
    if (this.jobs.has(task.id)) return;
    if (!task.reviewer) {
      // The host stopped during the checks; they start over.
      this.verify(task);
      return;
    }
    const outcome = sessionRunState(
      this.store,
      task.reviewer,
      task.maxRunMinutes,
      now,
    );
    if (outcome.state === "running") {
      if (outcome.needsInput !== Boolean(task.needsInput))
        this.write({
          ...task,
          needsInput: outcome.needsInput || undefined,
          updatedAt: now,
        });
      return;
    }
    if (outcome.state === "overLimit") {
      this.write({
        ...task,
        reviewer: { ...task.reviewer, error: outcome.error },
      });
      cancelSessionRun(this.engine, task.reviewer);
      return;
    }
    if (outcome.status === "cancelled") {
      this.block(task, STOPPED_BY_USER, now);
      return;
    }
    const sessionId = task.reviewer.sessionId ?? "";
    const review =
      outcome.status === "succeeded"
        ? parseReviewVerdict(
            this.store
              .session(sessionId)
              .session.blocks.filter(
                (block) => block.role === "assistant" && block.text.trim(),
              )
              .at(-1)?.text ?? "",
          )
        : {
            verdict: "fail" as const,
            note: outcome.error ?? "The reviewer’s run failed.",
          };
    const verification = {
      ...task.verification,
      review: { ...review, sessionId },
    };
    if (review.verdict === "fail") {
      this.block({ ...task, verification }, `Review failed: ${review.note}`, now);
      return;
    }
    const diffStat = await this.diffStat(task);
    const latest = this.find(task.id);
    if (latest?.status === "verifying" && latest.updatedAt === task.updatedAt)
      this.enterReview({ ...latest, verification, diffStat });
  }

  private enterReview(task: HostTask): HostTask {
    const now = this.now();
    return this.write({
      ...task,
      status: "review",
      needsInput: undefined,
      reviewer: undefined,
      completedAt: now,
      updatedAt: now,
    });
  }

  /** What the task branch changes since it left the project's branch. */
  private async diffStat(task: HostTask): Promise<string | undefined> {
    if (!hasUnmergedBranch(task) || !task.baseCommit) return undefined;
    try {
      const stat = await git(this.store.project(task.projectId).cwd, [
        "diff",
        "--stat",
        `${task.baseCommit}...${task.branch}`,
      ]);
      return stat.slice(0, DIFF_STAT_LIMIT) || undefined;
    } catch {
      return undefined;
    }
  }

  /** Merges an approved task's branch into the project, then removes the
   * branch and its worktree. A failed merge leaves the task in review. */
  private async deliver(task: HostTask): Promise<HostTask> {
    if (this.delivering.has(task.id))
      throw new Error("This task is already being merged.");
    this.delivering.add(task.id);
    try {
      const { cwd } = this.store.project(task.projectId);
      try {
        if (!task.baseBranch)
          throw new Error("This task does not know which branch it left.");
        await mergeTaskBranch(cwd, task.branch!, task.baseBranch);
      } catch (error) {
        const latest = this.find(task.id);
        if (latest?.status === "review")
          this.write({ ...latest, mergeError: errorMessage(error) });
        throw error;
      }
      // The work is merged. A worktree holding changes made after the agent
      // finished is not forced away; it and the branch then stay behind.
      const worktreeCwd = task.worktreeCwd;
      if (worktreeCwd && available(worktreeCwd))
        await git(cwd, ["worktree", "remove", "--", worktreeCwd]).catch(
          (error) =>
            console.error("Could not remove a task worktree:", gitError(error)),
        );
      await git(cwd, ["worktree", "prune"]).catch(() => {});
      await git(cwd, ["branch", "-d", "--", task.branch!]).catch((error) =>
        console.error("Could not delete a task branch:", gitError(error)),
      );
      const { worktreeCwd: removed, mergeError, ...rest } = task;
      return this.write({
        ...rest,
        status: "done",
        merged: true,
        updatedAt: this.now(),
      });
    } finally {
      this.delivering.delete(task.id);
    }
  }

  /** Removes a task's worktree and branch, with whatever is on them. */
  private async discard(task: HostTask): Promise<void> {
    let cwd: string;
    try {
      cwd = this.store.project(task.projectId).cwd;
    } catch {
      // The project is gone from this machine, and its repository with it.
      return;
    }
    if (task.worktreeCwd && available(task.worktreeCwd))
      await git(cwd, [
        "worktree",
        "remove",
        "--force",
        "--",
        task.worktreeCwd,
      ]).catch((error) =>
        console.error("Could not remove a task worktree:", gitError(error)),
      );
    await git(cwd, ["worktree", "prune"]).catch(() => {});
    await git(cwd, ["branch", "-D", "--", task.branch!]).catch((error) =>
      console.error("Could not delete a task branch:", gitError(error)),
    );
  }
}
