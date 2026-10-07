// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type { ProjectTerminalDock as Dock } from "../../projects/model/projectTerminal";

vi.mock("../../../shared/ui/lazySurface", () => ({
  lazySurface: () => () => null,
}));
vi.mock("../../../app/shell/TitleBar", () => ({
  IconButton: ({ label, onClick }: { label: string; onClick: () => void }) =>
    createElement("button", { "aria-label": label, onClick }),
}));
vi.mock("../model/terminalProfiles", () => ({
  useTerminalProfiles: () => null,
  useTerminalProfile: () => undefined,
  effectiveProfileId: () => undefined,
}));
import { ProjectTerminalDock } from "./ProjectTerminalDock";

it("selects terminals with vertical keyboard navigation and closes the active terminal", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const onSelectTerminal = vi.fn();
  const onCloseTerminal = vi.fn();
  const dock = {
    projectPath: "/project",
    side: "bottom",
    size: 220,
    open: true,
    pane: {
      id: "pane",
      activeFileId: "one",
      files: [
        { id: "one", path: "Terminal 1", cwd: "/project", terminal: true },
        { id: "two", path: "Terminal 2", cwd: "/project", terminal: true },
      ],
    },
  } as Dock;
  try {
    await act(async () => {
      root.render(
        createElement(ProjectTerminalDock, {
          dock,
          focused: false,
          onFocus: vi.fn(),
          onHide: vi.fn(),
          onSideChange: vi.fn(),
          onSizePaint: vi.fn(),
          onSizeCommit: vi.fn(),
          onAddTerminal: vi.fn(),
          onSelectTerminal,
          onCloseTerminal,
          onCloseOtherTerminals: vi.fn(),
          onReorderTerminals: vi.fn(),
        }),
      );
    });
    const tabs = host.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    expect(tabs).toHaveLength(2);
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    expect(
      host.querySelector('[role="tablist"]')?.getAttribute("aria-orientation"),
    ).toBe("vertical");
    await act(async () => {
      tabs[0].dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }),
      );
    });
    expect(onSelectTerminal).toHaveBeenCalledWith("two");
    expect(document.activeElement).toBe(tabs[1]);
    await act(async () => {
      host
        .querySelector<HTMLButtonElement>(
          '[aria-label="Close Active Terminal"]',
        )
        ?.click();
    });
    expect(onCloseTerminal).toHaveBeenCalledWith("one");
    expect(
      host.querySelector('[role="tabpanel"]')?.getAttribute("aria-labelledby"),
    ).toBe(tabs[0].id);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
