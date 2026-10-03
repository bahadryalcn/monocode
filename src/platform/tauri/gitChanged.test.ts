// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { notifyGitChanged, subscribeGitChanged } from "./fs";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

function listen(filter?: { cwd?: string; refsOnly?: boolean }) {
  const listener = vi.fn();
  const stop = subscribeGitChanged(listener, filter);
  return { listener, stop };
}

describe("git change notifications", () => {
  it("reach every subscriber when no checkout is named", () => {
    const all = listen();
    const scoped = listen({ cwd: "/repo" });
    const refs = listen({ refsOnly: true });
    notifyGitChanged();
    for (const { listener, stop } of [all, scoped, refs]) {
      expect(listener).toHaveBeenCalledTimes(1);
      stop();
    }
  });

  it("keep an index change away from commit, branch and stash views", () => {
    const refs = listen({ refsOnly: true });
    const files = listen({ cwd: "/repo" });
    notifyGitChanged("/repo", "index");
    expect(refs.listener).not.toHaveBeenCalled();
    expect(files.listener).toHaveBeenCalledTimes(1);
    refs.stop();
    files.stop();
  });

  it("keep an index change away from other checkouts", () => {
    const other = listen({ cwd: "/elsewhere" });
    const nested = listen({ cwd: "/repo/packages/app" });
    const windows = listen({ cwd: "C:\\Repo\\" });
    notifyGitChanged("/repo", "index");
    notifyGitChanged("c:/repo/src", "index");
    expect(other.listener).not.toHaveBeenCalled();
    expect(nested.listener).toHaveBeenCalledTimes(1);
    expect(windows.listener).toHaveBeenCalledTimes(1);
    other.stop();
    nested.stop();
    windows.stop();
  });

  it("send a commit or checkout to every checkout", () => {
    const other = listen({ cwd: "/elsewhere" });
    const refs = listen({ refsOnly: true });
    notifyGitChanged("/repo", "refs");
    expect(other.listener).toHaveBeenCalledTimes(1);
    expect(refs.listener).toHaveBeenCalledTimes(1);
    other.stop();
    refs.stop();
  });

  it("stop after unsubscribing", () => {
    const { listener, stop } = listen();
    stop();
    notifyGitChanged();
    expect(listener).not.toHaveBeenCalled();
  });
});
