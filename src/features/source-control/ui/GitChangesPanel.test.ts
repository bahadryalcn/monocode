// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetGitIndexStore } from "../model/gitIndexStore";

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(async () => {}),
}));

const { invalidateWatchedFiles } = vi.hoisted(() => ({
  invalidateWatchedFiles: vi.fn(),
}));

vi.mock("../../../platform/tauri/fs", () => ({
  gitDiffIndex: vi.fn(),
  gitHistory: vi.fn(async () => []),
  gitOperationState: vi.fn(async () => null),
  gitConflicts: vi.fn(async () => []),
  gitOperationStatus: vi.fn(async () => ({ operation: null, conflicts: [] })),
  gitStashList: vi.fn(async () => []),
  gitBranches: vi.fn(async () => ({ current: "main", detached: false, branches: [] })),
  gitRemotes: vi.fn(async () => []),
  gitTags: vi.fn(async () => []),
  gitPrStatus: vi.fn(async () => null),
  gitPull: vi.fn(async () => {}),
  gitPush: vi.fn(async () => {}),
  gitSync: vi.fn(async () => {}),
  gitCommit: vi.fn(async () => {}),
  gitHeadMessage: vi.fn(async () => ""),
  gitStageAll: vi.fn(async () => {}),
  gitUnstageAll: vi.fn(async () => {}),
  gitDiscardAll: vi.fn(async () => {}),
  gitStageFile: vi.fn(async () => {}),
  gitUnstageFile: vi.fn(async () => {}),
  gitDiscardFile: vi.fn(async () => {}),
  gitPrCreate: vi.fn(async () => ""),
  gitRangeContext: vi.fn(),
  notifyGitChanged: vi.fn(),
  subscribeGitChanged: () => () => {},
  basename: (path: string) => path.split("/").pop() ?? path,
}));

vi.mock("../../../integrations/harness", () => ({
  generateCommitMessage: vi.fn(async () => ""),
  generatePrContent: vi.fn(async () => null),
}));

vi.mock("../../files/model/fileWatch", () => ({
  invalidateWatchedFiles,
  nudgeWatchedFiles: vi.fn(),
}));

vi.mock("../../inbox/model/inboxSelfActivity", () => ({
  recordInboxSelfActivity: vi.fn(),
}));

import { GitChangesPanel } from "./GitChangesPanel";
import {
  gitCommit,
  gitDiffIndex,
  gitPrCreate,
  gitPull,
  gitPush,
  gitRangeContext,
  gitStageFile,
  gitUnstageFile,
  notifyGitChanged,
} from "../../../platform/tauri/fs";
import {
  generateCommitMessage,
  generatePrContent,
} from "../../../integrations/harness";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { GitChangedFile, GitDiffIndex } from "../../../platform/tauri/fs";

function index(overrides: Partial<GitDiffIndex> = {}): GitDiffIndex {
  return {
    branch: "feature/pull",
    head: "abc123",
    files: [],
    additions: 0,
    deletions: 0,
    remote: null,
    upstream: null,
    defaultBranch: "main",
    ahead: 0,
    behind: 0,
    aheadOfDefault: 0,
    headPushed: true,
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  resetGitIndexStore();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.mocked(gitDiffIndex).mockReset();
  vi.mocked(gitPull).mockReset();
  vi.mocked(generateCommitMessage).mockReset();
  vi.mocked(gitStageFile).mockReset().mockResolvedValue(undefined);
  vi.mocked(gitUnstageFile).mockReset().mockResolvedValue(undefined);
  vi.mocked(notifyGitChanged).mockClear();
  invalidateWatchedFiles.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

describe("GitChangesPanel commit message generation", () => {
  it("cancels promptly and ignores a late result after a retry", async () => {
    vi.mocked(gitDiffIndex).mockResolvedValue(
      index({
        files: [
          {
            path: "/repo/change.ts",
            relative: "change.ts",
            status: "modified",
            additions: 1,
            deletions: 0,
            staged: true,
            unstaged: false,
          },
        ],
      }),
    );
    let resolveFirst!: (message: string) => void;
    vi.mocked(generateCommitMessage)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce("New message");
    await renderPanel();

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          '[aria-label="Generate commit message"]',
        )!
        .click();
    });
    const signal = vi.mocked(generateCommitMessage).mock.calls[0]?.[2];
    expect(signal?.aborted).toBe(false);

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          '[aria-label="Cancel commit message generation"]',
        )!
        .click();
    });
    expect(signal?.aborted).toBe(true);
    expect(
      container.querySelector<HTMLButtonElement>(
        '[aria-label="Generate commit message"]',
      )?.disabled,
    ).toBe(false);
    expect(container.querySelector("textarea")?.disabled).toBe(false);

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          '[aria-label="Generate commit message"]',
        )!
        .click();
    });
    expect(container.querySelector("textarea")?.value).toBe("New message");

    await act(async () => resolveFirst("Old message"));
    expect(container.querySelector("textarea")?.value).toBe("New message");
  });
});

afterEach(() => {
  act(() => root.unmount());
  vi.clearAllTimers();
  vi.useRealTimers();
  container.remove();
  document.body
    .querySelectorAll("[data-popover-side]")
    .forEach((element) => element.remove());
  vi.unstubAllGlobals();
});

async function renderPanel(cwd = "/repo") {
  act(() =>
    root.render(
      createElement(GitChangesPanel, {
        cwd,
        enabled: true,
        onOpenFile: vi.fn(),
        onOpenAllChanges: vi.fn(),
        onOpenCommit: vi.fn(),
      }),
    ),
  );
  await act(async () => {});
}

async function openBranchMenu() {
  const toggle = container.querySelector<HTMLButtonElement>(
    '[aria-label="Branch actions"]',
  )!;
  await act(async () => toggle.click());
  await act(async () => {});
  return document.querySelector<HTMLButtonElement>('[role="menuitem"]')!;
}

describe("GitChangesPanel action feedback", () => {
  const changed = (staged: boolean) => ({
    path: "/repo-feedback/change.ts",
    relative: "change.ts",
    status: "modified",
    additions: 1,
    deletions: 0,
    staged,
    unstaged: !staged,
  });
  const sections = () =>
    [...container.querySelectorAll("button > span.uppercase")]
      .map((title) => title.textContent ?? "")
      .filter((title) => title.endsWith("Changes"));
  const statusText = () =>
    container.querySelector('header [role="status"]')?.textContent ?? null;

  it("moves a file to Staged Changes before git has answered", async () => {
    const cwd = "/repo-feedback";
    vi.mocked(gitDiffIndex).mockResolvedValue(index({ files: [changed(false)] }));
    let finishStage!: () => void;
    vi.mocked(gitStageFile).mockImplementationOnce(
      () => new Promise<void>((resolve) => (finishStage = resolve)),
    );
    vi.mocked(notifyGitChanged).mockClear();
    await renderPanel(cwd);
    expect(sections()).toEqual(["Changes"]);

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[aria-label="Stage Changes"]')!
        .click();
    });
    expect(gitStageFile).toHaveBeenCalledWith(cwd, "change.ts");
    expect(sections()).toEqual(["Staged Changes"]);
    expect(statusText()).toBe("Staging…");
    expect(container.querySelector('[aria-label="Working"]')).not.toBeNull();

    vi.mocked(gitDiffIndex).mockResolvedValue(index({ files: [changed(true)] }));
    await act(async () => finishStage());
    await act(async () => {});
    expect(sections()).toEqual(["Staged Changes"]);
    expect(statusText()).toBeNull();
    expect(container.querySelector('[aria-label="Working"]')).toBeNull();
    // One announcement, limited to this checkout's changed files.
    expect(vi.mocked(notifyGitChanged).mock.calls).toEqual([[cwd, "index"]]);
  });

  it("stages files one after another while the message stays editable and a message is generated", async () => {
    const cwd = "/repo-feedback-queue";
    const other = { ...changed(false), path: `${cwd}/other.ts`, relative: "other.ts" };
    vi.mocked(gitDiffIndex).mockResolvedValue(
      index({ files: [changed(false), other] }),
    );
    const finish: (() => void)[] = [];
    vi.mocked(gitStageFile).mockReset();
    vi.mocked(gitStageFile).mockImplementation(
      () => new Promise<void>((resolve) => finish.push(resolve)),
    );
    vi.mocked(generateCommitMessage).mockImplementationOnce(
      () => new Promise(() => {}),
    );
    vi.mocked(notifyGitChanged).mockClear();
    await renderPanel(cwd);
    const stageButtons = () =>
      container.querySelectorAll<HTMLButtonElement>(
        '[aria-label="Stage Changes"]',
      );

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          '[aria-label="Generate commit message"]',
        )!
        .click();
    });
    await act(async () => stageButtons()[0].click());
    expect(container.querySelector("textarea")?.disabled).toBe(true);
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          '[aria-label="Cancel commit message generation"]',
        )!
        .click();
    });
    // Staging is still running; the box is free to type in.
    expect(container.querySelector("textarea")?.disabled).toBe(false);

    await act(async () => stageButtons()[0].click());
    expect(sections()).toEqual(["Staged Changes"]);
    // The second command waits for the first.
    expect(gitStageFile).toHaveBeenCalledTimes(1);

    await act(async () => finish[0]());
    expect(gitStageFile).toHaveBeenCalledTimes(2);
    expect(vi.mocked(notifyGitChanged)).not.toHaveBeenCalled();
    expect(statusText()).toBe("Staging…");

    vi.mocked(gitDiffIndex).mockResolvedValue(
      index({ files: [changed(true), { ...other, staged: true, unstaged: false }] }),
    );
    await act(async () => finish[1]());
    await act(async () => {});
    expect(sections()).toEqual(["Staged Changes"]);
    expect(statusText()).toBeNull();
    expect(vi.mocked(notifyGitChanged).mock.calls).toEqual([[cwd, "index"]]);
    vi.mocked(gitStageFile).mockReset();
    vi.mocked(gitStageFile).mockResolvedValue(undefined);
  });

  it("puts the file back when staging fails", async () => {
    const cwd = "/repo-feedback-failed";
    vi.mocked(gitDiffIndex).mockResolvedValue(index({ files: [changed(false)] }));
    vi.mocked(gitStageFile).mockRejectedValueOnce(new Error("index.lock exists"));
    vi.stubGlobal("alert", vi.fn());
    await renderPanel(cwd);

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[aria-label="Stage Changes"]')!
        .click();
    });
    await act(async () => {});
    expect(sections()).toEqual(["Changes"]);
    expect(statusText()).toBeNull();
  });

  it("names the step on the commit button while it runs", async () => {
    const cwd = "/repo-feedback-commit";
    vi.mocked(gitDiffIndex).mockResolvedValue(index({ files: [changed(true)] }));
    let finishCommit!: () => void;
    vi.mocked(gitCommit).mockImplementationOnce(
      () => new Promise<void>((resolve) => (finishCommit = resolve)),
    );
    await renderPanel(cwd);
    const textarea = container.querySelector("textarea")!;
    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )!.set!;
      setValue.call(textarea, "Fix it");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const commitButton = () =>
      [...container.querySelectorAll<HTMLButtonElement>("button")].find(
        (candidate) =>
          /^(Commit|Committing…)$/.test(candidate.textContent?.trim() ?? ""),
      )!;
    expect(commitButton().textContent?.trim()).toBe("Commit");

    await act(async () => commitButton().click());
    expect(commitButton().textContent?.trim()).toBe("Committing…");
    expect(statusText()).toBe("Committing…");

    await act(async () => finishCommit());
    await act(async () => {});
    expect(commitButton().textContent?.trim()).toBe("Commit");
    expect(statusText()).toBeNull();
  });

  it("clears committed files as soon as the commit is made, before the push ends", async () => {
    const cwd = "/repo-feedback-push";
    vi.mocked(gitDiffIndex).mockResolvedValue(
      index({ files: [changed(true)], remote: "origin", upstream: "origin/x" }),
    );
    vi.mocked(gitCommit).mockResolvedValueOnce(undefined);
    let finishPush!: () => void;
    vi.mocked(gitPush).mockImplementationOnce(
      () => new Promise<void>((resolve) => (finishPush = resolve)),
    );
    await renderPanel(cwd);
    const textarea = container.querySelector("textarea")!;
    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )!.set!;
      setValue.call(textarea, "Fix it");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(sections()).toEqual(["Staged Changes"]);

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[aria-label="Commit options"]')!
        .click();
    });
    const pushItem = [
      ...container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
    ].find((item) => item.textContent?.trim() === "Commit & Push")!;
    await act(async () => pushItem.click());
    await act(async () => {});

    // Still pushing, and the poll still reads the old index.
    expect(statusText()).toBe("Pushing…");
    expect(sections()).toEqual([]);
    expect(container.querySelector("textarea")?.value).toBe("");

    vi.mocked(gitDiffIndex).mockResolvedValue(
      index({ remote: "origin", upstream: "origin/x" }),
    );
    await act(async () => finishPush());
    await act(async () => {});
    expect(sections()).toEqual([]);
    expect(statusText()).toBeNull();
  });
});

describe("GitChangesPanel pull action", () => {
  it("disables Pull when the branch has no upstream", async () => {
    vi.mocked(gitDiffIndex).mockResolvedValue(
      index({ remote: null, upstream: null }),
    );
    await renderPanel();

    const pull = await openBranchMenu();
    expect(pull.textContent).toContain("Pull");
    expect(pull.disabled).toBe(true);
  });

  it("disables Pull when the repository has no remote", async () => {
    vi.mocked(gitDiffIndex).mockResolvedValue(
      index({ remote: null, upstream: "origin/feature/pull" }),
    );
    await renderPanel();

    const pull = await openBranchMenu();
    expect(pull.disabled).toBe(true);
  });

  it("pulls the current branch and reloads watched files", async () => {
    vi.mocked(gitDiffIndex).mockResolvedValue(
      index({ remote: "origin", upstream: "origin/feature/pull" }),
    );
    await renderPanel();

    const pull = await openBranchMenu();
    expect(pull.disabled).toBe(false);

    invalidateWatchedFiles.mockClear();
    await act(async () => {
      pull.click();
      await Promise.resolve();
    });

    expect(gitPull).toHaveBeenCalledWith("/repo");
    expect(invalidateWatchedFiles).toHaveBeenCalled();
  });
});

describe("GitChangesPanel actions menu", () => {
  const menuLabels = () =>
    [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].map(
      (item) => item.textContent?.trim(),
    );

  it("stays available on a detached HEAD without a remote", async () => {
    vi.mocked(gitDiffIndex).mockResolvedValue(index({ branch: null }));
    await renderPanel();

    const pull = await openBranchMenu();
    expect(pull.disabled).toBe(true);
    expect(menuLabels()).toEqual([
      "Pull",
      "Push",
      "Checkout to…",
      "Fetch",
      "Commit",
      "Changes",
      "Pull, Push",
      "Branch",
      "Remote",
      "Stash",
      "Tags",
    ]);
    const checkout = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(
      (item) => item.textContent === "Checkout to…",
    );
    expect(checkout?.disabled).toBe(false);
  });

  it("pulls with a rebase from the Pull, Push group", async () => {
    vi.mocked(gitDiffIndex).mockResolvedValue(
      index({ remote: "origin", upstream: "origin/feature/pull" }),
    );
    await renderPanel();
    await openBranchMenu();

    const group = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(
      (item) => item.textContent === "Pull, Push",
    )!;
    await act(async () => group.click());
    await act(async () => {});
    const rebase = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(
      (item) => item.textContent === "Pull (Rebase)",
    )!;
    expect(rebase.disabled).toBe(false);

    await act(async () => {
      rebase.click();
      await Promise.resolve();
    });
    expect(gitPull).toHaveBeenCalledWith("/repo", true);
  });
});

describe("GitChangesPanel remote pull request", () => {
  it("creates it from the host Git range without calling a local harness", async () => {
    const cwd = "remote://machine/home/user/repo";
    vi.mocked(gitDiffIndex).mockResolvedValue(
      index({
        remote: "origin",
        upstream: "origin/feature/pull",
        ahead: 1,
        aheadOfDefault: 1,
      }),
    );
    vi.mocked(gitRangeContext).mockResolvedValue({
      base: "main",
      head: "feature/pull",
      commitSummary: "abc123 Fix remote flow\ndef456 Add coverage",
      diffSummary: "2 files changed, 4 insertions(+)\n",
      diffPatch: "",
    });
    vi.mocked(gitPrCreate).mockResolvedValue("https://example.test/pull/42");
    await renderPanel(cwd);

    const button = [
      ...container.querySelectorAll<HTMLButtonElement>("button"),
    ].find((candidate) => candidate.textContent?.trim() === "Create PR");
    expect(button?.disabled).toBe(false);
    await act(async () => {
      button!.click();
      await Promise.resolve();
    });

    expect(gitPush).toHaveBeenCalledWith(cwd);
    expect(gitRangeContext).toHaveBeenCalledWith(cwd);
    expect(generatePrContent).not.toHaveBeenCalled();
    expect(gitPrCreate).toHaveBeenCalledWith(
      cwd,
      "Fix remote flow",
      expect.stringContaining("## Changes\n\n2 files changed"),
      "main",
      "feature/pull",
    );
    expect(openUrl).toHaveBeenCalledWith("https://example.test/pull/42");
  });
});

function changedFile(
  relative: string,
  overrides: Partial<GitChangedFile> = {},
): GitChangedFile {
  return {
    path: `/repo/${relative}`,
    relative,
    status: "modified",
    additions: 1,
    deletions: 0,
    staged: false,
    unstaged: true,
    ...overrides,
  };
}

async function showTree() {
  const toggle = container.querySelector<HTMLButtonElement>(
    '[aria-label="View as Tree"]',
  );
  if (toggle) await act(async () => toggle.click());
  let collapsed: HTMLButtonElement | null;
  while (
    (collapsed = container.querySelector<HTMLButtonElement>(
      'button[title][aria-expanded="false"]',
    ))
  ) {
    const folder = collapsed;
    await act(async () => folder.click());
  }
}

describe("GitChangesPanel folder actions", () => {
  it.each(["/repo", "remote://machine/home/user/repo"])(
    "stages a collapsed folder in one operation for %s",
    async (cwd) => {
      const files = [
        changedFile("src/app.ts", { path: `${cwd}/src/app.ts` }),
        changedFile("src/nested/new.ts", {
          path: `${cwd}/src/nested/new.ts`,
          status: "untracked",
        }),
        changedFile("src-other/other.ts"),
        changedFile("docs/ready.md", { staged: true, unstaged: false }),
      ];
      vi.mocked(gitDiffIndex).mockResolvedValue(index({ files }));
      await renderPanel(cwd);
      await showTree();
      const folder = container.querySelector<HTMLButtonElement>(
        'button[title="src"]',
      )!;
      await act(async () => folder.click());
      expect(folder.getAttribute("aria-expanded")).toBe("false");
      expect(container.querySelector('button[title="src/app.ts"]')).toBeNull();

      invalidateWatchedFiles.mockClear();
      vi.mocked(notifyGitChanged).mockClear();
      const reads = vi.mocked(gitDiffIndex).mock.calls.length;
      await act(async () => {
        container
          .querySelector<HTMLButtonElement>(
            '[aria-label="Stage Changes in src"]',
          )!
          .click();
      });

      expect(gitStageFile).toHaveBeenCalledExactlyOnceWith(cwd, "src");
      expect(gitUnstageFile).not.toHaveBeenCalled();
      expect(invalidateWatchedFiles).toHaveBeenCalledWith([
        `${cwd}/src/app.ts`,
        `${cwd}/src/nested/new.ts`,
      ]);
      expect(notifyGitChanged).toHaveBeenCalled();
      expect(vi.mocked(gitDiffIndex).mock.calls.length).toBeGreaterThan(reads);
      expect(folder.getAttribute("aria-expanded")).toBe("false");
    },
  );

  it("stages a nested folder without toggling it or including its siblings", async () => {
    vi.mocked(gitDiffIndex).mockResolvedValue(
      index({
        files: [
          changedFile("src/app.ts"),
          changedFile("src/nested/one.ts"),
          changedFile("src/nested/deeper/two.ts"),
          changedFile("src/nested-other/three.ts"),
        ],
      }),
    );
    await renderPanel();
    await showTree();
    const folder = container.querySelector<HTMLButtonElement>(
      'button[title="src/nested"]',
    )!;
    invalidateWatchedFiles.mockClear();
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          '[aria-label="Stage Changes in src/nested"]',
        )!
        .click();
    });

    expect(gitStageFile).toHaveBeenCalledExactlyOnceWith("/repo", "src/nested");
    expect(folder.getAttribute("aria-expanded")).toBe("true");
    expect(invalidateWatchedFiles).toHaveBeenCalledWith([
      "/repo/src/nested/one.ts",
      "/repo/src/nested/deeper/two.ts",
    ]);
  });

  it("unstages the staged folder including files that also have unstaged changes", async () => {
    vi.mocked(gitDiffIndex).mockResolvedValue(
      index({
        files: [
          changedFile("src/app.ts", { staged: true, unstaged: false }),
          changedFile("src/nested/partial.ts", { staged: true }),
          changedFile("docs/readme.md", { staged: true, unstaged: false }),
        ],
      }),
    );
    await renderPanel();
    await showTree();
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          '[aria-label="Unstage Changes in src"]',
        )!
        .click();
    });

    expect(gitUnstageFile).toHaveBeenCalledExactlyOnceWith("/repo", "src");
    expect(gitStageFile).not.toHaveBeenCalled();
  });

  it("disables folder and file mutations while a folder action is running", async () => {
    vi.mocked(gitDiffIndex).mockResolvedValue(
      index({
        files: [changedFile("src/app.ts"), changedFile("docs/readme.md")],
      }),
    );
    let finish!: () => void;
    vi.mocked(gitStageFile).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    await renderPanel();
    await showTree();
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          '[aria-label="Stage Changes in src"]',
        )!
        .click();
    });
    const actions = [
      ...container.querySelectorAll<HTMLButtonElement>(
        'button[aria-label^="Stage Changes"], button[aria-label="Discard Changes"]',
      ),
    ];
    expect(actions.length).toBeGreaterThan(2);
    expect(actions.every((action) => action.disabled)).toBe(true);
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          '[aria-label="Stage Changes in docs"]',
        )!
        .click();
    });
    expect(gitStageFile).toHaveBeenCalledTimes(1);

    await act(async () => finish());
    expect(actions.every((action) => !action.disabled)).toBe(true);
  });

  it("reports errors and enables folder actions again", async () => {
    const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
    vi.mocked(gitDiffIndex).mockResolvedValue(
      index({ files: [changedFile("src/app.ts")] }),
    );
    vi.mocked(gitStageFile).mockRejectedValueOnce(
      new Error("Git index is locked"),
    );
    await renderPanel();
    await showTree();
    invalidateWatchedFiles.mockClear();
    const stage = container.querySelector<HTMLButtonElement>(
      '[aria-label="Stage Changes in src"]',
    )!;
    await act(async () => stage.click());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });

    expect(alert).toHaveBeenCalledWith("Git index is locked");
    expect(stage.disabled).toBe(false);
    expect(notifyGitChanged).toHaveBeenCalled();
    alert.mockRestore();
  });
});
