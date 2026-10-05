// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ProjectRail } from "./ProjectRail";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => undefined),
}));
vi.mock("../../features/source-control/hooks/useProjectDiffStats", () => ({
  useProjectDiffStats: () => null,
}));
vi.mock("./SidebarUpdate", () => ({ SidebarUpdateFooter: () => null }));

it("places Working between Search and Inbox and preserves project navigation when collapsed", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const onSelectProject = vi.fn();
  try {
    await act(async () =>
      root.render(
        createElement(ProjectRail, {
          cwd: "/work/project",
          recents: [],
          onSelectProject,
          onOpenProject: vi.fn(),
          onSearch: vi.fn(),
          onOpenInbox: vi.fn(),
          liveAgents: [
            {
              id: "background",
              cwd: "/work/project",
              title: "Review changes",
              harness: "codex",
              activity: "Working",
              needsApproval: false,
              done: false,
            },
          ],
        }),
      ),
    );
    const search = container.querySelector('button[aria-label^="Search ("]')!;
    const preview = container.querySelector(
      '[data-live-agents-preview="full"]',
    )!;
    const inbox = container.querySelector('button[aria-label="Inbox"]')!;
    expect(
      search.compareDocumentPosition(preview) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      preview.compareDocumentPosition(inbox) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      container.querySelectorAll('[data-live-agents-preview="full"]'),
    ).toHaveLength(1);
    const header = preview.querySelector<HTMLButtonElement>(
      "button[aria-expanded]",
    )!;
    act(() => header.click());
    expect(header.getAttribute("aria-expanded")).toBe("false");
    const project = container.querySelector<HTMLButtonElement>(
      '[data-project-path="/work/project"] > button',
    )!;
    expect(project.closest("[hidden]")).toBeNull();
    act(() => project.click());
    expect(onSelectProject).toHaveBeenCalledWith("/work/project");
  } finally {
    act(() => root.unmount());
    container.remove();
    localStorage.clear();
    vi.unstubAllGlobals();
  }
});
