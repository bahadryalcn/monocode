// @vitest-environment happy-dom
import { act, createElement, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Block } from "../model/session";
import { ActivityDock } from "./ActivityDock";

let container: HTMLDivElement;
let root: Root;

const user: Block = { id: "u1", role: "user", text: "go", startedAt: 1_000 };
const agent: Block = {
  id: "a1",
  role: "tool",
  text: "Agent: Side-by-side diff",
  tool: { callId: "a1", kind: "agent", status: "in_progress" },
  agentRun: { name: "Side-by-side diff", steps: [] },
};

function props(
  patch: Partial<ComponentProps<typeof ActivityDock>> = {},
): ComponentProps<typeof ActivityDock> {
  return {
    sessionId: "s1",
    blocks: [user],
    busy: false,
    pendingQuestion: false,
    atEnd: true,
    onOpenAgent: () => {},
    ...patch,
  };
}

function render(patch?: Partial<ComponentProps<typeof ActivityDock>>) {
  act(() =>
    root.render(
      createElement(
        "div",
        { "data-composer": "" },
        createElement("textarea"),
        createElement(ActivityDock, props(patch)),
      ),
    ),
  );
}

const dock = () => container.querySelector("[data-activity-dock]");

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("ActivityDock", () => {
  it("renders nothing for a session that was idle when opened", () => {
    render();
    expect(dock()).toBeNull();
  });

  it("keeps Done up after work finishes until the composer is focused", () => {
    render({ busy: true });
    expect(dock()?.getAttribute("data-activity-dock")).toBe("working");

    render({ busy: false });
    expect(dock()?.getAttribute("data-activity-dock")).toBe("done");

    act(() => {
      container
        .querySelector("textarea")
        ?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    });
    expect(dock()).toBeNull();
  });

  it("clears Done when the reader scrolls back to the end", () => {
    render({ busy: true, atEnd: false });
    render({ busy: false, atEnd: false });
    expect(dock()?.getAttribute("data-activity-dock")).toBe("done");
    render({ busy: false, atEnd: true });
    expect(dock()).toBeNull();
  });

  it("announces the state in a polite live region", () => {
    render({ busy: true, pendingQuestion: true });
    const live = container.querySelector("[aria-live='polite']");
    expect(live?.textContent).toBe("Needs your input");
  });

  it("lists agents behind a button and opens one on click", () => {
    const onOpenAgent = vi.fn();
    render({ busy: true, blocks: [user, agent], onOpenAgent });
    expect(container.querySelector("[data-dock-agent]")).toBeNull();

    const chip = container.querySelector<HTMLButtonElement>(
      "button[aria-expanded]",
    );
    expect(chip?.textContent).toContain("1 running");
    act(() => chip?.click());

    const row = container.querySelector<HTMLButtonElement>(
      "[data-dock-agent='a1']",
    );
    expect(row?.getAttribute("aria-label")).toContain("Side-by-side diff");
    act(() => row?.click());
    expect(onOpenAgent).toHaveBeenCalledWith("a1");
  });
});
