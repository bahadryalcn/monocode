// @vitest-environment happy-dom
import { EditorView } from "@codemirror/view";
import type * as TauriCore from "@tauri-apps/api/core";
import { Storage } from "happy-dom";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileEditor } from "./FileEditor";

const bridge = vi.hoisted(() => ({
  invoke: (_command: string, _args?: Record<string, unknown>): unknown =>
    undefined,
}));
vi.mock("@tauri-apps/api/core", async (original) => ({
  ...(await original<typeof TauriCore>()),
  invoke: async (command: string, args?: Record<string, unknown>) =>
    bridge.invoke(command, args),
}));

const CWD = "/repo";
const PATH = `${CWD}/notes.txt`;
const CONFLICTED = [
  "top",
  "<<<<<<< HEAD",
  "mine",
  "=======",
  "theirs",
  ">>>>>>> feature",
  "middle",
  "<<<<<<< HEAD",
  "m2",
  "=======",
  "t2",
  ">>>>>>> feature",
  "end",
  "",
].join("\r\n");

describe("merge conflicts and blame in the file editor", () => {
  let root: Root;
  let container: HTMLDivElement;
  let disk: string;
  let unmerged: string[];
  let calls: { command: string; args?: Record<string, unknown> }[];
  let blameResult: unknown;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const storage = new Storage();
    storage.setItem("monocode.diffLayout", "split");
    storage.setItem("monocode.formatOnSave", "0");
    storage.setItem("monocode.autosave", "0");
    vi.stubGlobal("localStorage", storage);
    calls = [];
    unmerged = ["notes.txt"];
    blameResult = [
      {
        line: 1,
        sha: "a".repeat(40),
        shortSha: "aaaaaaa",
        author: "Ann",
        timestamp: 1_700_000_000,
        summary: "first",
      },
    ];
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    bridge.invoke = (command, args) => {
      calls.push({ command, args });
      if (command === "read_text_file") return disk;
      if (command === "stat_files") return [];
      if (command === "git_diff_files") {
        return {
          files: [{ relative: "notes.txt", staged: false, unstaged: true }],
        };
      }
      if (command === "git_file_diff") {
        return {
          original: "top\nend\n",
          current: disk,
          binary: false,
          tooLarge: false,
        };
      }
      if (command === "write_text_file") {
        disk = args?.content as string;
        return;
      }
      if (command === "git_conflicts") return unmerged;
      if (command === "git_stage_file") {
        unmerged = [];
        return;
      }
      if (command === "git_blame") {
        if (blameResult instanceof Error) throw blameResult;
        return blameResult;
      }
      throw new Error(`Unexpected native command: ${command}`);
    };
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function render(cwd = CWD, showDiff = true) {
    await act(async () =>
      root.render(
        createElement(FileEditor, {
          path: PATH,
          cwd,
          active: true,
          showDiff,
          onDirtyChange: () => {},
        }),
      ),
    );
    await act(async () =>
      vi.waitFor(() =>
        expect(container.querySelector(".cm-editor")).not.toBeNull(),
      ),
    );
  }

  const view = () =>
    EditorView.findFromDOM(
      container.querySelector<HTMLElement>(".cm-editor")!,
    )!;
  const conflictStatus = () =>
    container.querySelector('[aria-label="Merge conflicts"] [role="status"]')
      ?.textContent;
  const blameToggle = () =>
    container.querySelector<HTMLButtonElement>(
      'button[aria-label="Git blame"]',
    )!;
  const buttonByText = (text: string) =>
    [...container.querySelectorAll("button")].find(
      (button) => button.textContent === text,
    );
  const gutterText = () =>
    container.querySelector(".cm-blameGutter")?.textContent;

  it("falls back to the inline layout for a conflicted file", async () => {
    disk = CONFLICTED;
    await render();
    expect(container.querySelector(".cm-merge-b")).toBeNull();
    expect(container.querySelectorAll(".cm-conflictActions")).toHaveLength(2);
    expect(conflictStatus()).toBe("2 conflicts");
  });

  it("resolves block by block, then saves with CRLF and stages on Mark resolved", async () => {
    disk = CONFLICTED;
    await render();
    const accept = (index: number, label: string) =>
      [
        ...container
          .querySelectorAll(".cm-conflictActions")
          [index].querySelectorAll("button"),
      ].find((button) => button.textContent?.startsWith(label))!;

    await act(async () => accept(0, "Accept Current").click());
    expect(conflictStatus()).toBe("1 conflict");
    await act(async () => accept(0, "Accept Incoming").click());
    await act(async () =>
      vi.waitFor(() => expect(buttonByText("Mark resolved")).toBeDefined()),
    );
    expect(view().state.doc.toString()).toBe("top\nmine\nmiddle\nt2\nend\n");

    await act(async () => buttonByText("Mark resolved")!.click());
    await act(async () =>
      vi.waitFor(() =>
        expect(calls.some((call) => call.command === "git_stage_file")).toBe(
          true,
        ),
      ),
    );
    expect(disk).toBe("top\r\nmine\r\nmiddle\r\nt2\r\nend\r\n");
    const order = calls.map((call) => call.command);
    expect(order.indexOf("write_text_file")).toBeLessThan(
      order.indexOf("git_stage_file"),
    );
    expect(
      calls.find((call) => call.command === "git_stage_file")?.args,
    ).toMatchObject({ cwd: CWD, relative: "notes.txt" });
  });

  it("shows no conflict UI for an ordinary file", async () => {
    disk = "plain\n";
    await render();
    expect(
      container.querySelector('[aria-label="Merge conflicts"]'),
    ).toBeNull();
  });

  it("toggles blame, remembering the choice, and fetches for the open file", async () => {
    disk = "one\ntwo\n";
    await render(CWD, false);
    expect(blameToggle().getAttribute("aria-pressed")).toBe("false");
    expect(container.querySelector(".cm-blameGutter")).toBeNull();

    await act(async () => blameToggle().click());
    expect(localStorage.getItem("monocode.inlineBlame")).toBe("1");
    expect(blameToggle().getAttribute("aria-pressed")).toBe("true");
    await act(async () =>
      vi.waitFor(() =>
        expect(
          calls.find((call) => call.command === "git_blame")?.args,
        ).toEqual({ cwd: CWD, relative: "notes.txt" }),
      ),
    );
    await act(async () =>
      vi.waitFor(() => expect(gutterText()).toContain("Ann ·")),
    );

    await act(async () => blameToggle().click());
    expect(container.querySelector(".cm-blameGutter")).toBeNull();
  });

  it("starts with blame on when it was left on", async () => {
    localStorage.setItem("monocode.inlineBlame", "1");
    disk = "one\ntwo\n";
    await render(CWD, false);
    await act(async () =>
      vi.waitFor(() => expect(gutterText()).toContain("Ann ·")),
    );
  });

  it("reports a blame failure quietly in the editor", async () => {
    localStorage.setItem("monocode.inlineBlame", "1");
    blameResult = new Error("Could not blame this file");
    disk = "one\n";
    await render(CWD, false);
    // React state set while polling inside act() only lands once act exits,
    // so sleep past the fetch debounce instead of polling.
    await act(async () => new Promise((resolve) => setTimeout(resolve, 400)));
    expect(calls.some((call) => call.command === "git_blame")).toBe(true);
    expect(container.textContent).toContain(
      "Blame unavailable: Could not blame this file",
    );
  });

  it("disables blame for remote projects", async () => {
    disk = "one\n";
    await render("remote://env/repo", false);
    expect(blameToggle().disabled).toBe(true);
    expect(blameToggle().title).toMatch(/remote/);
  });
});
