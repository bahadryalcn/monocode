// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  available: true,
  version: 0,
  listeners: new Set<() => void>(),
  login: vi.fn<() => Promise<void>>(),
  probe: vi.fn<(_options: unknown) => Promise<void>>(),
}));
vi.mock("../../../integrations/harness/core/auth", () => ({
  loginHarness: mock.login,
}));
vi.mock("../../../integrations/harness/core/availability", () => ({
  getHarnessAvailabilitySnapshot: () => mock.version,
  isHarnessAvailable: () => mock.available,
  probeHarnessAvailability: mock.probe,
  subscribeHarnessAvailability: (fn: () => void) => {
    mock.listeners.add(fn);
    return () => mock.listeners.delete(fn);
  },
}));
import { GeminiAccountSettings } from "./GeminiAccountSettings";

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mock.available = true;
  mock.version = 0;
  mock.login.mockReset();
  mock.probe.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
function button(label: string) {
  const item = [
    ...container.querySelectorAll<HTMLButtonElement>("button"),
  ].find((node) => node.textContent === label);
  expect(item).toBeDefined();
  return item!;
}
function render() {
  act(() => root.render(createElement(GeminiAccountSettings)));
}

it("makes Google sign-in discoverable and shows completion only after login resolves", async () => {
  let finish!: () => void;
  mock.login.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render();
  expect(container.textContent).toContain("Gemini account");
  expect(container.textContent).toContain("shared Gemini CLI profile");
  act(() => button("Sign in with Google").click());
  expect(mock.login).toHaveBeenCalledWith("gemini");
  expect(button("Waiting for browser…").disabled).toBe(true);
  expect(container.textContent).not.toContain("Signed in to Gemini");
  await act(async () => finish());
  expect(container.textContent).toContain("Signed in to Gemini");
  expect(container.textContent).toContain("Gemini models are now available");
});

it("shows a failed login and lets the user retry", async () => {
  mock.login
    .mockRejectedValueOnce(new Error("Google sign-in failed"))
    .mockResolvedValueOnce();
  render();
  await act(async () => button("Sign in with Google").click());
  expect(container.textContent).toContain("Google sign-in failed");
  await act(async () => button("Sign in with Google").click());
  expect(container.textContent).toContain("Signed in to Gemini");
  expect(container.textContent).not.toContain("Google sign-in failed");
});

it("shows install instructions and reveals login after rechecking the CLI", async () => {
  mock.available = false;
  mock.probe.mockImplementation(async () => {
    mock.available = true;
    mock.version++;
    for (const listener of mock.listeners) listener();
  });
  render();
  expect(container.textContent).toContain("npm install -g @google/gemini-cli");
  expect(container.textContent).not.toContain("Sign in with Google");
  await act(async () => button("Check installation").click());
  expect(mock.probe).toHaveBeenCalledWith({ force: true });
  expect(button("Sign in with Google").disabled).toBe(false);
});
