import { afterEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SendTurnInput } from "../src/integrations/harness/core/types";
import type { HostProvider } from "./providers";
import { HostEngine } from "./engine";
import { HostStore } from "./store";
import { HostTasks, MAX_RUNNING_TASKS, MAX_REPAIR_ATTEMPTS } from "./tasks";

const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

const MINUTE = 60_000;
/** Tests that run a check command start a real shell. */
const SHELL_TEST_MS = 60_000;

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();

function setup(verifyTimeoutMs?: number) {
  const directory = realpathSync.native(
    mkdtempSync(join(tmpdir(), "monocode-tasks-test-")),
  );
  const store = new HostStore(join(directory, "host.db"));
  const addProject = (name: string) => {
    const cwd = join(directory, name);
    mkdirSync(cwd);
    return store.addProject(cwd, name);
  };
  /** A project that is a git repository on `main`, with one commit. */
  const addRepo = (name: string) => {
    const added = addProject(name);
    git(added.cwd, "init", "-q");
    git(added.cwd, "checkout", "-q", "-b", "main");
    git(added.cwd, "config", "user.name", "Test");
    git(added.cwd, "config", "user.email", "test@example.test");
    writeFileSync(join(added.cwd, "file.txt"), "initial\n");
    git(added.cwd, "add", "file.txt");
    git(added.cwd, "commit", "-q", "-m", "initial");
    return added;
  };
  const project = addProject("first");
  const turns: Array<{
    input: SendTurnInput;
    finish: () => void;
    fail: (error: Error) => void;
  }> = [];
  const provider: HostProvider = {
    send: vi.fn(
      (input) =>
        new Promise<void>((resolve, reject) => {
          turns.push({ input, finish: resolve, fail: reject });
        }),
    ),
    cancel: vi.fn(async (sessionId) => {
      turns.find((turn) => turn.input.sessionId === sessionId)?.finish();
    }),
    stop: vi.fn(async (sessionId) => {
      turns.find((turn) => turn.input.sessionId === sessionId)?.finish();
    }),
    bind: vi.fn(),
    approve: vi.fn(),
    answer: vi.fn(),
  };
  const engine = new HostEngine(store, { claude: provider });
  const clock = { now: new Date("2026-10-05T08:00:00").getTime() };
  const tasks = new HostTasks(store, engine, () => clock.now, verifyTimeoutMs);
  cleanups.push(async () => {
    for (const turn of turns) turn.finish();
    await tasks.idle();
    await engine.close();
    store.close();
    rmSync(directory, { recursive: true, force: true, maxRetries: 5 });
  });
  const input = (overrides: Record<string, unknown> = {}) => ({
    id: "main",
    title: "Ship the report",
    prompt: "Write the weekly report",
    projectId: project.id,
    harness: "claude",
    model: "claude:test",
    modelSettings: {},
    runtimeMode: "auto",
    maxRunMinutes: 0,
    // The reviewer has tests of its own.
    review: false,
    ...overrides,
  });
  const task = (id = "main") => tasks.list().find((entry) => entry.id === id)!;
  const settled = (sessionId: string) =>
    vi.waitFor(() => expect(store.session(sessionId).status).toBe("idle"));
  const interrupt = async (
    sessionId: string,
    note = "Host restarted. This turn was interrupted; inspect its work before continuing.",
  ) => {
    turns.findLast((turn) => turn.input.sessionId === sessionId)!.finish();
    await settled(sessionId);
    const session = store.session(sessionId);
    store.save(
      {
        ...session,
        revision: session.revision + 1,
        status: "interrupted",
        session: {
          ...session.session,
          blocks: [
            ...session.session.blocks,
            { id: "host-interruption", role: "system", text: note },
          ],
        },
      },
      { type: "interrupted" },
    );
  };
  /** Saves a task and starts it; later saves get a later creation time. */
  const run = async (overrides: Record<string, unknown> = {}) => {
    const saved = tasks.save(input(overrides));
    clock.now += 1;
    const started = turns.length + 1;
    await tasks.tick();
    // Creating a real Git worktree can outlast Vitest's 1s polling budget on Windows.
    await vi.waitFor(() => expect(turns).toHaveLength(started), {
      timeout: process.platform === "win32" ? 10_000 : 1_000,
    });
    return task(saved.id);
  };
  /** A minute later: settles what finished and lets its checks run. */
  const advance = async () => {
    clock.now += MINUTE;
    await tasks.tick();
    await tasks.idle();
  };
  /** Ends the latest turn cleanly, optionally with a reply, and settles it. */
  const finish = async (sessionId: string, reply?: string) => {
    const turn = turns.at(-1)!;
    if (reply !== undefined) {
      turn.input.onEvent({ type: "message.delta", text: reply });
      turn.input.onEvent({ type: "message.completed" });
    }
    turn.finish();
    await settled(sessionId);
    await advance();
  };
  /** Runs a task to a clean finish, leaving it in review. `files` is what
   * the agent leaves uncommitted in its working copy. */
  const review = async (
    overrides: Record<string, unknown> = {},
    files: Record<string, string> = {},
  ) => {
    const started = await run(overrides);
    for (const [name, text] of Object.entries(files))
      writeFileSync(join(turns.at(-1)!.input.cwd, name), text);
    await finish(started.sessionId!);
    return task(started.id);
  };
  /** Runs a task to its reviewer, which is the latest turn afterwards. */
  const reviewing = async (overrides: Record<string, unknown> = {}) => {
    const started = await run({ review: true, ...overrides });
    await finish(started.sessionId!);
    await vi.waitFor(() =>
      expect(turns.at(-1)!.input.text).toContain("VERDICT: PASS"),
    );
    return task(started.id);
  };
  return {
    store,
    engine,
    provider,
    turns,
    clock,
    tasks,
    input,
    task,
    settled,
    interrupt,
    run,
    review,
    reviewing,
    advance,
    finish,
    addProject,
    addRepo,
  };
}

describe("host tasks", () => {
  it("queues a saved task and lists tasks oldest first", () => {
    const { tasks, input, clock } = setup();
    const first = tasks.save(input());
    expect(first).toMatchObject({ status: "queued", createdAt: clock.now });
    clock.now += 1;
    const second = tasks.save(input({ id: "second" }));
    expect(tasks.list()).toEqual([first, second]);
  });

  it("rejects a task for an unknown project", () => {
    const { tasks, input } = setup();
    expect(() => tasks.save(input({ projectId: "missing" }))).toThrow(
      "Project is not registered on this machine",
    );
  });

  it("starts a queued task in a session named after it and lands in review", async () => {
    const { tasks, run, task, store, turns, settled, clock } = setup();
    const started = await run();
    expect(started).toMatchObject({ status: "running", startedAt: clock.now });
    expect(store.session(started.sessionId!).session.title).toBe(
      "Ship the report",
    );
    expect(turns[0].input.text).toBe("Write the weekly report");

    turns[0].finish();
    await settled(started.sessionId!);
    clock.now += MINUTE;
    await tasks.tick();
    await tasks.idle();
    expect(task()).toMatchObject({
      status: "review",
      completedAt: clock.now,
      sessionId: started.sessionId,
      verification: {},
    });
    expect(task().error).toBeUndefined();
  });

  it("blocks a task whose turn failed, with the agent error", async () => {
    const { tasks, run, task, turns, settled, clock } = setup();
    const started = await run();
    turns[0].fail(new Error("Not signed in"));
    await settled(started.sessionId!);
    clock.now += MINUTE;
    await tasks.tick();
    expect(task()).toMatchObject({ status: "blocked", error: "Not signed in" });
  });

  it("stops a task that passes its time limit and blocks it", async () => {
    const { tasks, run, task, provider, settled, clock } = setup();
    const started = await run({ maxRunMinutes: 30 });

    clock.now += 29 * MINUTE;
    await tasks.tick();
    expect(provider.cancel).not.toHaveBeenCalled();

    clock.now += MINUTE;
    await tasks.tick();
    expect(provider.cancel).toHaveBeenCalledTimes(1);
    await settled(started.sessionId!);
    clock.now += MINUTE;
    await tasks.tick();
    expect(task()).toMatchObject({
      status: "blocked",
      error: "Stopped: reached the 30-minute time limit.",
    });
  });

  it(
    "resumes an interrupted task in its retained session and worktree before releasing dependencies",
    async () => {
      const {
        tasks,
        run,
        task,
        clock,
        interrupt,
        turns,
        input,
        addRepo,
        finish,
      } = setup();
      const repo = addRepo("recover");
      const started = await run({ projectId: repo.id });
      writeFileSync(
        join(started.worktreeCwd!, "progress.txt"),
        "keep this work",
      );
      tasks.save(
        input({ id: "dependent", projectId: repo.id, dependsOn: [started.id] }),
      );
      await interrupt(started.sessionId!);
      clock.now += MINUTE;
      await tasks.tick();
      expect(task()).toMatchObject({
        status: "running",
        sessionId: started.sessionId,
        branch: started.branch,
        worktreeCwd: started.worktreeCwd,
      });
      expect(task().runId).not.toBe(started.runId);
      expect(task().error).toBeUndefined();
      expect(turns).toHaveLength(2);
      expect(turns.at(-1)!.input.text).toContain("do not start over");
      expect(
        readFileSync(join(started.worktreeCwd!, "progress.txt"), "utf8"),
      ).toBe("keep this work");
      expect(task("dependent").status).toBe("queued");
      await finish(started.sessionId!);
      await tasks.move(started.id, "done");
      await tasks.tick();
      expect(task("dependent").status).toBe("running");
    },
    SHELL_TEST_MS,
  );

  it("recovers legacy host-stopped blocked tasks but keeps failures blocked", async () => {
    const { tasks, run, task, clock, interrupt, store } = setup();
    const started = await run();
    await interrupt(started.sessionId!);
    store.db.prepare("UPDATE tasks SET value=? WHERE id=?").run(
      JSON.stringify({
        ...task(),
        status: "blocked",
        error: "The host stopped during this run.",
        completedAt: clock.now,
      }),
      started.id,
    );
    await tasks.tick();
    expect(task()).toMatchObject({
      status: "running",
      sessionId: started.sessionId,
    });
    expect(task().completedAt).toBeUndefined();
    await interrupt(started.sessionId!, "Could not persist this turn safely.");
    clock.now += MINUTE;
    await tasks.tick();
    expect(task().status).toBe("blocked");
    await tasks.tick();
    expect(task().status).toBe("blocked");
  });

  it("keeps recovered work queued when the daily agent limit is reached", async () => {
    const { tasks, run, task, clock, interrupt, turns } = setup();
    tasks.limits.save({ dailyAgentMinutes: 1 });
    const started = await run();
    await interrupt(started.sessionId!);
    clock.now += 2 * MINUTE;
    await tasks.tick();
    expect(task().status).toBe("queued");
    expect(turns).toHaveLength(1);
    tasks.limits.save({ dailyAgentMinutes: 0 });
    await tasks.tick();
    expect(task()).toMatchObject({
      status: "running",
      sessionId: started.sessionId,
    });
  });

  it("restarts interrupted verification without recording a failed review", async () => {
    const { tasks, reviewing, task, interrupt, turns } = setup();
    const started = await reviewing();
    await interrupt(started.reviewer!.sessionId!);
    await tasks.tick();
    await vi.waitFor(() => expect(turns).toHaveLength(3));
    expect(task().status).toBe("verifying");
    expect(task().verification?.review).toBeUndefined();
  });

  it("blocks a task whose turn was stopped from a desktop", async () => {
    const { tasks, run, task, engine, settled, clock } = setup();
    const started = await run();
    engine.command({
      type: "cancel",
      commandId: "cancel-from-desktop",
      sessionId: started.sessionId!,
      runId: started.runId!,
    });
    await settled(started.sessionId!);
    clock.now += MINUTE;
    await tasks.tick();
    expect(task()).toMatchObject({
      status: "blocked",
      error: "Stopped by you.",
    });
  });

  it("runs one task per project folder at a time", async () => {
    const { tasks, input, run, task, turns, finish } = setup();
    const first = await run();
    tasks.save(input({ id: "second" }));
    await tasks.tick();
    expect(task("second").status).toBe("queued");
    expect(turns).toHaveLength(1);

    // The folder stays taken while the first task is verified.
    await finish(first.sessionId!);
    expect(task().status).toBe("review");
    expect(task("second").status).toBe("queued");
    await tasks.tick();
    expect(task("second").status).toBe("running");
  });

  it("runs at most two tasks at once, oldest first", async () => {
    const { tasks, input, task, turns, settled, clock, addProject, advance } =
      setup();
    expect(MAX_RUNNING_TASKS).toBe(2);
    for (const id of ["a", "b", "c"]) {
      tasks.save(input({ id, projectId: addProject(id).id }));
      clock.now += 1;
    }
    await tasks.tick();
    await vi.waitFor(() => expect(turns).toHaveLength(2));
    expect(["a", "b", "c"].map((id) => task(id).status)).toEqual([
      "running",
      "running",
      "queued",
    ]);

    turns[0].finish();
    await settled(task("a").sessionId!);
    // A task being verified still counts.
    await advance();
    expect(task("c").status).toBe("queued");
    await tasks.tick();
    expect(["a", "b", "c"].map((id) => task(id).status)).toEqual([
      "review",
      "running",
      "running",
    ]);
  });

  it("mirrors whether the running session is waiting on the user", async () => {
    const { tasks, run, task, store, clock } = setup();
    const started = await run();
    expect(task().needsInput).toBeUndefined();
    const ask = async (pendingQuestion?: {
      requestId: number;
      questions: [];
    }) => {
      const session = store.session(started.sessionId!);
      store.save(
        {
          ...session,
          revision: session.revision + 1,
          session: { ...session.session, pendingQuestion },
        },
        { type: "question" },
      );
      clock.now += MINUTE;
      await tasks.tick();
    };
    await ask({ requestId: 1, questions: [] });
    expect(task()).toMatchObject({ status: "running", needsInput: true });
    await ask(undefined);
    expect(task().status).toBe("running");
    expect(task().needsInput).toBeUndefined();
  });

  it("approves a reviewed task, and runs a reviewed or done one again", async () => {
    const { tasks, review, task, turns } = setup();
    const reviewed = await review();
    expect((await tasks.move("main", "done")).status).toBe("done");

    const again = await tasks.move("main", "queued");
    expect(again.status).toBe("queued");
    expect(again.sessionId).toBeUndefined();
    expect(again.completedAt).toBeUndefined();
    expect(again.verification).toBeUndefined();
    await tasks.tick();
    await vi.waitFor(() => expect(turns).toHaveLength(2));
    expect(task().sessionId).not.toBe(reviewed.sessionId);
    turns[1].finish();
  });

  it("sends a reviewed task back to the queue", async () => {
    const { tasks, review } = setup();
    await review();
    expect((await tasks.move("main", "queued")).status).toBe("queued");
  });

  it("stops a running task and retries a blocked one in a fresh session", async () => {
    const { tasks, run, task, provider, turns, settled } = setup();
    const started = await run();
    expect(await tasks.move("main", "blocked")).toMatchObject({
      status: "blocked",
      error: "Stopped by you.",
    });
    expect(provider.cancel).toHaveBeenCalledTimes(1);
    await settled(started.sessionId!);
    await tasks.tick();
    expect(task().status).toBe("blocked");

    const retried = await tasks.move("main", "queued");
    expect(retried.status).toBe("queued");
    expect(retried.error).toBeUndefined();
    await tasks.tick();
    await vi.waitFor(() => expect(turns).toHaveLength(2));
    expect(task()).toMatchObject({ status: "running" });
    expect(task().sessionId).not.toBe(started.sessionId);
  });

  it("refuses moves the board does not offer", async () => {
    const { tasks, input, run, review } = setup();
    tasks.save(input({ id: "waiting" }));
    for (const to of [
      "running",
      "verifying",
      "review",
      "done",
      "blocked",
      "queued",
    ])
      await expect(tasks.move("waiting", to)).rejects.toThrow(
        `A queued task cannot be moved to ${to}.`,
      );
    await tasks.delete("waiting");

    await run();
    for (const to of ["queued", "verifying", "review", "done"])
      await expect(tasks.move("main", to)).rejects.toThrow(
        `A running task cannot be moved to ${to}.`,
      );
    await tasks.move("main", "blocked");
    for (const to of ["running", "verifying", "review", "done"])
      await expect(tasks.move("main", to)).rejects.toThrow(
        `A blocked task cannot be moved to ${to}.`,
      );
    await tasks.delete("main");

    await review({ id: "reviewed" });
    for (const to of ["running", "verifying", "blocked"])
      await expect(tasks.move("reviewed", to)).rejects.toThrow(
        `A review task cannot be moved to ${to}.`,
      );
    await tasks.move("reviewed", "done");
    for (const to of ["running", "verifying", "review", "blocked"])
      await expect(tasks.move("reviewed", to)).rejects.toThrow(
        `A done task cannot be moved to ${to}.`,
      );

    await expect(tasks.move("reviewed", "archived")).rejects.toThrow(
      "Invalid task status",
    );
    await expect(tasks.move("missing", "done")).rejects.toThrow(
      "Task not found.",
    );
  });

  it("edits a queued or blocked task but not a running or finished one", async () => {
    const { tasks, input, run, review, task, addProject } = setup();
    tasks.save(input({ verifyCommand: "npm test" }));
    const other = addProject("other");
    const edited = tasks.save(
      input({ title: "Renamed", maxRunMinutes: 15, projectId: other.id }),
    );
    expect(edited).toMatchObject({
      status: "queued",
      title: "Renamed",
      maxRunMinutes: 15,
    });
    // A check command left empty is removed.
    expect(edited.verifyCommand).toBeUndefined();
    // A task stays in the project it was created for.
    expect(edited.projectId).toBe(input().projectId);

    await run({ title: "Renamed" });
    expect(() => tasks.save(input({ title: "Again" }))).toThrow(
      "Stop this task before editing it.",
    );
    expect(task().title).toBe("Renamed");

    await tasks.move("main", "blocked");
    expect(tasks.save(input({ prompt: "Try again" }))).toMatchObject({
      status: "blocked",
      prompt: "Try again",
      error: "Stopped by you.",
    });
    await tasks.delete("main");

    await review({ id: "reviewed" });
    expect(() => tasks.save(input({ id: "reviewed" }))).toThrow(
      "Only a to-do, queued or blocked task can be edited.",
    );
  });

  it("keeps a to-do item off the queue: tick never starts it and it takes no slot", async () => {
    const { tasks, input, clock, turns, task, addProject } = setup();
    const added = tasks.save(input({ id: "idea", status: "todo" }));
    expect(added).toMatchObject({ status: "todo", createdAt: clock.now });
    // Two tasks running would fill the board; the to-do item is not counted.
    tasks.save(input({ id: "a" }));
    // Tasks sharing a project folder run one at a time.
    tasks.save(input({ id: "b", projectId: addProject("second").id }));
    clock.now += 1;
    await tasks.tick();
    await vi.waitFor(() => expect(turns).toHaveLength(MAX_RUNNING_TASKS));
    clock.now += MINUTE;
    await tasks.tick();
    expect(task("idea")).toMatchObject({ status: "todo" });
    expect(task("idea").sessionId).toBeUndefined();
    expect(turns).toHaveLength(MAX_RUNNING_TASKS);
  });

  it("adds a to-do item with no description, and queues by default", () => {
    const { tasks, input } = setup();
    expect(
      tasks.save(input({ id: "idea", status: "todo", prompt: "" })),
    ).toMatchObject({
      status: "todo",
      prompt: "",
    });
    expect(tasks.save(input({ id: "later", status: "queued" })).status).toBe(
      "queued",
    );
    expect(() => tasks.save(input({ id: "bad", status: "running" }))).toThrow(
      "A new task starts as to do or queued.",
    );
    expect(() => tasks.save(input({ id: "empty", prompt: "  " }))).toThrow(
      "Add a description before starting this task with an agent.",
    );
  });

  it("edits a to-do item and keeps it in to do", () => {
    const { tasks, input } = setup();
    tasks.save(input({ status: "todo", prompt: "" }));
    const edited = tasks.save(input({ title: "Renamed", prompt: "Details" }));
    expect(edited).toMatchObject({
      status: "todo",
      title: "Renamed",
      prompt: "Details",
    });
    // An edit may leave the description empty while it is only a to-do item.
    expect(tasks.save(input({ prompt: "" })).status).toBe("todo");
  });

  it("starts a to-do item like a newly queued task", async () => {
    const { tasks, input, task, turns } = setup();
    tasks.save(input({ status: "todo" }));
    const queued = await tasks.move("main", "queued");
    expect(queued.status).toBe("queued");
    await tasks.tick();
    await vi.waitFor(() => expect(turns).toHaveLength(1));
    expect(task().status).toBe("running");
    expect(turns[0].input.text).toBe("Write the weekly report");
  });

  it("refuses to start a task with an empty description", async () => {
    const { tasks, input } = setup();
    tasks.save(input({ status: "todo", prompt: " " }));
    await expect(tasks.move("main", "queued")).rejects.toThrow(
      "Add a description before starting this task with an agent.",
    );
    expect(tasks.list()[0].status).toBe("todo");
  });

  it("marks a to-do item done without running or merging anything", async () => {
    const { tasks, input, clock, turns } = setup();
    tasks.save(input({ status: "todo" }));
    clock.now += 5;
    expect(await tasks.move("main", "done")).toMatchObject({
      status: "done",
      completedAt: clock.now,
    });
    await tasks.tick();
    expect(turns).toHaveLength(0);
    const reopened = await tasks.move("main", "todo");
    expect(reopened.status).toBe("todo");
    expect(reopened.completedAt).toBeUndefined();
  });

  it("pulls a queued task back to to do, and reopens blocked and done ones", async () => {
    const { tasks, input, run, review, task } = setup();
    tasks.save(input({ id: "waiting" }));
    expect((await tasks.move("waiting", "todo")).status).toBe("todo");
    await tasks.delete("waiting");

    await run();
    await tasks.move("main", "blocked");
    const back = await tasks.move("main", "todo");
    expect(back.status).toBe("todo");
    expect(back.error).toBeUndefined();
    expect(back.sessionId).toBeUndefined();
    expect(back.startedAt).toBeUndefined();
    await tasks.delete("main", true);

    await review({ id: "reviewed" });
    await tasks.move("reviewed", "done");
    expect((await tasks.move("reviewed", "todo")).status).toBe("todo");
    expect(task("reviewed").sessionId).toBeUndefined();
  });

  it("refuses to-do moves the board does not offer", async () => {
    const { tasks, input, run, review } = setup();
    tasks.save(input({ id: "idea", status: "todo" }));
    for (const to of ["running", "verifying", "review", "blocked", "todo"])
      await expect(tasks.move("idea", to)).rejects.toThrow(
        `A todo task cannot be moved to ${to}.`,
      );
    await run({ id: "working" });
    await expect(tasks.move("working", "todo")).rejects.toThrow(
      "A running task cannot be moved to todo.",
    );
    await tasks.move("working", "blocked");
    await tasks.delete("working");
    await review({ id: "reviewed" });
    await expect(tasks.move("reviewed", "todo")).rejects.toThrow(
      "A review task cannot be moved to todo.",
    );
  });

  it("does not pull back a queued task that has unmerged work on a branch", async () => {
    const { tasks, addRepo, run, task, finish, turns } = setup();
    const repo = addRepo("repo");
    const started = await run({ projectId: repo.id, review: false });
    writeFileSync(join(turns.at(-1)!.input.cwd, "work.txt"), "work\n");
    await finish(started.sessionId!);
    // In review with its branch; run it again, then try to pull it back.
    await tasks.move("main", "queued");
    expect(task().branch).toBeTruthy();
    await expect(tasks.move("main", "todo")).rejects.toThrow(
      "This task already started, so it cannot go back to To do.",
    );
  });

  it("deletes any task that is not running", async () => {
    const { tasks, run } = setup();
    await run();
    await expect(tasks.delete("main")).rejects.toThrow(
      "Stop this task before deleting it.",
    );
    await tasks.move("main", "blocked");
    await tasks.delete("main");
    expect(tasks.list()).toEqual([]);
  });
});

describe("a task on its own branch", () => {
  it("runs in a new worktree and leaves the project checkout untouched", async () => {
    const { run, addRepo, turns, store } = setup();
    const repo = addRepo("repo");
    const head = git(repo.cwd, "rev-parse", "HEAD");
    const started = await run({ projectId: repo.id });
    expect(started).toMatchObject({
      status: "running",
      baseBranch: "main",
      baseCommit: head,
    });
    expect(started.branch).toMatch(/^mc\/[a-z0-9]{8}$/);
    expect(started.worktreeCwd).not.toBe(repo.cwd);
    expect(turns[0].input.cwd).toBe(started.worktreeCwd);
    // The agent is told to stay out of the project folder.
    const prompt = turns[0].input.text;
    expect(prompt).toContain(`You are working in ${started.worktreeCwd}`);
    expect(prompt).toContain(
      `Do not edit, commit in or switch branches in ${repo.cwd}`,
    );
    expect(prompt).toContain(`on the branch ${started.branch}`);
    expect(prompt.endsWith(started.prompt)).toBe(true);
    expect(store.session(started.sessionId!).session.cwd).toBe(
      started.worktreeCwd,
    );
    expect(git(started.worktreeCwd!, "symbolic-ref", "--short", "HEAD")).toBe(
      started.branch,
    );
    expect(git(repo.cwd, "symbolic-ref", "--short", "HEAD")).toBe("main");
    expect(git(repo.cwd, "rev-parse", "HEAD")).toBe(head);
    expect(git(repo.cwd, "status", "--porcelain")).toBe("");
  });

  it("commits what the agent left uncommitted on the task branch", async () => {
    const { review, addRepo } = setup();
    const repo = addRepo("repo");
    const head = git(repo.cwd, "rev-parse", "HEAD");
    const reviewed = await review(
      { projectId: repo.id },
      { "report.md": "# Report\n", "file.txt": "changed\n" },
    );
    expect(reviewed.status).toBe("review");
    expect(git(reviewed.worktreeCwd!, "status", "--porcelain")).toBe("");
    expect(git(repo.cwd, "log", "-1", "--format=%s", reviewed.branch!)).toBe(
      "Ship the report",
    );
    expect(reviewed.diffStat).toContain("report.md");
    expect(reviewed.diffStat).toContain("2 files changed");
    // Nothing reached the project.
    expect(git(repo.cwd, "rev-parse", "HEAD")).toBe(head);
    expect(git(repo.cwd, "status", "--porcelain")).toBe("");
    expect(existsSync(join(repo.cwd, "report.md"))).toBe(false);
    expect(readFileSync(join(repo.cwd, "file.txt"), "utf8")).toBe("initial\n");
  });

  it("runs several tasks of one project at once, each on its branch", async () => {
    const { tasks, input, task, turns, addRepo, clock } = setup();
    const repo = addRepo("repo");
    for (const id of ["a", "b"]) {
      tasks.save(input({ id, projectId: repo.id }));
      clock.now += 1;
    }
    await tasks.tick();
    await vi.waitFor(() => expect(turns).toHaveLength(2));
    expect(task("a").status).toBe("running");
    expect(task("b").status).toBe("running");
    expect(task("a").branch).not.toBe(task("b").branch);
  });

  it("runs in the project folder when not isolated or not a git project", async () => {
    const { run, review, addRepo, turns } = setup();
    const repo = addRepo("repo");
    const inPlace = await review(
      { projectId: repo.id, isolate: false },
      { "report.md": "# Report\n" },
    );
    expect(turns[0].input.cwd).toBe(repo.cwd);
    expect(inPlace.status).toBe("review");
    expect(inPlace.branch).toBeUndefined();
    expect(inPlace.diffStat).toBeUndefined();
    // The host never commits in the project checkout.
    expect(git(repo.cwd, "status", "--porcelain")).toBe("?? report.md");

    const plain = await run({ id: "plain", isolate: true });
    expect(plain.status).toBe("running");
    expect(plain.branch).toBeUndefined();
    expect(plain.worktreeCwd).toBeUndefined();
  });

  it("blocks a task when the project is not on a branch", async () => {
    const { tasks, input, task, addRepo, turns } = setup();
    const repo = addRepo("repo");
    git(repo.cwd, "checkout", "-q", "--detach");
    tasks.save(input({ projectId: repo.id }));
    await tasks.tick();
    expect(task().status).toBe("blocked");
    expect(task().error).toContain("not on a branch");
    expect(turns).toHaveLength(0);
  });

  it("merges an approved task into its base branch and cleans up", async () => {
    const { tasks, review, addRepo } = setup();
    const repo = addRepo("repo");
    const reviewed = await review(
      { projectId: repo.id },
      { "report.md": "# Report\n" },
    );
    const done = await tasks.move("main", "done");
    expect(done).toMatchObject({
      status: "done",
      merged: true,
      branch: reviewed.branch,
    });
    expect(done.worktreeCwd).toBeUndefined();
    expect(readFileSync(join(repo.cwd, "report.md"), "utf8")).toBe(
      "# Report\n",
    );
    expect(git(repo.cwd, "symbolic-ref", "--short", "HEAD")).toBe("main");
    // A merge commit, not a fast-forward.
    expect(
      git(repo.cwd, "rev-list", "--parents", "-1", "HEAD").split(" "),
    ).toHaveLength(3);
    expect(git(repo.cwd, "branch", "--list", "mc/*")).toBe("");
    expect(existsSync(reviewed.worktreeCwd!)).toBe(false);

    // A merged task is deleted without discarding anything, and runs again on
    // a new branch.
    const again = await tasks.move("main", "queued");
    expect(again.branch).toBeUndefined();
    expect(again.merged).toBeUndefined();
    await tasks.delete("main");
    expect(tasks.list()).toEqual([]);
  });

  it("keeps a task in review when the project is dirty or on another branch", async () => {
    const { tasks, review, task, addRepo } = setup();
    const repo = addRepo("repo");
    const reviewed = await review(
      { projectId: repo.id },
      { "report.md": "# Report\n" },
    );
    const head = git(repo.cwd, "rev-parse", "HEAD");

    writeFileSync(join(repo.cwd, "file.txt"), "edited by the owner\n");
    await expect(tasks.move("main", "done")).rejects.toThrow(
      "The project has uncommitted changes.",
    );
    expect(task().status).toBe("review");
    expect(task().mergeError).toContain("uncommitted changes");
    expect(readFileSync(join(repo.cwd, "file.txt"), "utf8")).toBe(
      "edited by the owner\n",
    );
    git(repo.cwd, "checkout", "-q", "--", "file.txt");

    git(repo.cwd, "checkout", "-q", "-b", "other");
    await expect(tasks.move("main", "done")).rejects.toThrow(
      "The project is on other. Check out main there, then merge again.",
    );
    expect(task().status).toBe("review");
    expect(git(repo.cwd, "rev-parse", "HEAD")).toBe(head);
    expect(
      git(repo.cwd, "rev-parse", "--verify", reviewed.branch!),
    ).toBeTruthy();
    expect(existsSync(reviewed.worktreeCwd!)).toBe(true);

    git(repo.cwd, "checkout", "-q", "main");
    const done = await tasks.move("main", "done");
    expect(done.status).toBe("done");
    expect(done.mergeError).toBeUndefined();
    expect(existsSync(join(repo.cwd, "report.md"))).toBe(true);
  });

  it("aborts a conflicting merge and keeps the task in review", async () => {
    const { tasks, review, task, addRepo } = setup();
    const repo = addRepo("repo");
    const reviewed = await review(
      { projectId: repo.id },
      { "file.txt": "from the agent\n" },
    );
    writeFileSync(join(repo.cwd, "file.txt"), "from the owner\n");
    git(repo.cwd, "commit", "-q", "-am", "owner");
    const head = git(repo.cwd, "rev-parse", "HEAD");

    await expect(tasks.move("main", "done")).rejects.toThrow(
      `${reviewed.branch} conflicts with main in file.txt. Nothing was merged.`,
    );
    expect(task().status).toBe("review");
    expect(task().mergeError).toContain("conflicts with main");
    expect(git(repo.cwd, "rev-parse", "HEAD")).toBe(head);
    expect(git(repo.cwd, "status", "--porcelain")).toBe("");
    expect(readFileSync(join(repo.cwd, "file.txt"), "utf8")).toBe(
      "from the owner\n",
    );
    expect(git(repo.cwd, "log", "-1", "--format=%s", reviewed.branch!)).toBe(
      "Ship the report",
    );
    expect(existsSync(reviewed.worktreeCwd!)).toBe(true);
  });

  it("deletes an unmerged task only when told to discard its branch", async () => {
    const { tasks, review, addRepo } = setup();
    const repo = addRepo("repo");
    const reviewed = await review(
      { projectId: repo.id },
      { "report.md": "# Report\n" },
    );
    await expect(tasks.delete("main")).rejects.toThrow(
      `This task’s work is on ${reviewed.branch} and was never merged.`,
    );
    expect(tasks.list()).toHaveLength(1);
    expect(git(repo.cwd, "branch", "--list", "mc/*")).toContain(
      reviewed.branch,
    );
    expect(existsSync(reviewed.worktreeCwd!)).toBe(true);

    await tasks.delete("main", true);
    expect(tasks.list()).toEqual([]);
    expect(git(repo.cwd, "branch", "--list", "mc/*")).toBe("");
    expect(existsSync(reviewed.worktreeCwd!)).toBe(false);
    expect(existsSync(join(repo.cwd, "report.md"))).toBe(false);
  });

  it("retries on the same branch, keeping the earlier work", async () => {
    const { tasks, review, task, turns, addRepo, finish } = setup();
    const repo = addRepo("repo");
    const reviewed = await review(
      { projectId: repo.id },
      { "report.md": "# Report\n" },
    );
    const queued = await tasks.move("main", "queued");
    expect(queued).toMatchObject({
      status: "queued",
      branch: reviewed.branch,
      worktreeCwd: reviewed.worktreeCwd,
      baseCommit: reviewed.baseCommit,
    });
    expect(queued.diffStat).toBeUndefined();

    await tasks.tick();
    await vi.waitFor(() => expect(turns).toHaveLength(2));
    expect(task()).toMatchObject({
      status: "running",
      branch: reviewed.branch,
    });
    expect(task().sessionId).not.toBe(reviewed.sessionId);
    expect(turns[1].input.cwd).toBe(reviewed.worktreeCwd);
    expect(existsSync(join(reviewed.worktreeCwd!, "report.md"))).toBe(true);

    writeFileSync(join(reviewed.worktreeCwd!, "notes.md"), "More\n");
    await finish(task().sessionId!);
    expect(task().status).toBe("review");
    expect(task().diffStat).toContain("report.md");
    expect(task().diffStat).toContain("notes.md");
    expect(git(repo.cwd, "branch", "--list", "mc/*").split("\n")).toHaveLength(
      1,
    );
  });
});

describe("task verification", () => {
  it(
    "moves to review when the check command passes, running it once",
    async () => {
      const { tasks, run, task, turns, settled, clock, store } = setup();
      const started = await run({
        verifyCommand:
          "node -e \"require('fs').appendFileSync('runs.txt', 'x')\"",
      });
      turns[0].finish();
      await settled(started.sessionId!);
      clock.now += MINUTE;
      await tasks.tick();
      // A tick during the check does not start it again.
      await tasks.tick();
      expect(task().status).toBe("verifying");
      await tasks.idle();
      await tasks.tick();
      await tasks.idle();
      expect(task()).toMatchObject({
        status: "review",
        verification: { command: { exitCode: 0, timedOut: false } },
      });
      expect(
        readFileSync(
          join(store.project(started.projectId).cwd, "runs.txt"),
          "utf8",
        ),
      ).toBe("x");
    },
    SHELL_TEST_MS,
  );

  it(
    "blocks a task whose check command fails, keeping its output",
    async () => {
      const { review, addRepo } = setup();
      const repo = addRepo("repo");
      const blocked = await review(
        {
          projectId: repo.id,
          verifyCommand: "node -e \"console.log('boom'); process.exit(3)\"",
        },
        { "report.md": "# Report\n" },
      );
      expect(blocked.status).toBe("blocked");
      expect(blocked.error).toMatch(
        /^The check command failed \(exit code \d+\)\.$/,
      );
      expect(blocked.verification!.command).toMatchObject({ timedOut: false });
      expect(blocked.verification!.command!.exitCode).not.toBe(0);
      expect(blocked.verification!.command!.output).toContain("boom");
      // The work is still on its branch.
      expect(git(repo.cwd, "log", "-1", "--format=%s", blocked.branch!)).toBe(
        "Ship the report",
      );
      expect(existsSync(blocked.worktreeCwd!)).toBe(true);
    },
    SHELL_TEST_MS,
  );

  it(
    "blocks a task whose check command runs past its time limit",
    async () => {
      const { review } = setup(1500);
      const blocked = await review({
        verifyCommand: 'node -e "setTimeout(() => {}, 60000)"',
      });
      expect(blocked).toMatchObject({
        status: "blocked",
        error: "The check command timed out.",
        verification: { command: { exitCode: null, timedOut: true } },
      });
    },
    SHELL_TEST_MS,
  );

  it("moves to review when the reviewer passes the work", async () => {
    const { reviewing, task, turns, store, finish, addRepo } = setup();
    const repo = addRepo("repo");
    const verifying = await reviewing({ projectId: repo.id });
    expect(verifying.status).toBe("verifying");
    const reviewer = verifying.reviewer!.sessionId!;
    expect(reviewer).not.toBe(verifying.sessionId);
    expect(store.session(reviewer).session).toMatchObject({
      title: "Review: Ship the report",
      cwd: verifying.worktreeCwd,
      model: "claude:test",
    });
    const prompt = turns[1].input.text;
    expect(prompt).toContain("Task: Ship the report");
    expect(prompt).toContain("Write the weekly report");
    expect(prompt).toContain(`git diff ${verifying.baseCommit}`);

    await finish(reviewer, "The report covers the week.\n\nVERDICT: PASS");
    expect(task()).toMatchObject({
      status: "review",
      verification: {
        review: { verdict: "pass", note: "", sessionId: reviewer },
      },
    });
    expect(task().reviewer).toBeUndefined();
  });

  it("blocks a task the reviewer fails, with its reason", async () => {
    const { reviewing, task, turns, finish } = setup();
    const verifying = await reviewing();
    // Not on a branch: the reviewer looks at the uncommitted changes.
    expect(turns[1].input.text).toContain("the uncommitted changes");
    await finish(
      verifying.reviewer!.sessionId!,
      "Looked at it.\nVERDICT: FAIL - The report skips Friday.",
    );
    expect(task()).toMatchObject({
      status: "blocked",
      error: "Review failed: The report skips Friday.",
      verification: {
        review: { verdict: "fail", note: "The report skips Friday." },
      },
    });
  });

  it("repairs goal work on its existing branch, keeps dependents waiting, then delivers", async () => {
    const { tasks, input, reviewing, task, turns, finish, addRepo } = setup();
    const repo = addRepo("repair");
    const original = await reviewing({
      projectId: repo.id,
      goalId: "goal",
      autoMerge: true,
    });
    tasks.save(
      input({ id: "dependent", projectId: repo.id, dependsOn: ["main"] }),
    );
    await finish(
      original.reviewer!.sessionId!,
      "file.txt:1 needs Friday.\nVERDICT: FAIL - Friday is missing.",
    );
    expect(task()).toMatchObject({
      status: "running",
      repairAttempts: 1,
      branch: original.branch,
      worktreeCwd: original.worktreeCwd,
    });
    expect(task("dependent").status).toBe("queued");
    expect(turns.at(-1)!.input.text).toContain("file.txt:1 needs Friday.");
    expect(task().sessionId).not.toBe(original.sessionId);
    writeFileSync(join(original.worktreeCwd!, "file.txt"), "Friday\n");
    await finish(task().sessionId!);
    await finish(task().reviewer!.sessionId!, "VERDICT: PASS");
    expect(task()).toMatchObject({ status: "done", autoMerged: true });
    expect(task("dependent").status).toBe("running");
  });

  it("bounds automatic corrections across host scheduler recreation and resets on manual retry", async () => {
    const { tasks, store, engine, clock, reviewing, task, finish } = setup();
    await reviewing({ goalId: "goal" });
    for (let attempt = 1; attempt <= MAX_REPAIR_ATTEMPTS; attempt++) {
      await finish(
        task().reviewer!.sessionId!,
        "VERDICT: FAIL - Friday is missing.",
      );
      expect(task()).toMatchObject({
        status: "running",
        repairAttempts: attempt,
      });
      expect(
        new HostTasks(store, engine, () => clock.now).get("main")!
          .repairAttempts,
      ).toBe(attempt);
      await finish(task().sessionId!);
    }
    await finish(
      task().reviewer!.sessionId!,
      "VERDICT: FAIL - Friday is still missing.",
    );
    expect(task()).toMatchObject({
      status: "blocked",
      repairAttempts: MAX_REPAIR_ATTEMPTS,
    });
    await tasks.tick();
    expect(task().status).toBe("blocked");
    await tasks.move("main", "queued");
    expect(task().repairAttempts).toBeUndefined();
    expect(task().retryFeedback).toContain("Friday is still missing.");
  });

  it.each(["missing verdict", "runtime failure", "owner stop"])(
    "does not auto-repair a goal review with %s",
    async (failure) => {
      const { tasks, reviewing, task, turns, finish, settled, advance } =
        setup();
      const original = await reviewing({ goalId: "goal" });
      if (failure === "owner stop") {
        await tasks.move("main", "blocked");
        await settled(original.reviewer!.sessionId!);
        await advance();
      } else if (failure === "runtime failure") {
        turns.at(-1)!.fail(new Error("Not signed in"));
        await settled(original.reviewer!.sessionId!);
        await advance();
      } else await finish(original.reviewer!.sessionId!, "Could not review.");
      expect(task().status).toBe("blocked");
      expect(task().repairAttempts).toBeUndefined();
    },
  );

  it("recovers a legacy goal review failure once and refuses a stopped task", async () => {
    const { tasks, store, reviewing, task, finish } = setup();
    const original = await reviewing();
    await finish(
      original.reviewer!.sessionId!,
      "VERDICT: FAIL - Friday is missing.",
    );
    const legacy = { ...task(), goalId: "goal" };
    store.db
      .prepare("UPDATE tasks SET value=? WHERE id=?")
      .run(JSON.stringify(legacy), "main");
    expect(tasks.recoverGoalReview("main", "other")!.status).toBe("blocked");
    expect(tasks.recoverGoalReview("main", "goal")).toMatchObject({
      status: "queued",
      repairAttempts: 1,
    });
    expect(tasks.recoverGoalReview("main", "goal")!.repairAttempts).toBe(1);
    store.db
      .prepare("UPDATE tasks SET value=? WHERE id=?")
      .run(JSON.stringify({ ...legacy, error: "Stopped by you." }), "main");
    expect(tasks.recoverGoalReview("main", "goal")!.status).toBe("blocked");
  });

  it("persists review notes across retries, read updates and successful verification", async () => {
    const { tasks, store, engine, clock, reviewing, task, turns, finish } =
      setup();
    await reviewing();
    const firstReviewer = task().reviewer!.sessionId!;
    const finding =
      '```json\n{"reviewNotes":[{"finding":"Friday is missing.","suggestion":"Include the Friday totals."}]}\n```';
    // Some providers emit the findings and verdict as separate assistant messages.
    turns.at(-1)!.input.onEvent({ type: "message.delta", text: finding });
    turns.at(-1)!.input.onEvent({ type: "message.completed" });
    await finish(firstReviewer, "VERDICT: FAIL - Friday is missing.");
    expect(task().reviewNotes).toHaveLength(1);
    const id = task().reviewNotes![0].id;
    expect(task().reviewNotes![0]).toMatchObject({
      suggestion: "Include the Friday totals.",
      sessionId: firstReviewer,
    });
    tasks.readNotes("main", [id]);
    const recreated = new HostTasks(store, engine, () => clock.now);
    expect(recreated.get("main")!.reviewNotes![0].readAt).toBe(clock.now);
    expect(() => tasks.readNotes("main", ["unknown"])).toThrow(
      "Review note not found",
    );
    expect(() => tasks.resolveNote("main", id, "yes")).toThrow(
      "Invalid review note status",
    );
    tasks.resolveNote("main", id, true);
    expect(task().status).toBe("blocked");
    tasks.resolveNote("main", id, false);
    await tasks.move("main", "queued");
    await tasks.tick();
    expect(turns.at(-1)!.input.text).toContain(
      "Open review notes for this task",
    );
    expect(turns.at(-1)!.input.text).toContain("Include the Friday totals.");
    await finish(task().sessionId!);
    await finish(
      task().reviewer!.sessionId!,
      `${finding}\nVERDICT: FAIL - Friday is missing.`,
    );
    expect(task().reviewNotes).toHaveLength(1);
    expect(task().reviewNotes![0]).toMatchObject({ id, occurrences: 2 });
    expect(task().reviewNotes![0].sessionIds).toHaveLength(2);
    await tasks.move("main", "queued");
    await tasks.tick();
    await finish(task().sessionId!);
    await finish(
      task().reviewer!.sessionId!,
      '```json\n{"reviewNotes":[{"finding":"Consider a shortcut.","kind":"suggestion"}]}\n```\nVERDICT: PASS',
    );
    expect(task().status).toBe("review");
    expect(task().reviewNotes).toHaveLength(2);
    expect(task().reviewNotes![0].resolvedAt).toBe(clock.now);
    expect(task().reviewNotes![1].resolvedAt).toBeUndefined();
    // A read action based on an older snapshot must not acknowledge new notes.
    tasks.readNotes("main", [id]);
    expect(task().reviewNotes![1].readAt).toBeUndefined();
  });

  it("backfills available legacy review findings once without changing task status", async () => {
    const { tasks, store, reviewing, task, finish } = setup();
    const original = await reviewing();
    await finish(
      original.reviewer!.sessionId!,
      "file.ts:42 skips Friday.\nVERDICT: FAIL - Friday is missing.",
    );
    const { reviewNotes, ...legacy } = task();
    store.db
      .prepare("UPDATE tasks SET value=? WHERE id=?")
      .run(JSON.stringify(legacy), "main");
    const migrated = tasks.list()[0];
    expect(migrated.status).toBe("blocked");
    expect(migrated.reviewNotes![0]).toMatchObject({
      finding: "Friday is missing.",
      details: "file.ts:42 skips Friday.",
    });
    expect(tasks.list()[0].reviewNotes).toEqual(migrated.reviewNotes);
    expect(tasks.get("main")!.updatedAt).toBe(legacy.updatedAt);
  });

  it(
    "automatically corrects a goal check failure with the command output",
    async () => {
      const { run, task, turns, finish } = setup();
      const original = await run({
        goalId: "goal",
        review: false,
        verifyCommand: 'node -e "console.log(123456); process.exit(1)"',
      });
      await finish(original.sessionId!);
      expect(task()).toMatchObject({ status: "queued", repairAttempts: 1 });
      // Verification runs asynchronously; the next scheduler tick starts the correction.
      expect(task().retryFeedback).toContain("123456");
      expect(task().retryFeedback).toContain("Check command:");
      expect(turns).toHaveLength(1);
    },
    SHELL_TEST_MS,
  );

  it("reads a verdict followed by another short message", async () => {
    const { reviewing, task, turns, settled, advance } = setup();
    const verifying = await reviewing();
    const turn = turns.at(-1)!;
    turn.input.onEvent({
      type: "message.delta",
      text: "Looked at it.\nVERDICT: FAIL - The report skips Friday.",
    });
    turn.input.onEvent({ type: "message.completed" });
    turn.input.onEvent({ type: "message.delta", text: "Done." });
    turn.input.onEvent({ type: "message.completed" });
    turn.finish();
    await settled(verifying.reviewer!.sessionId!);
    await advance();
    expect(task()).toMatchObject({
      status: "blocked",
      error: "Review failed: The report skips Friday.",
    });
  });

  it.each([false, true])(
    "passes failed review details to the retry worker (isolated: %s)",
    async (isolated) => {
      const { tasks, reviewing, task, turns, finish, addRepo, store } = setup();
      const repo = isolated ? addRepo("repo") : undefined;
      const verifying = await reviewing(repo ? { projectId: repo.id } : {});
      const reviewer = verifying.reviewer!.sessionId!;
      await finish(
        reviewer,
        "package.ts:42 keeps the old selection after rollback.\nVERDICT: FAIL - Package versions disagree.",
      );
      const originalPrompt = task().prompt;
      // Going through To do must preserve the finding after verification is cleared.
      const todo = await tasks.move("main", "todo");
      expect(todo.verification).toBeUndefined();
      expect(todo.retryFeedback).toContain("package.ts:42");
      expect(todo.retryFeedback!.length).toBeLessThanOrEqual(12_000);
      await tasks.move("main", "queued");
      await tasks.tick();
      expect(task().prompt).toBe(originalPrompt);
      expect(task().sessionId).not.toBe(verifying.sessionId);
      expect(task().branch).toBe(verifying.branch);
      expect(store.session(task().sessionId!).session.cwd).toBe(
        verifying.worktreeCwd ?? store.project(verifying.projectId).cwd,
      );
      const retry = turns.at(-1)!.input.text;
      expect(retry).toContain(originalPrompt);
      expect(retry).toContain("Package versions disagree.");
      expect(retry).toContain(
        "package.ts:42 keeps the old selection after rollback.",
      );
      expect(retry).toContain("fix the findings");
      await finish(task().sessionId!);
      await finish(task().reviewer!.sessionId!, "VERDICT: PASS");
      expect(task().status).toBe("review");
      expect(task().retryFeedback).toBeUndefined();
    },
  );

  it("retries a failed review even when its session is unavailable", async () => {
    const { tasks, reviewing, task, turns, finish, store } = setup();
    const verifying = await reviewing();
    const reviewer = verifying.reviewer!.sessionId!;
    await finish(reviewer, "VERDICT: FAIL - Friday is missing.");
    store.deleteSession(reviewer);
    await tasks.move("main", "queued");
    await tasks.tick();
    expect(task().status).toBe("running");
    expect(turns.at(-1)!.input.text).toContain("Friday is missing.");
  });

  it("carries a failed check's output into retry and bounds the feedback", async () => {
    const { tasks, run, task, turns, store, advance } = setup();
    await run();
    await tasks.move("main", "blocked");
    await advance();
    const failed = {
      ...task(),
      error: "The check command failed (exit code 1).",
      verifyCommand: "pnpm test",
      verification: {
        command: {
          exitCode: 1,
          timedOut: false,
          output: "rollback selection failed\n" + "x".repeat(20_000),
        },
      },
    };
    store.db
      .prepare("UPDATE tasks SET value=? WHERE id=?")
      .run(JSON.stringify(failed), failed.id);
    const queued = await tasks.move("main", "queued");
    expect(queued.retryFeedback!.length).toBe(12_000);
    await tasks.tick();
    expect(turns.at(-1)!.input.text).toContain("Check command: pnpm test");
    expect(turns.at(-1)!.input.text).toContain("rollback selection failed");
  });

  it("blocks a task whose reviewer gave no verdict", async () => {
    const { reviewing, task, finish } = setup();
    const verifying = await reviewing();
    await finish(verifying.reviewer!.sessionId!, "Looks fine to me.");
    expect(task()).toMatchObject({
      status: "blocked",
      error: "Review failed: Reviewer gave no verdict",
      verification: { review: { verdict: "fail" } },
    });
  });

  it("holds the reviewer to the task's time limit", async () => {
    const { tasks, reviewing, task, provider, settled, clock, advance } =
      setup();
    const verifying = await reviewing({ maxRunMinutes: 30 });
    clock.now += 29 * MINUTE;
    await tasks.tick();
    expect(provider.cancel).not.toHaveBeenCalled();
    clock.now += MINUTE;
    await tasks.tick();
    expect(provider.cancel).toHaveBeenCalledTimes(1);
    await settled(verifying.reviewer!.sessionId!);
    await advance();
    expect(task()).toMatchObject({
      status: "blocked",
      error: "Review failed: Stopped: reached the 30-minute time limit.",
    });
  });

  it("stops a task that is being verified", async () => {
    const { tasks, reviewing, task, provider, settled, advance } = setup();
    const verifying = await reviewing();
    expect(await tasks.move("main", "blocked")).toMatchObject({
      status: "blocked",
      error: "Stopped by you.",
    });
    expect(provider.cancel).toHaveBeenCalledTimes(1);
    await settled(verifying.reviewer!.sessionId!);
    await advance();
    expect(task().status).toBe("blocked");
  });
});

describe("merging without waiting for approval", () => {
  const PASSING_CHECK = 'node -e "process.exit(0)"';

  it(
    "merges a task once its check command passes",
    async () => {
      const { review, addRepo, task } = setup();
      const repo = addRepo("repo");
      const merged = await review(
        { projectId: repo.id, autoMerge: true, verifyCommand: PASSING_CHECK },
        { "report.md": "# Report\n" },
      );
      expect(merged).toMatchObject({
        status: "done",
        merged: true,
        autoMerged: true,
        mergedAt: expect.any(Number),
      });
      expect(task().mergeError).toBeUndefined();
      expect(readFileSync(join(repo.cwd, "report.md"), "utf8")).toBe(
        "# Report\n",
      );
      expect(git(repo.cwd, "branch", "--list", "mc/*")).toBe("");
      expect(
        git(repo.cwd, "rev-list", "--parents", "-1", "HEAD").split(" "),
      ).toHaveLength(3);
    },
    SHELL_TEST_MS,
  );

  it("merges a task once the reviewer passes it", async () => {
    const { reviewing, finish, task, addRepo } = setup();
    const repo = addRepo("repo");
    const verifying = await reviewing({ projectId: repo.id, autoMerge: true });
    await finish(
      verifying.reviewer!.sessionId!,
      "Looks right.\n\nVERDICT: PASS",
    );
    expect(task()).toMatchObject({ status: "done", autoMerged: true });
  });

  it("leaves a task the reviewer fails blocked, unmerged", async () => {
    const { reviewing, finish, task, addRepo } = setup();
    const repo = addRepo("repo");
    const verifying = await reviewing({ projectId: repo.id, autoMerge: true });
    await finish(verifying.reviewer!.sessionId!, "VERDICT: FAIL - missing");
    expect(task().status).toBe("blocked");
    expect(task().autoMerged).toBeUndefined();
  });

  it("keeps a task with no checks in review and says why", async () => {
    const { tasks, review, task, addRepo } = setup();
    const repo = addRepo("repo");
    const reviewed = await review(
      { projectId: repo.id, autoMerge: true },
      { "report.md": "# Report\n" },
    );
    expect(reviewed.status).toBe("review");
    expect(reviewed.mergeError).toBe(
      "Not merged automatically: no checks configured",
    );
    expect(existsSync(join(repo.cwd, "report.md"))).toBe(false);
    // The owner can still approve it.
    await tasks.move("main", "done");
    expect(task()).toMatchObject({ status: "done", merged: true });
    expect(task().autoMerged).toBeUndefined();
    expect(task().mergeError).toBeUndefined();
  });

  it(
    "keeps a task in review with the error when the checkout is dirty",
    async () => {
      const { review, addRepo, task } = setup();
      const repo = addRepo("repo");
      writeFileSync(join(repo.cwd, "file.txt"), "edited by the owner\n");
      const reviewed = await review(
        { projectId: repo.id, autoMerge: true, verifyCommand: PASSING_CHECK },
        { "report.md": "# Report\n" },
      );
      expect(reviewed.status).toBe("review");
      expect(task().mergeError).toContain("uncommitted changes");
      expect(task().autoMerged).toBeUndefined();
      expect(readFileSync(join(repo.cwd, "file.txt"), "utf8")).toBe(
        "edited by the owner\n",
      );
    },
    SHELL_TEST_MS,
  );

  it(
    "keeps a task in review with the error when the merge conflicts",
    async () => {
      const { run, finish, addRepo, task } = setup();
      const repo = addRepo("repo");
      const started = await run({
        projectId: repo.id,
        autoMerge: true,
        verifyCommand: PASSING_CHECK,
      });
      writeFileSync(join(started.worktreeCwd!, "file.txt"), "from the agent\n");
      writeFileSync(join(repo.cwd, "file.txt"), "from the owner\n");
      git(repo.cwd, "commit", "-q", "-am", "owner");
      const head = git(repo.cwd, "rev-parse", "HEAD");
      await finish(started.sessionId!);
      expect(task().status).toBe("review");
      expect(task().mergeError).toContain("conflicts with main in file.txt");
      expect(git(repo.cwd, "rev-parse", "HEAD")).toBe(head);
      expect(git(repo.cwd, "status", "--porcelain")).toBe("");
    },
    SHELL_TEST_MS,
  );

  it(
    "never merges a task that ran in the project folder",
    async () => {
      const { review } = setup();
      const reviewed = await review({
        autoMerge: true,
        verifyCommand: PASSING_CHECK,
      });
      expect(reviewed).toMatchObject({ status: "review" });
      expect(reviewed.autoMerged).toBeUndefined();
      expect(reviewed.mergeError).toBeUndefined();
    },
    SHELL_TEST_MS,
  );

  it("saves autoMerge, drops it when an edit turns it off, and rejects other values", () => {
    const { tasks, input } = setup();
    expect(tasks.save(input({ autoMerge: true }))).toMatchObject({
      autoMerge: true,
    });
    expect(tasks.save(input({ autoMerge: false })).autoMerge).toBeUndefined();
    expect(tasks.save(input({ id: "other" })).autoMerge).toBeUndefined();
    expect(() => tasks.save(input({ id: "bad", autoMerge: "yes" }))).toThrow(
      "Invalid task options",
    );
  });
});

describe("host work limits", () => {
  it("defaults to two tasks at once and no daily limit", () => {
    const { tasks } = setup();
    expect(tasks.limits.settings()).toEqual({
      maxRunningTasks: MAX_RUNNING_TASKS,
      dailyAgentMinutes: 0,
    });
    expect(tasks.limits.state()).toMatchObject({
      usedMinutes: 0,
      limitReached: false,
    });
  });

  it("validates settings and keeps fields that were not sent", () => {
    const { tasks } = setup();
    for (const bad of [
      { maxRunningTasks: 0 },
      { maxRunningTasks: 9 },
      { maxRunningTasks: 1.5 },
      { maxRunningTasks: "2" },
      { dailyAgentMinutes: -1 },
      { dailyAgentMinutes: 1441 },
      { dailyAgentMinutes: 2.5 },
    ])
      expect(() => tasks.limits.save(bad)).toThrow();
    expect(() => tasks.limits.save(null)).toThrow("Invalid settings");
    expect(tasks.limits.save({ maxRunningTasks: 8 })).toEqual({
      maxRunningTasks: 8,
      dailyAgentMinutes: 0,
    });
    expect(tasks.limits.save({ dailyAgentMinutes: 1440 })).toEqual({
      maxRunningTasks: 8,
      dailyAgentMinutes: 1440,
    });
  });

  it("uses the saved cap on how many tasks run at once", async () => {
    const { tasks, input, task, turns, clock, addProject } = setup();
    for (const id of ["a", "b", "c"]) {
      tasks.save(input({ id, projectId: addProject(id).id }));
      clock.now += 1;
    }
    tasks.limits.save({ maxRunningTasks: 1 });
    await tasks.tick();
    await vi.waitFor(() => expect(turns).toHaveLength(1));
    expect(["a", "b", "c"].map((id) => task(id).status)).toEqual([
      "running",
      "queued",
      "queued",
    ]);
    tasks.limits.save({ maxRunningTasks: 3 });
    await tasks.tick();
    await vi.waitFor(() => expect(turns).toHaveLength(3));
    expect(["a", "b", "c"].map((id) => task(id).status)).toEqual([
      "running",
      "running",
      "running",
    ]);
  });

  it("starts nothing new once the day is used up, lets running work finish, and resumes tomorrow", async () => {
    const {
      tasks,
      input,
      run,
      task,
      turns,
      settled,
      clock,
      advance,
      addProject,
    } = setup();
    tasks.limits.save({ dailyAgentMinutes: 5 });
    const first = await run({ id: "a", projectId: addProject("a").id });
    tasks.save(input({ id: "b", projectId: addProject("b").id }));
    clock.now += 1;

    // The run still going counts as it goes.
    clock.now += 5 * MINUTE;
    await tasks.tick();
    expect(tasks.limits.state()).toMatchObject({ limitReached: true });
    expect(tasks.limits.usedMinutes()).toBeCloseTo(5, 1);
    expect(task("a").status).toBe("running");
    expect(task("b").status).toBe("queued");
    expect(turns).toHaveLength(1);

    // Finishing is allowed; the next task still waits.
    turns[0].finish();
    await settled(first.sessionId!);
    await advance();
    expect(task("a").status).toBe("review");
    expect(task("b").status).toBe("queued");
    expect(tasks.limits.usedMinutes()).toBeCloseTo(6, 1);
    expect(turns).toHaveLength(1);

    // A new local day starts a fresh total.
    clock.now += 24 * 60 * MINUTE;
    expect(tasks.limits.state()).toMatchObject({
      limitReached: false,
      usedMinutes: 0,
    });
    await tasks.tick();
    await vi.waitFor(() => expect(turns).toHaveLength(2));
    expect(task("b").status).toBe("running");
  });

  it("keeps the total and the settings across a host restart", async () => {
    const { tasks, store, engine, run, turns, settled, clock, advance } =
      setup();
    tasks.limits.save({ maxRunningTasks: 3, dailyAgentMinutes: 120 });
    const started = await run();
    clock.now += 10 * MINUTE;
    turns[0].finish();
    await settled(started.sessionId!);
    await advance();
    const used = tasks.limits.usedMinutes();
    expect(used).toBeCloseTo(11, 1);

    const restarted = new HostTasks(store, engine, () => clock.now);
    expect(restarted.limits.settings()).toEqual({
      maxRunningTasks: 3,
      dailyAgentMinutes: 120,
    });
    expect(restarted.limits.usedMinutes()).toBeCloseTo(used, 5);
  });

  it("counts the reviewer time too", async () => {
    const { tasks, reviewing, finish, clock } = setup();
    const verifying = await reviewing();
    clock.now += 4 * MINUTE;
    await finish(verifying.reviewer!.sessionId!, "VERDICT: PASS");
    // The run took a minute, and the reviewer the minutes after it.
    expect(tasks.limits.usedMinutes()).toBeGreaterThan(4);
  });
});
