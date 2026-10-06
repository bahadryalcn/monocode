// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWindowDragPreview } from "./useWindowDragPreview";
import type { WindowTabDragHover } from "./windowDragPreview";
import { getExternalPaneDrop, getExternalTitleTabDrop, clearWindowDragPreview } from "../../features/workspace/model/paneDrop";

const mocked = vi.hoisted(() => ({ listener: undefined as ((event: { payload: any }) => void) | undefined }));
vi.mock("@tauri-apps/api/webviewWindow", () => ({ getCurrentWebviewWindow: () => ({
  listen: vi.fn((_event, callback) => { mocked.listener = callback; return Promise.resolve(vi.fn()); }),
}) }));

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let pane: HTMLDivElement;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div"); document.body.append(container);
  pane = document.createElement("div"); pane.dataset.paneId = "target"; container.append(pane);
  vi.spyOn(pane, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 400, 300));
  vi.spyOn(document, "elementFromPoint").mockReturnValue(pane);
  const host = document.createElement("div"); container.append(host);
  root = createRoot(host);
  function Preview() { useWindowDragPreview(); return null; }
  act(() => root.render(createElement(Preview)));
});
afterEach(() => {
  act(() => root.unmount()); clearWindowDragPreview(); container.remove();
  vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});
function hover(revision: number, values: Partial<WindowTabDragHover> = {}) {
  act(() => mocked.listener!({ payload: {
    sourceWindowLabel: "secondary", sourceId: "source", dragId: "gesture", revision,
    x: 10, y: 150, ended: false, ...values,
  } }));
}

describe("cross-window destination preview", () => {
  it("paints edge and center targets, ignores stale events and clears on end", () => {
    hover(10);
    expect(getExternalPaneDrop()).toMatchObject({ overId: "target", edge: "left" });
    hover(11, { x: 200 });
    expect(getExternalPaneDrop()?.edge).toBe("center");
    hover(10, { ended: true });
    expect(getExternalPaneDrop()).not.toBeNull();
    hover(12, { ended: true });
    expect(getExternalPaneDrop()).toBeNull();
  });

  it("shows a title insertion marker with exact before/after placement", () => {
    const strip = document.createElement("div"); strip.dataset.titleTabStrip = "";
    const tab = document.createElement("div"); tab.dataset.titleTabId = "target-tab";
    strip.append(tab); container.append(strip);
    vi.spyOn(tab, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 100, 30));
    vi.mocked(document.elementFromPoint).mockReturnValue(tab);
    hover(20, { x: 20, y: 15 });
    expect(getExternalPaneDrop()).toBeNull();
    expect(getExternalTitleTabDrop()).toMatchObject({ targetTabId: "target-tab", position: "before" });
    hover(21, { x: 80, y: 15 });
    expect(getExternalTitleTabDrop()?.position).toBe("after");
    hover(22, { ended: true });
    expect(getExternalTitleTabDrop()).toBeNull();
  });

  it("keeps stationary heartbeats visible and clears a crashed source", () => {
    hover(30);
    act(() => vi.advanceTimersByTime(1000)); hover(31);
    act(() => vi.advanceTimersByTime(1000));
    expect(getExternalPaneDrop()).not.toBeNull();
    act(() => vi.advanceTimersByTime(801));
    expect(getExternalPaneDrop()).toBeNull();
  });
});
