// @vitest-environment happy-dom
import { act, createElement, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Sidebar } from "./Sidebar";
import { rememberRemoteProject } from "../../features/connections/model/remoteProjects";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("../../features/source-control/hooks/useProjectDiffStats", () => ({
  useProjectDiffStats: vi.fn(() => null),
}));
vi.mock("../../features/source-control/hooks/useGitFileStatuses", () => ({
  useGitFileStatuses: () => ({ files: new Map(), dirs: new Map() }),
}));
vi.mock("./SidebarUpdate", () => ({ SidebarUpdateFooter: () => null }));
vi.mock("../../features/files/ui/FileTree", () => ({ FileTree: () => null }));

let container: HTMLDivElement;
let root: Root;
let answer: (value: unknown) => void;
let refuse: (reason: unknown) => void;

const machine = {
  id: "mac",
  name: "MacBook",
  endpoint: "ssh://me@mac",
  environmentId: "env-mac",
  ssh: { target: "me@mac", port: null, remotePort: 3774 },
};

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  vi.mocked(invoke).mockReset();
  vi.mocked(invoke).mockImplementation(async (command, args) => {
    if (command === "remote_machines") return [machine];
    const method = (args as { method?: string } | undefined)?.method;
    if (command === "remote_request" && method === "sessions.list")
      return new Promise((resolve, reject) => {
        answer = resolve;
        refuse = reject;
      });
    return undefined;
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  localStorage.clear();
  vi.unstubAllGlobals();
});

async function renderRemoteProject() {
  const project = rememberRemoteProject("env-mac", {
    id: "p1",
    cwd: "/Users/me/clinic",
    name: "clinic",
  });
  const props = {
    cwd: project.key,
    open: true,
    sessions: [],
    busySessionIds: new Set<string>(),
    approvalSessionIds: new Set<string>(),
    status: "idle",
    pending: false,
    tab: "sessions",
    filesSearchOpen: false,
    onSelectSession: vi.fn(),
    onRenameSession: vi.fn(),
    onOpenFile: vi.fn(),
    onTabChange: vi.fn(),
    onFilesSearchOpenChange: vi.fn(),
  } as unknown as ComponentProps<typeof Sidebar>;
  await act(async () => root.render(createElement(Sidebar, props)));
  await act(async () => {});
}

it("says it is loading a remote project's sessions until they arrive", async () => {
  await renderRemoteProject();
  expect(container.textContent).toContain("Loading sessions from MacBook…");
  expect(container.textContent).not.toContain("isn’t connected");

  await act(async () =>
    answer([
      {
        id: "s1",
        projectId: "p1",
        revision: 1,
        status: "idle",
        updatedAt: Date.now(),
        title: "Fix the build",
        harness: "claude",
      },
    ]),
  );
  await act(async () => {});
  expect(container.textContent).not.toContain("Loading sessions");
  expect(container.textContent).toContain("Fix the build");
});

it("says the machine did not answer instead of loading forever", async () => {
  await renderRemoteProject();
  await act(async () => refuse(new Error("ssh: connect timed out")));
  await act(async () => {});
  expect(container.textContent).not.toContain("Loading sessions");
  expect(container.textContent).toContain("Couldn’t reach MacBook. Trying again…");
});
