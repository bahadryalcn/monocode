import { describe, expect, it } from "vitest";
import type { GitHistoryCommit } from "../../../platform/tauri/fs";
import { commitMenuItems, filterHistory, operationLabel } from "./commitActions";

function commit(partial: Partial<GitHistoryCommit>): GitHistoryCommit {
  return {
    sha: "a".repeat(40),
    shortSha: "aaaaaaa",
    parents: [],
    author: "Ada",
    timestamp: 0,
    subject: "Initial commit",
    refs: [],
    head: false,
    ...partial,
  };
}

function disabledIds(target: GitHistoryCommit): string[] {
  return commitMenuItems(target).flatMap((item) =>
    item.kind === "item" && item.disabled ? [item.id] : [],
  );
}

describe("commitMenuItems", () => {
  it("offers every action on an ordinary commit", () => {
    expect(disabledIds(commit({}))).toEqual([]);
  });

  it("disables actions that make no sense on HEAD", () => {
    expect(disabledIds(commit({ head: true }))).toEqual([
      "checkout",
      "cherry-pick",
      "reset",
    ]);
  });

  it("marks only the hard reset as dangerous", () => {
    const reset = commitMenuItems(commit({})).find(
      (item) => item.kind === "item" && item.id === "reset",
    );
    const submenu = reset?.kind === "item" ? (reset.submenu ?? []) : [];
    expect(submenu.map((item) => [item.id, item.danger === true])).toEqual([
      ["reset-soft", false],
      ["reset-mixed", false],
      ["reset-hard", true],
    ]);
  });
});

describe("filterHistory", () => {
  const commits = [
    commit({ sha: "abc123".padEnd(40, "0"), subject: "Fix login", author: "Ada" }),
    commit({ sha: "def456".padEnd(40, "0"), subject: "Add graph", author: "Grace" }),
    commit({
      sha: "999999".padEnd(40, "0"),
      subject: "Release",
      author: "Linus",
      refs: [{ name: "v1.2.0", kind: "tag" }],
    }),
  ];

  it("returns everything for a blank query", () => {
    expect(filterHistory(commits, "  ")).toBe(commits);
  });

  it("matches subject, author, id prefix and ref name without case", () => {
    expect(filterHistory(commits, "LOGIN").map((c) => c.subject)).toEqual(["Fix login"]);
    expect(filterHistory(commits, "grace").map((c) => c.subject)).toEqual(["Add graph"]);
    expect(filterHistory(commits, "DEF4").map((c) => c.subject)).toEqual(["Add graph"]);
    expect(filterHistory(commits, "v1.2").map((c) => c.subject)).toEqual(["Release"]);
    expect(filterHistory(commits, "nope")).toEqual([]);
  });
});

describe("operationLabel", () => {
  it("names each operation", () => {
    expect(operationLabel("cherry-pick")).toBe("Cherry-pick");
    expect(operationLabel("rebase")).toBe("Rebase");
  });
});
