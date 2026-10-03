// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LOCAL_SYNC_MACHINE_NAME } from "../../connections/model/localSync";
import type { HostGoal } from "../model/hostGoals";
import type { HostTask } from "../model/hostTasks";
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
  capabilities = ["tasks"],
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

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  invoke.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it("lays tasks out in five columns with the actions each status allows", async () => {
  host([
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
  ).toEqual(["Queued", "Running", "Review", "Done", "Blocked"]);
  const actions = (status: string) =>
    Array.from(column(status).querySelectorAll("button"), (entry) =>
      entry.textContent?.trim(),
    );
  expect(actions("queued")).toEqual(["Edit", "Delete"]);
  expect(actions("running")).toEqual(["Stop"]);
  expect(actions("review")).toEqual(["Approve", "Run again", "Delete"]);
  expect(actions("done")).toEqual(["Run again", "Delete"]);
  expect(actions("blocked")).toEqual(["Retry", "Edit", "Delete"]);
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
  expect(container.querySelectorAll("[data-task-column]")).toHaveLength(5);
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
  expect(button(form, "Add to queue")!.disabled).toBe(true);
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
