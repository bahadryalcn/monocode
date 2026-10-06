// @vitest-environment happy-dom
import { act, createElement, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { newSession } from "../../sessions/model/session";
import {
  leaf,
  placePane,
  selectPaneTab,
  splitPaneAtSelfEdge,
  layoutLeaves,
  type LayoutNode,
} from "../model/layout";
import { PaneTree } from "./PaneTree";

vi.mock("../../files/ui/FilePane", () => ({ FilePane: () => null }));
vi.mock("../../sessions/ui/SessionPane", async () => {
  const { createElement } = await import("react");
  return {
    SessionPane: ({ session, visible, onPaneDragStart }: any) =>
      createElement(
        "div",
        {
          "data-session": session.id,
          "data-visible": String(visible),
        },
        createElement("input", { "data-draft": session.id }),
        createElement(
          "button",
          {
            "data-drag-enabled": String(!!onPaneDragStart),
            onPointerDown: onPaneDragStart,
          },
          "Drag session",
        ),
      ),
  };
});

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function render(layout: LayoutNode, onFocus = vi.fn(), onMovePane = vi.fn()) {
  const noop = vi.fn();
  const props = {
    visible: true,
    layout,
    sessions: ["a", "b"].map((id) => ({
      ...newSession("codex", "/repo"),
      id,
      title: id,
    })),
    editorPanes: [],
    dirtyFileIds: new Set(),
    fileErrorCounts: new Map(),
    focusedId: "a",
    composerFocused: false,
    recents: [],
    onFocus,
    ...Object.fromEntries(
      [
        "onClose",
        "onSelectFile",
        "onCloseFile",
        "onCloseOtherFiles",
        "onReorderFiles",
        "onFileDirtyChange",
        "onFileErrorCountChange",
        "onRatio",
        "onCwdChange",
        "onBranchChange",
        "onModelChange",
        "onModelSettingsChange",
        "onRuntimeModeChange",
        "onSubmit",
        "onStop",
        "onCompactContext",
        "onPlaceSessionInFolder",
        "onDeleteQueuedMessage",
        "onEditQueuedMessage",
        "onQueuedMessageEditingChange",
        "onSteerQueuedMessage",
        "onResumeQueue",
        "onApproval",
        "onQuestionReply",
        "onOpenFile",
        "onOpenDiff",
        "onOpenPlan",
        "onUpdatePlan",
        "onBuildPlan",
        "onMovePane",
        "onDetachPane",
        "onNewTerminal",
      ].map((key) => [key, noop]),
    ),
  } as ComponentProps<typeof PaneTree>;
  props.onMovePane = onMovePane;
  act(() => root.render(createElement(PaneTree, props)));
}

describe("pane docking UI", () => {
  function dragStart() {
    const pane = container.querySelector<HTMLElement>('[data-pane-id="a"]')!;
    const handle = pane.querySelector<HTMLElement>("button")!;
    Object.assign(handle, { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() });
    vi.spyOn(pane, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 400, 300));
    vi.spyOn(document, "elementFromPoint").mockReturnValue(pane);
    pointer(handle, "pointerdown", 200, 15);
  }

  function pointer(target: EventTarget, type: string, x: number, y: number) {
    const event = new Event(type, { bubbles: true });
    Object.assign(event, { pointerId: 1, button: 0, clientX: x, clientY: y, screenX: x, screenY: y });
    act(() => target.dispatchEvent(event));
  }

  it("drags a lone session onto its own edge, previews the split and creates empty space opposite", () => {
    let tree = leaf("a");
    const onMove = vi.fn((fromId, targetId, edge) => {
      expect(fromId).toBe(targetId);
      tree = splitPaneAtSelfEdge(tree, fromId, edge, "empty");
    });
    render(tree, vi.fn(), onMove);
    dragStart();
    pointer(window, "pointermove", 20, 150);
    expect(document.querySelector('.pointer-drop-hint[data-action="move"]')?.textContent).toContain("Split left");
    expect(container.querySelector('.pointer-events-none.absolute.inset-0')).not.toBeNull();
    pointer(window, "pointerup", 20, 150);
    expect(onMove).toHaveBeenCalledWith("a", "a", "left");
    expect(layoutLeaves(tree).map((pane) => pane.id)).toEqual(["a", "empty"]);
    expect(document.querySelector(".pointer-drop-hint")).toBeNull();
    expect(document.documentElement.classList.contains("is-grabbing")).toBe(false);
  });

  it("blocks the self-center target and resets feedback when cancelled", () => {
    const onMove = vi.fn();
    render(leaf("a"), vi.fn(), onMove);
    dragStart();
    pointer(window, "pointermove", 200, 150);
    expect(document.querySelector('.pointer-drop-hint[data-action="blocked"]')).not.toBeNull();
    pointer(window, "pointerup", 200, 150);
    expect(onMove).not.toHaveBeenCalled();
    dragStart();
    pointer(window, "pointermove", 390, 150);
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(onMove).not.toHaveBeenCalled();
    expect(document.querySelector(".pointer-drop-hint")).toBeNull();
    expect(document.body.style.cursor).toBe("");
  });

  it("treats a click without pointer travel as selection without a split", () => {
    const onMove = vi.fn();
    render(leaf("a"), vi.fn(), onMove);
    dragStart();
    pointer(window, "pointerup", 200, 15);
    expect(onMove).not.toHaveBeenCalled();
  });
  it("enables the drag handle with only a single pane", () => {
    render(leaf("a"));
    expect(
      container.querySelector('[data-drag-enabled="true"]'),
    ).not.toBeNull();
  });

  it("switches a local group tab while retaining both mounted drafts", () => {
    const tree = placePane(leaf("a"), "b", "a", "center");
    const onFocus = vi.fn();
    render(tree, onFocus);
    const draft =
      container.querySelector<HTMLInputElement>('[data-draft="b"]')!;
    draft.value = "unsent work";
    const aTab = container.querySelector<HTMLButtonElement>('[role="tab"]')!;
    act(() => aTab.click());
    expect(onFocus).toHaveBeenCalledWith("a");
    render(selectPaneTab(tree, "a"), onFocus);
    expect(container.querySelector('[data-draft="b"]')).toBe(draft);
    expect(draft.value).toBe("unsent work");
    expect(
      container
        .querySelector('[data-session="a"]')
        ?.getAttribute("data-visible"),
    ).toBe("true");
    expect(
      container
        .querySelector('[data-session="b"]')
        ?.getAttribute("data-visible"),
    ).toBe("false");
  });
});
