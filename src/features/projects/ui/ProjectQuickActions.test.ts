// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, expect, it, vi } from "vitest";
import { ProjectQuickActions } from "./ProjectQuickActions";
import {
  listExternalEditors,
  openInExternalEditor,
} from "../../../platform/tauri/fs";
import { saveProjectActions } from "../model/projectActions";
import { openUrl } from "@tauri-apps/plugin-opener";
vi.mock("../../../platform/tauri/fs", () => ({
  listExternalEditors: vi.fn(async () => [{ id: "cursor", name: "Cursor" }]),
  openInExternalEditor: vi.fn(async () => {}),
  revealPath: vi.fn(async () => {}),
}));
vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(async () => {}),
}));
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});
it("discovers editors on demand and opens the current folder", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(createElement(ProjectQuickActions, { cwd: "C:/project" })),
    );
    expect(listExternalEditors).not.toHaveBeenCalled();
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>('[aria-label="Open project in"]')!
        .click(),
    );
    const editor = [...document.querySelectorAll("button")].find(
      (button) => button.textContent === "Cursor",
    )!;
    await act(async () => editor.click());
    expect(openInExternalEditor).toHaveBeenCalledWith("cursor", "C:/project");
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
it("runs a saved action and hides local controls for remote projects", async () => {
  const action = {
    id: "test",
    name: "Tests",
    icon: "play" as const,
    command: "pnpm test",
    url: "",
  };
  saveProjectActions("C:/project", [action]);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const onRun = vi.fn();
  try {
    await act(async () =>
      root.render(
        createElement(ProjectQuickActions, {
          cwd: "C:/project-worktree",
          actionsCwd: "C:/project",
          onRun,
        }),
      ),
    );
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>('[aria-label="Run Tests"]')!
        .click(),
    );
    expect(onRun).toHaveBeenCalledWith(action);
    const openButton = host.querySelector<HTMLButtonElement>('[aria-label="Open project in"]')!;
    expect(openButton.textContent).toBe("");
    expect(openButton.title).toContain("C:/project-worktree");
    await act(async () =>
      root.render(
        createElement(ProjectQuickActions, {
          cwd: "remote://machine/project",
          onRun,
        }),
      ),
    );
    expect(host.textContent).toBe("");
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it("runs a shortcut once and respects the browser-opening preference", async () => {
  saveProjectActions("C:/project", [
    {
      id: "shortcut",
      name: "Dev",
      icon: "play",
      command: "pnpm dev",
      url: "http://localhost:5173",
      shortcut: "Control+Option+KeyY",
      openUrlOnRun: false,
    },
  ]);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const onRun = vi.fn();
  try {
    await act(async () =>
      root.render(
        createElement(ProjectQuickActions, {
          cwd: "C:/project",
          onRun,
          shortcutsEnabled: false,
        }),
      ),
    );
    await act(async () =>
      window.dispatchEvent(new KeyboardEvent("keydown", {
        code: "KeyY", ctrlKey: true, altKey: true,
        bubbles: true, cancelable: true,
      })),
    );
    expect(onRun).not.toHaveBeenCalled();
    await act(async () =>
      root.render(
        createElement(ProjectQuickActions, { cwd: "C:/project", onRun }),
      ),
    );
    await act(async () =>
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          code: "KeyY",
          ctrlKey: true,
          altKey: true,
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    expect(onRun).toHaveBeenCalledTimes(1);
    expect(openUrl).not.toHaveBeenCalled();
    await act(async () =>
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          code: "KeyY",
          ctrlKey: true,
          altKey: true,
          repeat: true,
          bubbles: true,
        }),
      ),
    );
    expect(onRun).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
