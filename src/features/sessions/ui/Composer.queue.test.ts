// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: () => ({ onDragDropEvent: async () => () => {} }),
}));
vi.mock("../../source-control/hooks/useProjectBranches", () => ({
  useProjectBranchesState: () => ({
    branches: { current: "main", detached: false, branches: [] },
    settled: true,
  }),
}));

import { Composer, ComposerAction } from "./Composer";
import { setHarnessModeLimits } from "../model/session";
import {
  savePromptTemplates,
  type PromptTemplate,
} from "../model/promptTemplates";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  setHarnessModeLimits("antigravity", undefined);
  vi.unstubAllGlobals();
});

async function renderComposer(
  props: {
    harness?: "claude" | "antigravity";
    busy?: boolean;
    backgroundOnly?: boolean;
  },
  onSubmit: (...args: unknown[]) => boolean | void,
) {
  await act(async () =>
    root.render(
      createElement(Composer, {
        focused: true,
        harness: props.harness ?? "claude",
        model: "m",
        runtimeMode: "supervised",
        executionCwd: "/repo",
        sessionId: "s1",
        busy: props.busy,
        backgroundOnly: props.backgroundOnly,
        hideProjectPicker: true,
        hideBranchPicker: true,
        onFocus: () => {},
        onCwdChange: () => {},
        onModelChange: () => {},
        onRuntimeModeChange: () => {},
        onSubmit: onSubmit as never,
      }),
    ),
  );
  return container.querySelector("textarea")!;
}

async function type(textarea: HTMLTextAreaElement, text: string) {
  await act(async () => {
    textarea.value = text;
    textarea.setSelectionRange(text.length, text.length);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function press(textarea: HTMLTextAreaElement, init: KeyboardEventInit) {
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    ...init,
  });
  act(() => {
    textarea.dispatchEvent(event);
  });
  return event;
}

describe("Shift+Tab queues while a turn runs", () => {
  const shiftTab = { key: "Tab", code: "Tab", shiftKey: true };

  it("queues the typed message regardless of the follow-up setting", async () => {
    localStorage.setItem("monocode.followUpBehavior", "steer");
    const onSubmit = vi.fn(() => true);
    const textarea = await renderComposer({ busy: true }, onSubmit);
    await type(textarea, "then add tests");

    const event = press(textarea, shiftTab);
    await act(async () => {});

    expect(event.defaultPrevented).toBe(true);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(
      "then add tests",
      [],
      expect.objectContaining({ followUpBehavior: "queue" }),
    );
  });

  it("keeps Shift+Tab in the composer without sending when idle, empty, or background-only", async () => {
    const onSubmit = vi.fn(() => true);
    const idle = await renderComposer({ busy: false }, onSubmit);
    await type(idle, "hello");
    expect(press(idle, shiftTab).defaultPrevented).toBe(true);

    const empty = await renderComposer({ busy: true }, onSubmit);
    await type(empty, "");
    expect(press(empty, shiftTab).defaultPrevented).toBe(true);

    const bg = await renderComposer({ busy: true, backgroundOnly: true }, onSubmit);
    await type(bg, "hello");
    expect(press(bg, shiftTab).defaultPrevented).toBe(true);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("leaves Enter to the follow-up setting", async () => {
    const onSubmit = vi.fn(() => true);
    const textarea = await renderComposer({ busy: true }, onSubmit);
    await type(textarea, "go on");
    press(textarea, { key: "Enter", code: "Enter" });
    await act(async () => {});
    expect(onSubmit).toHaveBeenCalledWith(
      "go on",
      [],
      expect.not.objectContaining({ followUpBehavior: "queue" }),
    );
  });
});

describe("ComposerAction queue entry", () => {
  const render = (onQueue?: () => void) =>
    renderToStaticMarkup(
      createElement(ComposerAction, {
        busy: true,
        hasValue: true,
        onSend: vi.fn(),
        onQueue,
        queueShortcut: "Shift+Tab",
        onStop: vi.fn(),
      }),
    );

  it("offers Queue with its shortcut next to Send while busy", () => {
    const html = render(vi.fn());
    expect(html).toContain('aria-label="Queue message"');
    expect(html).toContain("(Shift+Tab)");
    expect(html).toContain('aria-label="Send"');
  });

  it("omits Queue when queueing does not apply", () => {
    expect(render(undefined)).not.toContain("Queue message");
  });
});

describe("typed /plan on a transport that cannot plan", () => {
  it("shows the Plan button's reason and starts no turn", async () => {
    setHarnessModeLimits("antigravity", { plan: "stream-json cannot plan" });
    const onSubmit = vi.fn(() => true);
    const textarea = await renderComposer({ harness: "antigravity" }, onSubmit);
    await type(textarea, "/plan refactor the parser");
    press(textarea, { key: "Enter", code: "Enter" });
    await act(async () => {});

    expect(onSubmit).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "stream-json cannot plan",
    );
    expect(textarea.value).toBe("/plan refactor the parser");
  });

  it("still plans where the transport can", async () => {
    const onSubmit = vi.fn(() => true);
    const textarea = await renderComposer({}, onSubmit);
    await type(textarea, "/plan refactor the parser");
    press(textarea, { key: "Enter", code: "Enter" });
    await act(async () => {});
    expect(onSubmit).toHaveBeenCalledWith(
      "refactor the parser",
      [],
      expect.objectContaining({ intent: "plan" }),
    );
  });
});

describe("prompt templates in the composer", () => {
  const template: PromptTemplate = {
    id: "t1",
    name: "Review",
    body: "Review {{cursor}} for bugs",
    trigger: "rev",
  };

  it("expands ;trigger on space and parks the caret on {{cursor}}", async () => {
    savePromptTemplates([template]);
    const textarea = await renderComposer({}, vi.fn());
    await type(textarea, "please ;rev");
    const event = press(textarea, { key: " ", code: "Space" });

    expect(event.defaultPrevented).toBe(true);
    expect(textarea.value).toBe("please Review  for bugs");
    expect(textarea.selectionStart).toBe("please Review ".length);
  });

  it("leaves a space alone when the word is not a trigger", async () => {
    savePromptTemplates([template]);
    const textarea = await renderComposer({}, vi.fn());
    await type(textarea, "please ;nope");
    expect(press(textarea, { key: " ", code: "Space" }).defaultPrevented).toBe(false);
  });
});
