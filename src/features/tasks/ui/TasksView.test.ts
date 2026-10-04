// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LOCAL_SYNC_MACHINE_NAME } from "../../connections/model/localSync";
import type { HostGoal } from "../model/hostGoals";
import type { HostTask } from "../model/hostTasks";
import { invalidateMachineSnapshot } from "../../automations/model/machineSnapshot";
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
    if (args.method === "tasks.move")
      return { ...tasks[0], status: args.params.to };
    if (args.method === "tasks.delete") {
      tasks.splice(0);
      return { deleted: true };
    }
    return {};
  });
  return requests;
}

async function render() {
  await act(async () =>
    root.render(
      createElement(TasksView, {
        cwd: "/work/project",
        recents: [],
        onClose: vi.fn(),
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
  ]);
  expect(boxes.map((box) => box.checked)).toEqual([true, true]);
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
  ]);
  expect(boxes.map((box) => box.checked)).toEqual([false, true]);
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
