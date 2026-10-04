// @vitest-environment happy-dom
import { EditorView } from "@codemirror/view";
import type * as TauriCore from "@tauri-apps/api/core";
import { Storage } from "happy-dom";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileEditor } from "./FileEditor";
import { setRemoteCommandRunner } from "../../../platform/tauri/fs";

const bridge = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", async (original) => ({
  ...(await original<typeof TauriCore>()),
  invoke: async (command: string, args?: Record<string, unknown>) => bridge.invoke(command, args),
}));

describe("HTML Go Live", () => {
  let root: Root;
  let container: HTMLDivElement;
  let disk: string;
  let saveError: boolean;
  let chromeError: boolean;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const storage = new Storage();
    storage.setItem("monocode.formatOnSave", "0");
    storage.setItem("monocode.autosave", "0");
    vi.stubGlobal("localStorage", storage);
    disk = "<h1>Hello</h1>\r\n";
    saveError = false;
    chromeError = false;
    bridge.invoke.mockReset();
    bridge.invoke.mockImplementation((command, args) => {
      if (command === "read_text_file") return disk;
      if (command === "stat_files" || command === "git_conflicts") return [];
      if (command === "write_text_file") {
        if (saveError) throw new Error("Disk full");
        disk = args.content;
        return;
      }
      if (command === "open_html_in_chrome") {
        if (chromeError) throw new Error("Google Chrome is not installed");
        return;
      }
      throw new Error(`Unexpected command: ${command}`);
    });
    setRemoteCommandRunner(async (command, args) => bridge.invoke(command, args));
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    setRemoteCommandRunner(async () => { throw new Error("No remote test connection"); });
    vi.unstubAllGlobals();
  });

  async function render(path = "/repo/store/gallery.html") {
    await act(async () => root.render(createElement(FileEditor, {
      path, cwd: "/repo", active: true, onDirtyChange: () => {},
    })));
    await act(async () => vi.waitFor(() => expect(container.querySelector(".cm-editor")).not.toBeNull()));
  }
  const button = () => [...container.querySelectorAll("button")].find((item) => item.textContent === "Go Live");
  const opened = () => bridge.invoke.mock.calls.filter(([command]) => command === "open_html_in_chrome");
  async function edit() {
    await act(async () => {
      const view = EditorView.findFromDOM(container.querySelector<HTMLElement>(".cm-editor")!)!;
      view.dispatch({ changes: { from: 4, to: 9, insert: "Updated" } });
    });
  }
  async function click() {
    await act(async () => button()!.click());
  }

  it.each(["gallery.html", "gallery.HTM"])("opens the selected %s in Chrome", async (name) => {
    const path = `/repo/store/${name}`;
    await render(path);
    await click();
    expect(opened()).toEqual([["open_html_in_chrome", { path }]]);
  });

  it("saves the edited document with its line endings before opening", async () => {
    await render();
    await edit();
    await click();
    expect(disk).toBe("<h1>Updated</h1>\r\n");
    const commands = bridge.invoke.mock.calls.map(([command]) => command);
    expect(commands.indexOf("write_text_file")).toBeLessThan(commands.indexOf("open_html_in_chrome"));
    expect(container.textContent).toContain("Saved");
  });

  it("keeps Chrome closed when saving fails", async () => {
    await render();
    await edit();
    saveError = true;
    await click();
    expect(opened()).toHaveLength(0);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Save the file successfully");
    expect(container.textContent).toContain("Disk full");
  });

  it("shows Chrome errors and allows retry", async () => {
    await render();
    chromeError = true;
    await click();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Chrome is not installed");
    chromeError = false;
    await click();
    expect(opened()).toHaveLength(2);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("does not offer Go Live for other file types", async () => {
    await render("/repo/script.js");
    expect(button()).toBeUndefined();
  });

  it("disables local Chrome launch for remote HTML", async () => {
    await render("remote://machine/repo/gallery.html");
    expect(button()?.disabled).toBe(true);
    expect(opened()).toHaveLength(0);
  });
});
