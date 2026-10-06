// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LOCAL_SYNC_MACHINE_NAME } from "../../connections/model/localSync";
import type { HostGoal } from "../model/hostGoals";
import type { HostSettingsState } from "../model/hostSettings";
import type { HostSteward } from "../model/hostStewards";
import type { HostTask } from "../model/hostTasks";
import { invalidateMachineSnapshot } from "../../automations/model/machineSnapshot";
import type { DailySummary } from "../model/dailySummary";
import {
  loadStoredDailySummary,
  requestSummaryPanel,
  saveStoredDailySummary,
} from "../model/dailySummaryClient";
import { TasksView } from "./TasksView";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", async (original) => ({
  ...(await original<typeof import("@tauri-apps/api/core")>()),
  invoke,
}));
vi.mock("@tauri-apps/api/event", () => ({ listen: async () => () => {} }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    isMaximized: async () => false,
    onResized: async () => () => {},
  }),
}));

let container: HTMLDivElement;
let root: Root;

const task = (overrides: Partial<HostTask>): HostTask => ({
  id: "main",
  title: "Ship the report",
  prompt: "Write the weekly report",
  projectId: "project-1",
  harness: "claude",
  model: "claude:test",
  modelSettings: {},
  runtimeMode: "auto",
  maxRunMinutes: 0,
  status: "queued",
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

const goal = (overrides: Partial<HostGoal>): HostGoal => ({
  id: "launch",
  title: "Launch the beta",
  prompt: "Ship the beta",
  projectIds: ["project-1"],
  leadProjectId: "project-1",
  harness: "claude",
  model: "claude:test",
  modelSettings: {},
  runtimeMode: "auto",
  maxRunMinutes: 0,
  verifyDefaults: { review: true },
  approvePlan: true,
  status: "planning",
  taskIds: [],
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

/** A host on this computer holding `tasks`; records what the board asks of it. */
function host(
  tasks: HostTask[],
  capabilities = ["tasks", "tasks.todo"],
  goals: HostGoal[] = [],
  stewards: HostSteward[] = [],
  limits?: HostSettingsState,
) {
  const requests: Array<{ method: string; params: unknown }> = [];
  invoke.mockImplementation(async (command: string, args?: any) => {
    if (command === "remote_machines")
      return [
        {
          id: "machine-local",
          name: LOCAL_SYNC_MACHINE_NAME,
          endpoint: "http://127.0.0.1:3774",
          environmentId: "env-local",
        },
      ];
    if (command !== "remote_request") return null;
    requests.push({ method: args.method, params: args.params });
    if (args.method === "environment.describe") return { capabilities };
    if (args.method === "projects.list")
      return [{ id: "project-1", cwd: "/work/project", name: "project" }];
    if (args.method === "tasks.list") return tasks;
    if (args.method === "goals.list") return goals;
    if (args.method === "stewards.list") return stewards;
    if (args.method === "host.settings.get" && limits) return limits;
    if (args.method === "host.settings.save" && limits)
      return { ...limits, ...args.params.settings };
    if (args.method === "tasks.move")
      return { ...tasks[0], status: args.params.to };
    if (args.method === "tasks.review.recheck") return { ...tasks[0], status: "verifying" };
    if (args.method === "tasks.notes.read" || args.method === "tasks.notes.resolve") {
      const target = tasks.find((task) => task.id === args.params.taskId)!;
      target.reviewNotes = target.reviewNotes?.map((note) => {
        if (args.method === "tasks.notes.read" && args.params.noteIds.includes(note.id)) return { ...note, readAt: 3 };
        if (args.method === "tasks.notes.resolve" && args.params.noteId === note.id) return { ...note, resolvedAt: args.params.resolved ? 3 : undefined };
        return note;
      });
      return target;
    }
    if (args.method === "tasks.delete") {
      tasks.splice(0);
      return { deleted: true };
    }
    return {};
  });
  return requests;
}

async function render(onOpenBackgroundSession = vi.fn()) {
  await act(async () =>
    root.render(
      createElement(TasksView, {
        cwd: "/work/project",
        recents: [],
        onClose: vi.fn(),
        onOpenBackgroundSession,
      }),
    ),
  );
  await act(async () => {});
}

const column = (status: string) =>
  container.querySelector<HTMLElement>(`[data-task-column="${status}"]`)!;
const button = (scope: ParentNode, label: string) =>
  Array.from(scope.querySelectorAll("button")).find(
    (entry) => entry.textContent?.trim() === label,
  );

/** Types into a controlled React field. */
function type(field: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype =
    field instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(field, value);
  field.dispatchEvent(new Event("input", { bubbles: true }));
}
const card = (title: string) =>
  container.querySelector<HTMLElement>(`article[aria-label="${title}"]`)!;
const panel = () =>
  container.querySelector<HTMLElement>('aside[aria-label="Task details"]');

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  invoke.mockReset();
  // Each test describes the same machine differently.
  invalidateMachineSnapshot();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it("lays tasks out in six columns with the actions each status allows", async () => {
  host([
    task({ id: "t", status: "todo" }),
    task({ id: "a" }),
    task({ id: "b", status: "running", startedAt: 1, needsInput: true }),
    task({ id: "c", status: "review", completedAt: 2 }),
    task({ id: "d", status: "done", completedAt: 2 }),
    task({ id: "e", status: "blocked", completedAt: 2, error: "Not signed in" }),
  ]);
  await render();
  expect(
    Array.from(container.querySelectorAll("[data-task-column]"), (section) =>
      section.getAttribute("aria-label"),
    ),
  ).toEqual(["To do", "Queued", "Running", "Review", "Done", "Blocked"]);
  const actions = (status: string) =>
    Array.from(column(status).querySelectorAll("button"), (entry) =>
      entry.textContent?.trim(),
    );
  expect(actions("todo")).toEqual(["Mark done", "Start", "Edit", "Delete"]);
  expect(actions("queued")).toEqual(["Move to To do", "Edit", "Delete"]);
  expect(actions("running")).toEqual(["Stop"]);
  expect(actions("review")).toEqual(["Approve", "Run again", "Delete"]);
  expect(actions("done")).toEqual(["Run again", "Reopen", "Delete"]);
  expect(actions("blocked")).toEqual([
    "Retry",
    "Move to To do",
    "Edit",
    "Delete",
  ]);
  expect(column("running").textContent).toContain("Needs input");
  expect(column("blocked").textContent).toContain("Not signed in");
  expect(column("queued").textContent).toContain("on this computer");
});

it("shows pending and genuinely empty task board states", async () => {
  host([]);
  const original = invoke.getMockImplementation()!;
  let resolveMachines!: (machines: unknown[]) => void;
  const pendingMachines = new Promise<unknown[]>((resolve) => {
    resolveMachines = resolve;
  });
  invoke.mockImplementation((command: string, args?: any) =>
    command === "remote_machines" ? pendingMachines : original(command, args),
  );
  await render();
  expect(
    container.querySelector('[data-remote-data-state="loading"]'),
  ).toBeTruthy();
  await act(async () => {
    resolveMachines([]);
    await Promise.resolve();
    await Promise.resolve();
  });
  await act(async () => {});
  expect(container.querySelector('[data-remote-data-state="empty"]')?.textContent)
    .toContain("No task board.");
});

it("keeps last-known cards visible on a failed refresh and retries the network read", async () => {
  const requests = host([task({ id: "kept", status: "todo" })]);
  await render();
  expect(container.querySelector('[data-remote-data-state="ready"]')).toBeTruthy();
  expect(card("Ship the report")).toBeTruthy();

  const original = invoke.getMockImplementation()!;
  let failNextList = true;
  let failedListAttempts = 0;
  invoke.mockImplementation(async (command: string, args?: any) => {
    if (
      failNextList &&
      command === "remote_request" &&
      args?.method === "tasks.list"
    ) {
      failNextList = false;
      failedListAttempts++;
      throw new Error("Host timed out.");
    }
    return original(command, args);
  });
  const refreshCount = () =>
    requests.filter((entry) => entry.method === "tasks.list").length +
    failedListAttempts;
  const beforeFailure = refreshCount();
  await act(async () => button(container, "Refresh")!.click());
  await act(async () => {});
  expect(refreshCount()).toBe(beforeFailure + 1);
  expect(container.querySelector('[data-remote-data-state="stale"]')?.textContent)
    .toContain("Host timed out.");
  expect(card("Ship the report")).toBeTruthy();

  await act(async () => button(container, "Refresh")!.click());
  await act(async () => {});
  expect(refreshCount()).toBe(beforeFailure + 2);
  expect(container.querySelector('[data-remote-data-state="ready"]')).toBeTruthy();
  expect(card("Ship the report")).toBeTruthy();
});

it("asks the task's machine to move it", async () => {
  const requests = host([task({ status: "review", completedAt: 2 })]);
  await render();
  await act(async () => button(column("review"), "Approve")!.click());
  expect(requests).toContainEqual({
    method: "tasks.move",
    params: { taskId: "main", to: "done" },
  });
});

it("shows a task being verified under Running", async () => {
  host([task({ status: "verifying", startedAt: 1, branch: "mc/abcd1234" })]);
  await render();
  expect(container.querySelectorAll("[data-task-column]")).toHaveLength(6);
  expect(column("running").textContent).toContain("Verifying");
  expect(column("running").textContent).toContain("mc/abcd1234");
  expect(
    Array.from(column("running").querySelectorAll("button"), (entry) =>
      entry.textContent?.trim(),
    ),
  ).toEqual(["Stop"]);
});

it("offers to merge a reviewed branch and shows what was checked", async () => {
  const requests = host([
    task({
      status: "review",
      completedAt: 2,
      branch: "mc/abcd1234",
      baseBranch: "main",
      diffStat: " report.md | 1 +\n 1 file changed, 1 insertion(+)",
      mergeError: "The project has uncommitted changes.",
      verification: {
        command: { exitCode: 0, output: "12 tests passed", timedOut: false },
        review: { verdict: "pass", note: "Covers the week.", sessionId: "s" },
      },
    }),
  ]);
  await render();
  const card = column("review");
  expect(button(card, "Approve")).toBeUndefined();
  expect(card.textContent).toContain("mc/abcd1234");
  expect(card.textContent).toContain("1 file changed");
  expect(card.textContent).toContain("Check command passed");
  expect(card.textContent).toContain("Reviewer passed · Covers the week.");
  // The command output is there to open.
  expect(card.querySelector("details")!.open).toBe(false);
  expect(card.querySelector("details pre")!.textContent).toBe("12 tests passed");
  expect(card.querySelector('[role="alert"]')!.textContent).toBe(
    "The project has uncommitted changes.",
  );
  await act(async () => button(card, "Merge into main")!.click());
  expect(requests).toContainEqual({
    method: "tasks.move",
    params: { taskId: "main", to: "done" },
  });
});

it("confirms before discarding the branch of an unmerged task", async () => {
  const requests = host([
    task({
      status: "blocked",
      completedAt: 2,
      error: "The check command failed (exit code 1).",
      branch: "mc/abcd1234",
      baseBranch: "main",
      verification: {
        command: { exitCode: 1, output: "1 failed", timedOut: false },
      },
    }),
  ]);
  await render();
  expect(column("blocked").textContent).toContain(
    "Check command failed (exit code 1)",
  );
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  await act(async () => button(column("blocked"), "Delete")!.click());
  expect(confirm.mock.calls[0][0]).toContain(
    "Its work on mc/abcd1234 was never merged, and the branch will be discarded.",
  );
  expect(requests.some((request) => request.method === "tasks.delete")).toBe(
    false,
  );
  confirm.mockReturnValue(true);
  await act(async () => button(column("blocked"), "Delete")!.click());
  expect(requests).toContainEqual({
    method: "tasks.delete",
    params: { taskId: "main", discard: true },
  });
  confirm.mockRestore();
});

it("offers the branch, check and review options on a new task", async () => {
  host([]);
  await render();
  await act(async () => button(container, "New task")!.click());
  const form = container.querySelector('form[aria-label="New task"]')!;
  // The agent controls are tucked away until asked for.
  expect(form.querySelector('input[type="checkbox"]')).toBeNull();
  await act(async () => button(form, "Agent settings")!.click());
  const boxes = Array.from(
    form.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
  );
  expect(boxes.map((box) => box.parentElement!.textContent?.trim())).toEqual([
    "Run on its own branch",
    "Review with a second agent",
    "Merge automaticallyMerges into the base branch when every check passes",
  ]);
  expect(boxes.map((box) => box.checked)).toEqual([true, true, false]);
  expect(
    form.querySelector<HTMLInputElement>('input[aria-label="Check command"]')!
      .value,
  ).toBe("");
});

it("says so when the project's machine cannot take a task", async () => {
  host([], []);
  await render();
  expect(container.textContent).toContain(
    "No connected machine has a task board.",
  );
  await act(async () => button(container, "New task")!.click());
  const form = container.querySelector('form[aria-label="New task"]')!;
  expect(form.querySelector('[role="alert"]')?.textContent).toContain(
    "isn’t connected, or its MonoCode Host needs an update",
  );
  expect(button(form, "Add to To do")!.disabled).toBe(true);
  expect(button(form, "Add and start")!.disabled).toBe(true);
});

it("shows a plan waiting for approval and asks the goal's machine to approve it", async () => {
  const requests = host([], ["tasks", "goals"], [
    goal({
      status: "awaiting-approval",
      plan: {
        tasks: [
          {
            key: "api",
            project: "/work/project",
            projectId: "project-1",
            title: "Add the endpoint",
            prompt: "Add it",
            dependsOn: [],
          },
          {
            key: "ui",
            project: "/work/project",
            projectId: "project-1",
            title: "Call the endpoint",
            prompt: "Call it",
            dependsOn: ["api"],
          },
        ],
      },
    }),
  ]);
  await render();
  const card = container.querySelector<HTMLElement>(
    'article[aria-label="Launch the beta"]',
  )!;
  expect(card.textContent).toContain("Plan ready");
  expect(card.querySelector('[aria-label="Plan"]')!.textContent).toContain(
    "Call the endpointin project· after Add the endpoint",
  );
  expect(
    Array.from(card.querySelectorAll("button"), (entry) =>
      entry.textContent?.trim(),
    ),
  ).toEqual(["Approve", "Replan", "Cancel", "Delete"]);
  await act(async () => button(card, "Approve")!.click());
  expect(requests).toContainEqual({
    method: "goals.approve",
    params: { goalId: "launch" },
  });

  await act(async () => button(card, "Replan")!.click());
  const feedback = card.querySelector<HTMLTextAreaElement>(
    'textarea[aria-label="Plan feedback"]',
  )!;
  expect(feedback).toBeTruthy();
});

it("labels a goal's tasks and says what a task waits for", async () => {
  host(
    [
      task({ id: "a", title: "Add the endpoint", status: "review", goalId: "launch", completedAt: 2 }),
      task({ id: "b", title: "Call the endpoint", goalId: "launch", dependsOn: ["a"] }),
      task({ id: "c", title: "Unrelated" }),
    ],
    ["tasks", "goals"],
    [goal({ status: "running", taskIds: ["a", "b"] })],
  );
  await render();
  const card = container.querySelector<HTMLElement>(
    'article[aria-label="Launch the beta"]',
  )!;
  expect(card.textContent).toContain("0/2 done");
  const queued = column("queued");
  expect(queued.textContent).toContain("Waiting for: Add the endpoint");
  expect(
    Array.from(queued.querySelectorAll("[data-task-goal]"), (label) =>
      label.textContent,
    ),
  ).toEqual(["Launch the beta"]);
});

it("offers a new goal form with plan review off and the reviewer on", async () => {
  host([], ["tasks", "goals"]);
  await render();
  await act(async () => button(container, "New goal")!.click());
  const form = container.querySelector('form[aria-label="New goal"]')!;
  const boxes = Array.from(
    form.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
  );
  expect(boxes.map((box) => box.parentElement!.textContent?.trim())).toEqual([
    "Review the plan before starting",
    "Review each task with a second agent",
    "Merge automaticallyMerges into the base branch when every check passes",
  ]);
  expect(boxes.map((box) => box.checked)).toEqual([false, true, false]);
  expect(form.querySelector('[data-goal-project="/work/project"]')).toBeTruthy();
  expect(button(form, "Plan it")!.disabled).toBe(true);
});

const edit = (scope: ParentNode) =>
  scope.querySelector<HTMLButtonElement>(
    'button[aria-label="Edit title and description"]',
  )!;
const escape = () =>
  act(async () =>
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })),
  );

it("adds a to-do item with a title and description, or adds and starts it", async () => {
  const requests = host([]);
  await render();
  const open = async () => {
    await act(async () => button(container, "New task")!.click());
    const form = container.querySelector('form[aria-label="New task"]')!;
    await act(async () =>
      type(
        form.querySelector<HTMLInputElement>('input[aria-label="Task title"]')!,
        "Call the bank",
      ),
    );
    return form;
  };
  const describe = (form: Element, text: string) =>
    act(async () =>
      type(
        form.querySelector<HTMLTextAreaElement>(
          'textarea[aria-label="Description"]',
        )!,
        text,
      ),
    );
  const saves = () =>
    requests.filter((request) => request.method === "tasks.save");

  let form = await open();
  // Without a description it can be a to-do item but not start.
  expect(button(form, "Add to To do")!.disabled).toBe(false);
  expect(button(form, "Add and start")!.disabled).toBe(true);
  await describe(form, "About the card");
  await act(async () => button(form, "Add to To do")!.click());
  expect((saves()[0].params as any).task).toMatchObject({
    title: "Call the bank",
    prompt: "About the card",
    status: "todo",
  });

  form = await open();
  await describe(form, "Do it");
  await act(async () => button(form, "Add and start")!.click());
  expect((saves()[1].params as any).task).toMatchObject({
    title: "Call the bank",
    prompt: "Do it",
    status: "queued",
  });
});

it("asks for instructions only after the independent takeover failed", async () => {
  const requests = host(
    [
      task({
        status: "blocked",
        sessionId: "worker-session",
        blockedTakeover: { at: 1, blocker: "Acceptance missing", previousSessionId: "original-worker" },
        repairStop: {
          reason: "external",
          message: "Provide an Android device and test TalkBack reset.",
        },
        verification: {
          review: {
            verdict: "fail",
            note: "Acceptance missing",
            sessionId: "review-session",
          },
        },
        attemptHistory: [
          {
            attempt: 1,
            at: 2,
            workerSessionId: "worker-session",
            reviewerSessionId: "review-session",
            workerSummary: "Fixed reset and ran unit checks.",
            verdict: "fail",
            note: "Acceptance missing",
            findings: ["Acceptance missing"],
          },
        ],
      }),
    ],
    ["tasks", "tasks.todo", "tasks.review-recheck"],
  );
  await render();
  expect(card("Ship the report").textContent).toContain(
    "Waiting for your instructions",
  );
  await act(async () => card("Ship the report").click());
  const history = panel()!.querySelector('[aria-label="Attempt history"]')!;
  expect(history.textContent).toContain("Fixed reset and ran unit checks.");
  expect(history.textContent).toContain("Review: Acceptance missing");
  expect(history.textContent).toContain("Provide an Android device");
  expect(button(panel()!, "Recheck review")).toBeUndefined();
  expect(button(panel()!, "Retry")).toBeUndefined();
  expect(button(panel()!, "Update instructions")).toBeDefined();
  expect(history.textContent).toContain("Update the task description");
  expect(
    requests.filter((request) => request.method === "tasks.review.recheck"),
  ).toEqual([]);
  expect(requests.some((request) => request.method === "tasks.move")).toBe(
    false,
  );
});

it("shows automatic takeover for a blocked task without asking the owner to retry", async () => {
  host([task({ status: "blocked", sessionId: "worker", error: "Review failed: Missing evidence.",
    verification: { review: { verdict: "fail", note: "Missing evidence.", sessionId: "review" } },
  })], ["tasks", "tasks.blocked-takeover"]);
  await render();
  expect(card("Ship the report").textContent).toContain("AI takeover pending");
  expect(button(card("Ship the report"), "Retry")).toBeUndefined();
  expect(card("Ship the report").textContent).not.toContain("Needs input");
});

it("renders a structured task as a readable brief with a short card summary", async () => {
  host([task({ prompt: JSON.stringify({ schema: "monocode.task.v1", objective: "Fix playback", deliverables: ["Retain seek position"], acceptance: ["Resume at 4 seconds"], constraints: [], verification: ["Run audio tests"] }) })]);
  await render();
  expect(card("Ship the report").querySelector("[data-task-description]")?.textContent).toBe("Fix playback");
  await act(async () => card("Ship the report").click());
  const description = panel()!.querySelector("[data-task-detail-description]")!;
  expect(description.textContent).toContain("Acceptance criteria");
  expect(description.textContent).toContain("Resume at 4 seconds");
  expect(description.textContent).not.toContain("monocode.task.v1");
});

it("offers to update an older host instead of adding a to-do item", async () => {
  const requests = host([], ["tasks"]);
  await render();
  await act(async () => button(container, "New task")!.click());
  const form = container.querySelector('form[aria-label="New task"]')!;
  await act(async () =>
    type(
      form.querySelector<HTMLInputElement>('input[aria-label="Task title"]')!,
      "Idea",
    ),
  );
  expect(form.querySelector('[role="status"]')!.textContent).toBe(
    "Update MonoCode Host on this computer to add to-do items",
  );
  expect(button(form, "Add to To do")!.disabled).toBe(true);
  expect(requests.some((request) => request.method === "tasks.save")).toBe(
    false,
  );
});

it("opens a task's details from its card, and closes them with Escape", async () => {
  host([
    task({
      status: "review",
      prompt: "Write the weekly report\nInclude the totals",
      completedAt: 2,
      branch: "mc/abcd1234",
      baseBranch: "main",
      diffStat: " report.md | 1 +",
      verification: {
        command: { exitCode: 0, output: "12 tests passed", timedOut: false },
        review: { verdict: "pass", note: "Covers the week.", sessionId: "s" },
      },
    }),
  ]);
  await render();
  expect(panel()).toBeNull();
  expect(card("Ship the report").textContent).toContain(
    "Write the weekly report",
  );
  await act(async () => card("Ship the report").click());
  await act(async () => {});
  const details = panel()!;
  expect(details).toBeTruthy();
  expect(details.textContent).toContain("Ship the report");
  expect(details.textContent).toContain("Include the totals");
  expect(details.textContent).toContain("Review");
  expect(details.textContent).toContain("mc/abcd1234");
  expect(details.textContent).toContain("12 tests passed");
  expect(details.textContent).toContain("Reviewer passed · Covers the week.");
  expect(details.textContent).toContain("report.md | 1 +");
  // The board stays visible beside it.
  expect(column("review")).toBeTruthy();

  await escape();
  expect(panel()).toBeNull();
  await act(async () => card("Ship the report").click());
  await act(async () =>
    panel()!
      .querySelector<HTMLButtonElement>('button[aria-label="Close details"]')!
      .click(),
  );
  expect(panel()).toBeNull();
});

it("shows new review notes and saves read/fixed states while opening the source reviewer", async () => {
  const openReview = vi.fn();
  const requests = host([task({ status: "blocked", reviewNotes: [{
    id: "note-1", finding: "Friday is missing.", suggestion: "Include Friday totals.", kind: "finding",
    sessionId: "review-session", createdAt: 1, updatedAt: 1, occurrences: 1,
  }] })]);
  await render(openReview);
  expect(card("Ship the report").querySelector("[data-task-review-notes]")!.textContent).toContain("1 new review note");
  expect(container.querySelector("[data-new-review-notes]")!.textContent).toContain("1 new review note");
  await act(async () => card("Ship the report").click());
  const notes = panel()!.querySelector('[aria-label="Review notes"]')!;
  expect(notes.textContent).toContain("Friday is missing.");
  expect(notes.textContent).toContain("Include Friday totals.");
  await act(async () => button(notes, "Open review")!.click());
  expect(openReview).toHaveBeenCalledWith({ machineId: "machine-local", cwd: "/work/project", projectId: "project-1", sessionId: "review-session" });
  await act(async () => button(notes, "Mark 1 as read")!.click());
  expect(requests.find((request) => request.method === "tasks.notes.read")!.params).toEqual({ taskId: "main", noteIds: ["note-1"] });
  expect(container.querySelector("[data-new-review-notes]")).toBeNull();
  expect(card("Ship the report").querySelector("[data-task-review-notes]")!.textContent).toContain("1 review note");
  await act(async () => button(notes, "Mark fixed")!.click());
  expect(notes.textContent).toContain("0 open");
  expect(card("Ship the report").closest('[data-task-column]')!.getAttribute("data-task-column")).toBe("blocked");
  await act(async () => button(notes, "Reopen note")!.click());
  expect(notes.textContent).toContain("1 open");
  expect(requests.filter((request) => request.method === "tasks.notes.resolve").map((request) => request.params)).toEqual([
    { taskId: "main", noteId: "note-1", resolved: true }, { taskId: "main", noteId: "note-1", resolved: false },
  ]);
});

it("does not open the panel from a card's action buttons", async () => {
  const requests = host([task({ status: "review", completedAt: 2 })]);
  await render();
  await act(async () => button(card("Ship the report"), "Approve")!.click());
  expect(panel()).toBeNull();
  expect(requests.some((request) => request.method === "tasks.move")).toBe(
    true,
  );
});

it("edits a task's title and description in the panel", async () => {
  const requests = host([task({ status: "todo" })]);
  await render();
  await act(async () => card("Ship the report").click());
  await act(async () => edit(panel()!).click());
  const form = panel()!.querySelector('form[aria-label="Edit details"]')!;
  await act(async () =>
    type(
      form.querySelector<HTMLInputElement>('input[aria-label="Title"]')!,
      "Renamed",
    ),
  );
  await act(async () =>
    type(
      form.querySelector<HTMLTextAreaElement>(
        'textarea[aria-label="Description"]',
      )!,
      "New details",
    ),
  );
  await act(async () => button(form, "Save")!.click());
  const save = requests.find((request) => request.method === "tasks.save")!;
  expect((save.params as any).task).toMatchObject({
    id: "main",
    title: "Renamed",
    prompt: "New details",
    model: "claude:test",
  });
  // An edit keeps the task's status.
  expect((save.params as any).task.status).toBeUndefined();
  expect(panel()!.querySelector("form")).toBeNull();
});

it("cancels an edit with Escape before closing the panel", async () => {
  host([task({ status: "todo" })]);
  await render();
  await act(async () => card("Ship the report").click());
  await act(async () => edit(panel()!).click());
  await escape();
  expect(panel()).toBeTruthy();
  expect(panel()!.querySelector("form")).toBeNull();
});

it("gives the panel the card's actions, and closes it when the task is gone", async () => {
  const requests = host([task({ status: "todo" })]);
  await render();
  await act(async () => card("Ship the report").click());
  expect(
    Array.from(panel()!.querySelectorAll("button"), (entry) =>
      entry.textContent?.trim(),
    ),
  ).toEqual(expect.arrayContaining(["Mark done", "Start", "Edit", "Delete"]));
  await act(async () => button(panel()!, "Start")!.click());
  expect(requests).toContainEqual({
    method: "tasks.move",
    params: { taskId: "main", to: "queued" },
  });
  await act(async () => button(panel()!, "Mark done")!.click());
  expect(requests).toContainEqual({
    method: "tasks.move",
    params: { taskId: "main", to: "done" },
  });
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
  await act(async () => button(panel()!, "Delete")!.click());
  await act(async () => {});
  expect(panel()).toBeNull();
  confirm.mockRestore();
});

it("will not start a to-do item without a description", async () => {
  const requests = host([task({ status: "todo", prompt: "" })]);
  await render();
  await act(async () => card("Ship the report").click());
  await act(async () => button(panel()!, "Start")!.click());
  expect(container.textContent).toContain(
    "Add a description before starting this task with an agent.",
  );
  expect(requests.some((request) => request.method === "tasks.move")).toBe(
    false,
  );
});

const steward = (overrides: Partial<HostSteward> = {}): HostSteward => ({
  id: "steward-1",
  projectId: "project-1",
  enabled: true,
  harness: "claude",
  model: "claude:test",
  modelSettings: {},
  runtimeMode: "auto",
  scheduleKind: "daily",
  minute: 0,
  time: "09:00",
  dayOfWeek: 1,
  focus: "find bugs",
  maxProposals: 5,
  maxOpen: 10,
  autoStart: false,
  nextRunAt: new Date("2030-01-02T09:00:00").getTime(),
  declined: [],
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

const CAPABILITIES = ["tasks", "tasks.todo", "stewards"];
const stewardCard = () =>
  container.querySelector<HTMLElement>(
    'article[aria-label="Steward for project"]',
  )!;

it("lists stewards in a panel with their schedule and last run", async () => {
  const requests = host([], CAPABILITIES, [], [
    steward({
      lastRunAt: Date.now() - 5 * 60_000,
      lastRunStatus: "failed",
      lastRunError: "The steward’s reply has no json block.",
    }),
  ]);
  await render();
  // Hidden until asked for.
  expect(stewardCard()).toBeNull();
  await act(async () => button(container, "Stewards1")!.click());
  const card = stewardCard();
  expect(card.textContent).toContain("on this computer");
  expect(card.textContent).toContain("Daily at");
  expect(card.textContent).toContain("Last run: Failed 5m ago");
  expect(card.textContent).toContain("The steward’s reply has no json block.");
  expect(card.textContent).toContain("Next run");
  expect(
    Array.from(card.querySelectorAll("button"), (entry) =>
      entry.textContent?.trim(),
    ),
  ).toEqual(["Run now", "Edit", "Delete"]);

  await act(async () => button(card, "Run now")!.click());
  expect(requests).toContainEqual({
    method: "stewards.runNow",
    params: { stewardId: "steward-1" },
  });
  await act(async () =>
    card.querySelector<HTMLInputElement>('input[aria-label="Enabled"]')!.click(),
  );
  const saved = requests.find((request) => request.method === "stewards.save")!;
  expect(saved.params).toMatchObject({
    steward: { id: "steward-1", projectId: "project-1", enabled: false },
  });
});

it("has no Stewards button on a machine without stewards", async () => {
  host([], ["tasks", "tasks.todo"]);
  await render();
  expect(button(container, "Stewards")).toBeUndefined();
});

it("opens a steward form with auto-start off and warns when it is turned on", async () => {
  host([], CAPABILITIES);
  await render();
  await act(async () => button(container, "Stewards")!.click());
  await act(async () => button(container, "Add steward")!.click());
  const form = container.querySelector('form[aria-label="New steward"]')!;
  const auto = form.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
  expect(auto.parentElement!.textContent).toContain(
    "Start suggestions automatically",
  );
  expect(auto.checked).toBe(false);
  expect(form.querySelector('[role="status"]')).toBeNull();
  await act(async () => auto.click());
  expect(form.querySelector('[role="status"]')!.textContent).toContain(
    "without you reviewing the idea",
  );
  expect(form.querySelector('textarea[aria-label="Focus"]')).toBeTruthy();
});

it("marks a steward's suggestion and declines it instead of deleting it", async () => {
  const requests = host(
    [
      task({
        id: "idea",
        title: "Add retry tests",
        status: "todo",
        source: "steward",
        stewardId: "steward-1",
      }),
      task({ id: "mine", title: "Mine", status: "todo" }),
    ],
    CAPABILITIES,
  );
  await render();
  const suggested = card("Add retry tests");
  expect(suggested.querySelector("[data-task-suggested]")!.textContent).toBe(
    "Suggested",
  );
  expect(card("Mine").querySelector("[data-task-suggested]")).toBeNull();
  expect(
    Array.from(suggested.querySelectorAll("button"), (entry) =>
      entry.textContent?.trim(),
    ),
  ).toEqual(["Mark done", "Start", "Edit", "Decline"]);

  // The detail panel carries the badge and the same action.
  await act(async () => suggested.click());
  expect(panel()!.querySelector("[data-task-suggested]")).toBeTruthy();
  expect(button(panel()!, "Decline")).toBeTruthy();
  expect(button(panel()!, "Delete")).toBeUndefined();

  await act(async () => button(suggested, "Decline")!.click());
  expect(requests).toContainEqual({
    method: "stewards.decline",
    params: { taskId: "idea" },
  });
  expect(requests.some((request) => request.method === "tasks.delete")).toBe(
    false,
  );
});

const LIMITS: HostSettingsState = {
  maxRunningTasks: 2,
  dailyAgentMinutes: 120,
  usedMinutes: 75,
  limitReached: false,
};
const LIMIT_CAPABILITIES = ["tasks", "tasks.todo", "host.settings"];

it("sends autoMerge from the new task form, only with its own branch", async () => {
  const requests = host([]);
  await render();
  await act(async () => button(container, "New task")!.click());
  const form = container.querySelector('form[aria-label="New task"]')!;
  await act(async () =>
    type(
      form.querySelector<HTMLInputElement>('input[aria-label="Task title"]')!,
      "Ship it",
    ),
  );
  await act(async () =>
    type(
      form.querySelector<HTMLTextAreaElement>(
        'textarea[aria-label="Description"]',
      )!,
      "Do it",
    ),
  );
  await act(async () => button(form, "Agent settings")!.click());
  const boxes = Array.from(
    form.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
  );
  const [branch, , merge] = boxes;
  expect(merge.disabled).toBe(false);
  await act(async () => merge.click());
  expect(merge.checked).toBe(true);
  // Without its own branch there is nothing to merge on its own.
  await act(async () => branch.click());
  expect(merge.disabled).toBe(true);
  expect(merge.checked).toBe(false);
  await act(async () => branch.click());
  expect(merge.checked).toBe(true);
  await act(async () => button(form, "Add and start")!.click());
  const saved = requests.find((request) => request.method === "tasks.save")!;
  expect((saved.params as any).task).toMatchObject({
    isolate: true,
    autoMerge: true,
  });
});

it("sends autoMerge from the goal and steward forms", async () => {
  const requests = host([], ["tasks", "goals", "stewards"]);
  await render();
  await act(async () => button(container, "New goal")!.click());
  const goalForm = container.querySelector('form[aria-label="New goal"]')!;
  const merge = Array.from(
    goalForm.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
  )[2];
  await act(async () => merge.click());
  await act(async () =>
    type(
      goalForm.querySelector<HTMLInputElement>('input[aria-label="Goal title"]')!,
      "Launch",
    ),
  );
  await act(async () =>
    type(
      goalForm.querySelector<HTMLTextAreaElement>(
        'textarea[aria-label="Main job"]',
      )!,
      "Ship it",
    ),
  );
  await act(async () => button(goalForm, "Plan it")!.click());
  const created = requests.find((request) => request.method === "goals.create")!;
  expect((created.params as any).goal).toMatchObject({ autoMerge: true });

  await act(async () => button(container, "Stewards")!.click());
  await act(async () => button(container, "Add steward")!.click());
  const stewardForm = container.querySelector('form[aria-label="New steward"]')!;
  const boxes = Array.from(
    stewardForm.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
  );
  const box = boxes.find((entry) =>
    entry.parentElement!.textContent!.startsWith("Merge automatically"),
  )!;
  expect(box.checked).toBe(false);
  await act(async () => box.click());
  expect(box.checked).toBe(true);
});

it("marks a task the host merged on its own, on its card and in its details", async () => {
  host([
    task({
      status: "done",
      completedAt: 2,
      branch: "mc/abcd1234",
      baseBranch: "main",
      merged: true,
      autoMerged: true,
      mergedAt: Date.now(),
    }),
    task({ id: "manual", title: "By hand", status: "done", completedAt: 2 }),
  ]);
  await render();
  expect(
    card("Ship the report").querySelector("[data-task-auto-merged]")!
      .textContent,
  ).toBe("Merged automatically");
  expect(card("By hand").querySelector("[data-task-auto-merged]")).toBeNull();
  await act(async () => card("Ship the report").click());
  expect(panel()!.textContent).toContain("Merged automatically");
});

it("lists each machine's limits, shows today's use and saves a change", async () => {
  const requests = host([], LIMIT_CAPABILITIES, [], [], LIMITS);
  await render();
  expect(container.querySelector('[aria-label="Work limits"]')).toBeNull();
  await act(async () => button(container, "Limits")!.click());
  const panelOfLimits = container.querySelector<HTMLElement>(
    '[aria-label="Work limits"]',
  )!;
  expect(panelOfLimits.textContent).toContain("this computer");
  expect(panelOfLimits.textContent).toContain("Used today: 1h 15m");
  expect(panelOfLimits.textContent).toContain("Max concurrent tasks");
  expect(panelOfLimits.textContent).toContain("Daily agent time");
  const pick = (label: string) =>
    panelOfLimits.querySelector<HTMLButtonElement>(
      `button[aria-label="${label}"]`,
    )!;
  expect(pick("Max concurrent tasks on this computer: 2")).toBeTruthy();
  expect(pick("Daily agent time on this computer: 2 hours")).toBeTruthy();

  await act(async () =>
    pick("Max concurrent tasks on this computer: 2").click(),
  );
  const option = Array.from(
    document.querySelectorAll<HTMLElement>('[role="option"]'),
  ).find((entry) => entry.textContent?.trim() === "4")!;
  await act(async () => option.click());
  expect(requests).toContainEqual({
    method: "host.settings.save",
    params: { settings: { maxRunningTasks: 4 } },
  });
  expect(
    pick("Max concurrent tasks on this computer: 4"),
  ).toBeTruthy();
});

it("saves custom daily hours above the presets and 24 hours", async () => {
  const requests = host([], LIMIT_CAPABILITIES, [], [], LIMITS);
  await render();
  await act(async () => button(container, "Limits")!.click());
  const form = container.querySelector<HTMLFormElement>(
    'form[aria-label="Custom daily agent time on this computer"]',
  )!;
  const hours = form.querySelector<HTMLInputElement>('input[type="number"]')!;
  expect(hours.value).toBe("2");
  for (const value of ["18", "48", "12.5", "0"]) {
    await act(async () => type(hours, value));
    await act(async () => button(form, "Save")!.click());
    expect(requests).toContainEqual({
      method: "host.settings.save",
      params: { settings: { dailyAgentMinutes: Number(value) * 60 } },
    });
    expect(hours.value).toBe(value);
  }
  for (const value of ["", "-1"]) {
    await act(async () => type(hours, value));
    expect(button(form, "Save")!.disabled).toBe(true);
  }
});

it("has no Limits button on a host without work limits", async () => {
  host([], ["tasks", "tasks.todo"]);
  await render();
  expect(button(container, "Limits")).toBeUndefined();
});

it("says when a machine's daily agent time is used up", async () => {
  host([], LIMIT_CAPABILITIES, [], [], { ...LIMITS, limitReached: true });
  await render();
  expect(container.querySelector('[role="status"]')!.textContent).toBe(
    "Daily agent time on this computer is used up; queued work resumes tomorrow.",
  );
});

it("shows no daily notice while time is left", async () => {
  host([], LIMIT_CAPABILITIES, [], [], LIMITS);
  await render();
  expect(container.textContent).not.toContain("is used up");
});

const storedSummary = (title: string): DailySummary => ({
  since: 1,
  until: 2,
  finished: [
    {
      key: "machine-local:main",
      machineName: "this computer",
      project: "project",
      title,
    },
  ],
  autoMerged: 1,
  blocked: [],
  waiting: [],
  suggestions: [],
  goals: [],
  goalsFinished: [],
  usage: [],
  unreachable: ["MacBook"],
  outdated: [],
});

it("opens the last daily summary from the Summary button", async () => {
  host([task({ status: "done", completedAt: 2, title: "Ship the report" })]);
  saveStoredDailySummary(storedSummary("Ship the report"));
  await render();
  expect(container.querySelector('[aria-label="Summary"]')).toBeNull();
  await act(async () => button(container, "Summary")!.click());
  const summary = container.querySelector<HTMLElement>('[aria-label="Summary"]')!;
  expect(summary.textContent).toContain("Finished · 1 (1 merged automatically)");
  expect(summary.textContent).toContain("Ship the report");
  expect(summary.textContent).toContain("MacBook (not reachable)");
});

it("shows the task's details when its title in the summary is clicked", async () => {
  host([task({ status: "done", completedAt: 2, title: "Ship the report" })]);
  saveStoredDailySummary(storedSummary("Ship the report"));
  await render();
  await act(async () => button(container, "Summary")!.click());
  expect(panel()).toBeNull();
  const summary = container.querySelector<HTMLElement>('[aria-label="Summary"]')!;
  await act(async () => button(summary, "Ship the report")!.click());
  expect(panel()!.textContent).toContain("Ship the report");
});

it("builds a fresh summary of the last day on Refresh now, leaving the stored one", async () => {
  const now = Date.now();
  host([
    task({
      id: "new",
      title: "Fresh work",
      status: "done",
      createdAt: now - 5000,
      updatedAt: now - 1000,
      completedAt: now - 1000,
    }),
  ]);
  saveStoredDailySummary(storedSummary("Old work"));
  await render();
  await act(async () => button(container, "Summary")!.click());
  const summary = () =>
    container.querySelector<HTMLElement>('[aria-label="Summary"]')!;
  expect(summary().textContent).toContain("Old work");
  await act(async () => button(summary(), "Refresh now")!.click());
  await act(async () => {});
  expect(summary().textContent).toContain("Fresh work");
  expect(summary().textContent).not.toContain("Old work");
  expect(loadStoredDailySummary()!.finished[0].title).toBe("Old work");
});

it("opens the summary panel when a notification click asked for it", async () => {
  host([]);
  requestSummaryPanel();
  await render();
  expect(container.querySelector('[aria-label="Summary"]')).not.toBeNull();
});
