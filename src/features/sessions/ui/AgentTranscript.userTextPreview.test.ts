// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AgentTranscript } from "./AgentTranscript";

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it("bounds the chat and focus preview, opens the exact full text, and copies the original", async () => {
  const text = "Start\n" + "Long content ".repeat(200) + "\nEND OF MESSAGE";
  act(() =>
    root.render(
      createElement(AgentTranscript, {
        blocks: [{ id: "prompt", role: "user", text }],
      }),
    ),
  );
  const trigger = container.querySelector<HTMLButtonElement>(
    '[aria-label="Show full long text"]',
  )!;
  expect(trigger).not.toBeNull();
  expect(container.textContent).not.toContain("END OF MESSAGE");
  act(() => trigger.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })));
  expect(trigger.getAttribute("aria-describedby")).not.toBeNull();
  act(() => trigger.focus());
  const preview = document.getElementById(
    trigger.getAttribute("aria-describedby")!,
  );
  expect(preview?.textContent).toContain("Long text preview");
  expect(preview?.textContent).not.toContain("END OF MESSAGE");
  act(() => trigger.click());
  expect(document.querySelector('[role="dialog"] pre')?.textContent).toBe(text);
  act(() =>
    document.querySelector<HTMLButtonElement>('[aria-label="Close"]')!.click(),
  );
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(trigger);
  expect(trigger.getAttribute("aria-describedby")).toBeNull();
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('[aria-label="Copy message"]')!
      .click(),
  );
  expect(await navigator.clipboard.readText()).toBe(text);
});

it("detects JSON in a message while keeping the surrounding instructions visible", () => {
  const text = 'Review this:\n```json\n{"a":1}\n```\nKeep the key.';
  act(() =>
    root.render(
      createElement(AgentTranscript, {
        blocks: [{ id: "json", role: "user", text }],
      }),
    ),
  );
  expect(container.textContent).toContain("Review this:");
  expect(container.textContent).toContain("Keep the key.");
  const trigger = container.querySelector<HTMLButtonElement>(
    '[aria-label="Show full json"]',
  )!;
  expect(trigger).not.toBeNull();
  act(() => trigger.click());
  expect(document.querySelector('[role="dialog"] pre')?.textContent).toBe(
    '```json\n{"a":1}\n```',
  );
});
