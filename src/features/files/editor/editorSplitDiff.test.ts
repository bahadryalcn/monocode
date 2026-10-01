// @vitest-environment happy-dom
import type { MergeView } from "@codemirror/merge";
import { afterEach, describe, expect, it } from "vitest";
import {
  createSplitDiff,
  setSplitOriginal,
  splitLineStats,
  splitNavigablePositions,
} from "./editorSplitDiff";

describe("split diff", () => {
  let split: MergeView | null = null;
  afterEach(() => {
    split?.destroy();
    split = null;
  });

  function create(original: string, doc: string) {
    split = createSplitDiff({
      parent: document.body,
      original,
      doc,
      extensions: [],
      originalExtensions: [],
    });
    return split;
  }

  it("starts one hunk at each changed region of the right pane", () => {
    const lines = Array.from({ length: 30 }, (_, i) => `line ${i}`);
    const edited = lines.map((line, i) =>
      i === 3 ? "changed" : i === 20 ? "also changed" : line,
    );
    const view = create(lines.join("\n"), edited.join("\n"));
    expect(splitNavigablePositions(view)).toEqual([
      edited.slice(0, 3).join("\n").length + 1,
      edited.slice(0, 20).join("\n").length + 1,
    ]);
    expect(splitLineStats(view)).toEqual({ additions: 2, deletions: 2 });
  });

  it("counts a removed block as deletions only", () => {
    const view = create("a\nb\nc\nd", "a\nd");
    expect(splitLineStats(view)).toEqual({ additions: 0, deletions: 2 });
    expect(splitNavigablePositions(view)).toHaveLength(1);
  });

  it("treats an empty before as an all-added file", () => {
    const view = create("", "x\ny\n");
    expect(splitLineStats(view)).toEqual({ additions: 2, deletions: 0 });
    expect(splitNavigablePositions(view)).toEqual([0]);
  });

  it("has no hunks when both sides match", () => {
    const view = create("same\ntext", "same\ntext");
    expect(splitNavigablePositions(view)).toEqual([]);
  });

  it("re-diffs when the before text changes and reports whether it did", () => {
    const view = create("a\nb\nc", "a\nB\nc");
    expect(splitNavigablePositions(view)).toHaveLength(1);
    expect(setSplitOriginal(view, "a\nb\nc")).toBe(false);
    expect(setSplitOriginal(view, "a\nB\nc")).toBe(true);
    expect(view.a.state.doc.toString()).toBe("a\nB\nc");
    expect(splitNavigablePositions(view)).toEqual([]);
  });
});
