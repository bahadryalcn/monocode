import { getChunks, MergeView } from "@codemirror/merge";
import { EditorState, type Extension, type Text } from "@codemirror/state";
import { EditorView, type ViewUpdate } from "@codemirror/view";
import { editorDocChanges } from "./editorDoc";
import {
  DIFF_CONFIG,
  diffLineStats,
  navigableChunkPositions,
} from "./editorGit";

const REMOVED = "#f87171";
const ADDED = "#34d399";

/**
 * Before/after panes with the same red and green as the inline layout. The
 * merge package's own colors are faint and tuned for a light page.
 */
const splitTheme = EditorView.theme({
  "&.cm-merge-a .cm-changedLine": {
    backgroundColor: `color-mix(in srgb, ${REMOVED} 16%, transparent)`,
  },
  "&.cm-merge-b .cm-changedLine": {
    backgroundColor: `color-mix(in srgb, ${ADDED} 18%, transparent)`,
  },
  // The package styles these per color scheme with more specific selectors.
  "&.cm-merge-a .cm-changedText": {
    background: `color-mix(in srgb, ${REMOVED} 38%, transparent) !important`,
  },
  "&.cm-merge-b .cm-changedText": {
    background: `color-mix(in srgb, ${ADDED} 38%, transparent) !important`,
  },
  "&.cm-merge-a .cm-changedLineGutter": {
    background: `${REMOVED} !important`,
  },
  "&.cm-merge-b .cm-changedLineGutter": {
    background: `${ADDED} !important`,
  },
});

/**
 * Two editors side by side: `original` read-only on the left, the live
 * document on the right. Hunks are aligned with spacers and the pair scrolls
 * together as `split.dom`, not as either editor's own scroller.
 *
 * Edits to the right editor behave as in any other editor; this only adds the
 * left pane and the chunk bookkeeping.
 */
export function createSplitDiff(options: {
  parent: HTMLElement;
  original: string;
  doc: string | Text;
  /** Extensions for the editable right pane. */
  extensions: Extension;
  /** Extensions for the left pane, on top of its read-only setup. */
  originalExtensions: Extension;
}): MergeView {
  const split = new MergeView({
    a: {
      doc: options.original,
      extensions: [
        options.originalExtensions,
        EditorState.readOnly.of(true),
        EditorView.contentAttributes.of({ "aria-label": "Before (read-only)" }),
        splitTheme,
      ],
    },
    b: {
      doc: options.doc,
      extensions: [
        options.extensions,
        EditorView.contentAttributes.of({ "aria-label": "After" }),
        splitTheme,
      ],
    },
    diffConfig: DIFF_CONFIG,
    parent: options.parent,
  });
  split.dom.style.height = "100%";
  split.dom.style.overscrollBehavior = "none";
  const afterPane = split.b.dom.parentElement;
  if (afterPane) {
    afterPane.style.borderLeft =
      "1px solid color-mix(in srgb, var(--color-content) 12%, transparent)";
  }
  return split;
}

/** Where each hunk starts in the right pane, for next/previous navigation. */
export function splitNavigablePositions(split: MergeView): number[] {
  return navigableChunkPositions(
    split.b.state.doc,
    split.chunks,
    split.a.state.doc,
  );
}

export function splitLineStats(split: MergeView): {
  additions: number;
  deletions: number;
} {
  return diffLineStats(split.b.state.doc, split.chunks, split.a.state.doc);
}

/** Whether an update to the right pane can change the change counter. */
export function splitNavUpdateRelevant(update: ViewUpdate): boolean {
  return (
    update.docChanged ||
    update.geometryChanged ||
    getChunks(update.state)?.chunks !== getChunks(update.startState)?.chunks
  );
}

/**
 * Point the left pane at new "before" text, as a minimal edit so the chunks
 * update incrementally and the viewport stays put. Returns whether it changed.
 */
export function setSplitOriginal(split: MergeView, original: string): boolean {
  const changes = editorDocChanges(split.a.state.doc.toString(), original);
  if (changes.length === 0) return false;
  split.a.dispatch({ changes });
  return true;
}
