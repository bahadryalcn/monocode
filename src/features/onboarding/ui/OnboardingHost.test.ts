// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { OnboardingHost } from "./OnboardingHost";
import {
  OPEN_ONBOARDING_EVENT,
  shouldShowOnboarding,
} from "../model/onboarding";

vi.mock("./OnboardingDialog", () => ({
  default: ({ onFinish }: { onFinish: () => void }) =>
    createElement("button", { onClick: onFinish }, "Finish setup"),
}));
const fresh = { projects: 0, sessions: 0, restored: false, transferred: false };
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  localStorage.clear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
async function render(projects = 0) {
  await act(async () =>
    root.render(
      createElement(OnboardingHost, {
        context: { ...fresh, projects },
        onImported: vi.fn(),
        onOpenProject: vi.fn(),
      }),
    ),
  );
}
it("shows fresh setup, dismisses it and allows reopening from Settings", async () => {
  await render();
  expect(container.textContent).toContain("Finish setup");
  await act(async () => container.querySelector("button")!.click());
  expect(container.textContent).toBe("");
  expect(shouldShowOnboarding(fresh)).toBe(false);
  await act(async () => window.dispatchEvent(new Event(OPEN_ONBOARDING_EVENT)));
  expect(container.textContent).toContain("Finish setup");
});
it("records an existing installation and doesn't show setup after its projects are cleared", async () => {
  await render(1);
  expect(container.textContent).toBe("");
  expect(shouldShowOnboarding(fresh)).toBe(false);
  await render();
  expect(container.textContent).toBe("");
});
