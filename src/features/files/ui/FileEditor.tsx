import { acceptCompletion, completionStatus } from "@codemirror/autocomplete";
import { indentLess, indentMore } from "@codemirror/commands";
import {
  foldGutter,
  foldKeymap,
  getIndentUnit,
  indentUnit,
} from "@codemirror/language";
import type { MergeView } from "@codemirror/merge";
import {
  Annotation,
  Compartment,
  countColumn,
  EditorSelection,
  Prec,
  StateField,
  Transaction,
  type EditorState,
  type Extension,
  type Text,
} from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  RotateCcw,
} from "../../../shared/ui/icons";
import { formatInteger } from "../../../shared/lib/numbers";
import { minimalSetup } from "codemirror";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  MarkdownViewShell,
  useMarkdownMode,
} from "../../sessions/ui/MarkdownModeToggle";
import { useColorScheme } from "../../../shared/hooks/useColorScheme";
import { useLockOverscroll } from "../../../shared/hooks/useLockOverscroll";
import { isLightScheme } from "../../settings/model/appearance";
import {
  loadAutosave,
  loadFormatOnSave,
} from "../../settings/model/settings";
import { formatText } from "../../../shared/lib/format";
import {
  basename,
  gitBlame,
  gitConflicts,
  gitDiffFiles,
  gitFileDiff,
  gitStageContents,
  gitStageFile,
  notifyGitChanged,
  readTextFile,
  subscribeGitChanged,
  writeTextFile,
  type GitFileDiffKind,
} from "../../../platform/tauri/fs";
import { syncWatchedMtime, watchFile } from "../model/fileWatch";
import { displayPath } from "../../../shared/lib/paths";
import type { EditorNavigation } from "../../search/model/search";
import { MarkdownDocumentPreview } from "../../sessions/ui/MarkdownDocumentPreview";
import {
  DiffCommentComposer,
  type DiffCommentComposerTarget,
} from "../../source-control/ui/DiffCommentComposer";
import {
  DiffLayoutToggle,
  useDiffLayout,
} from "../../source-control/ui/DiffLayoutToggle";
import { hasConflictMarkers } from "../../source-control/model/conflictMarkers";
import { nextConflictedFile } from "../../source-control/model/conflictSection";
import { requestOpenCommit } from "../../source-control/ui/GitFileInspector";
import { editorAutocomplete } from "../editor/editorAutocomplete";
import { editorBlame, refreshBlame } from "../editor/editorBlame";
import {
  conflictBlocks,
  editorConflicts,
  stepConflict,
} from "../editor/editorConflicts";
import { languageForPath, schemeExtensions } from "../editor/editorChrome";
import {
  detectLineEnding,
  type LineEnding,
  normalizeLineBreaks,
  preserveEditorViewport,
  replaceEditorDoc,
  restoreLineEnding,
  scrollLineToTop,
  topVisibleLine,
} from "../editor/editorDoc";
import {
  editorMatching,
  editorTyping,
  tryExpandEmmet,
} from "../editor/editorEditing";
import {
  EditorSelectionMenu,
  type EditorSelectionTarget,
} from "./EditorSelectionMenu";
import {
  diffActiveChunkIndex,
  diffLineStatsForView,
  diffNavigablePositions,
  diffNavUpdateRelevant,
  diffScrollToChunk,
  editorGit,
  setGitOriginal,
} from "../editor/editorGit";
import {
  createSplitDiff,
  setSplitCanStage,
  setSplitOriginal,
  splitLineStats,
  splitNavigablePositions,
  splitNavUpdateRelevant,
} from "../editor/editorSplitDiff";
import { editorLint } from "../editor/editorLint";
import { editorSearch } from "../editor/editorSearch";
import { editorScrollbar } from "../editor/editorScrollbar";
import { attachSplitOverview, editorOverview } from "../editor/editorOverview";
import { EditorConflictBar } from "./EditorConflictBar";
import { FilePreviewSearch } from "./FilePreviewSearch";
import {
  InlineBlameToggle,
  useInlineBlame,
  useInlineBlameUnavailableReason,
} from "./InlineBlameToggle";

type EditorNavigationRequest = EditorNavigation & { token: number };

export const FILE_EDITOR_AUTOSAVE_DELAY_MS = 1_000;

const editorScheme = new Compartment();
const editorGitConfig = new Compartment();
const editorBlameConfig = new Compartment();
const inlineBlameExtension = editorBlame({ onOpenCommit: requestOpenCommit });

type Props = {
  path: string;
  cwd: string;
  active: boolean;
  showDiff?: boolean;
  /** The side the Changes panel opened; saves looking it up before the first diff. */
  changeKind?: GitFileDiffKind;
  navigation?: EditorNavigationRequest | null;
  onDirtyChange: (path: string, dirty: boolean) => void;
  onErrorCountChange?: (path: string, count: number) => void;
  onOpenFile?: (path: string) => void;
};

type LoadState =
  | { status: "loading" }
  | { status: "ready"; content: string }
  | { status: "error"; message: string };

type SaveState =
  | { status: "idle" | "saving" | "saved" }
  | { status: "error"; message: string };

export function FileEditor({
  path,
  cwd,
  active,
  showDiff = false,
  changeKind,
  navigation,
  onDirtyChange,
  onErrorCountChange,
  onOpenFile,
}: Props) {
  // The path whose "before" side has been looked up, found or not. Until then
  // the editor is not drawn: showing it plain first means tearing it down and
  // building the side-by-side pair a moment later.
  const [gitSettledPath, setGitSettledPath] = useState<string | null>(null);
  const changeKindRef = useRef(changeKind);
  changeKindRef.current = changeKind;
  const reloadGitRef = useRef<(() => void) | null>(null);
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });
  const [reloadKey, setReloadKey] = useState(0);
  const [draft, setDraft] = useState("");
  const [gitBase, setGitBase] = useState<{
    path: string;
    original: string;
    kind: GitFileDiffKind;
    lineEnding: LineEnding;
    eolOnly: boolean;
  } | null>(null);
  const markdown = isMarkdownPath(path);
  const svg = isSvgPath(path);
  const [mode, setMode] = useMarkdownMode(path);
  const sourceNavigationToken = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (
      !navigation ||
      (!markdown && !svg) ||
      sourceNavigationToken.current === navigation.token
    )
      return;
    sourceNavigationToken.current = navigation.token;
    setMode("source");
  }, [markdown, svg, navigation, setMode]);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const saveGeneration = useRef(0);
  const loadGeneration = useRef(0);
  const dirtyRef = useRef(false);
  const pendingDiskRef = useRef(false);
  const eolRef = useRef<LineEnding>("\n");
  const onDirtyChangeRef = useRef(onDirtyChange);
  onDirtyChangeRef.current = onDirtyChange;

  const applyDiskContent = useCallback((raw: string) => {
    // CodeMirror documents are LF-only; keep the editor in that convention
    // and restore the file's own line endings on save. Feeding CRLF text
    // into the LF document doubles every line (see editorDoc.ts).
    eolRef.current = detectLineEnding(raw);
    const content = normalizeLineBreaks(raw);
    setLoadState((current) => {
      if (current.status === "ready" && current.content === content) {
        return current;
      }
      return { status: "ready", content };
    });
    setDraft(content);
  }, []);

  const reloadFromDisk = useCallback(
    async (force = false) => {
      const generation = ++loadGeneration.current;
      try {
        const content = await readTextFile(path);
        if (generation !== loadGeneration.current) return;
        if (dirtyRef.current && !force) {
          pendingDiskRef.current = true;
          return;
        }
        pendingDiskRef.current = false;
        if (force && dirtyRef.current) {
          dirtyRef.current = false;
          onDirtyChangeRef.current(path, false);
        }
        applyDiskContent(content);
      } catch (error: unknown) {
        if (generation !== loadGeneration.current) return;
        if (dirtyRef.current && !force) {
          pendingDiskRef.current = true;
          return;
        }
        setLoadState({
          status: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [applyDiskContent, path],
  );

  useEffect(() => {
    dirtyRef.current = false;
    pendingDiskRef.current = false;
    let cancelled = false;
    setLoadState({ status: "loading" });
    setSaveState({ status: "idle" });
    const generation = ++loadGeneration.current;
    void readTextFile(path)
      .then((content) => {
        if (cancelled || generation !== loadGeneration.current) return;
        applyDiskContent(content);
      })
      .catch((error: unknown) => {
        if (cancelled || generation !== loadGeneration.current) return;
        setLoadState({
          status: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [applyDiskContent, path, reloadKey]);

  useEffect(() => {
    if (!showDiff) {
      setGitBase(null);
      return;
    }
    const relative = displayPath(path, cwd);
    if (!cwd || cwd === "~" || !relative || relative === path) {
      setGitBase(null);
      return;
    }
    let cancelled = false;
    let generation = 0;
    setGitBase(null);

    const listed = async () => {
      const { files } = await gitDiffFiles(cwd);
      return files.find((entry) => entry.relative === relative);
    };

    // Until a diff has arrived, a load takes the side the Changes panel named
    // and asks git for that diff alone. A later reload follows the file:
    // staging it moves the diff to the staged side instead of leaving an
    // empty one.
    let shown = false;
    const load = () => {
      const request = ++generation;
      const first = !shown;
      void (async () => {
        const opened = changeKindRef.current;
        let file = first && opened ? undefined : await listed();
        const kind: GitFileDiffKind =
          first && opened
            ? opened
            : opened === "staged" && file?.staged
              ? "staged"
              : opened === "unstaged" && file?.unstaged
                ? "unstaged"
                : file?.staged && !file.unstaged
                  ? "staged"
                  : "unstaged";
        const diff = await gitFileDiff(cwd, relative, kind);
        if (cancelled || request !== generation) return;
        shown = true;
        if (diff.binary || diff.tooLarge) {
          setGitBase(null);
          setGitSettledPath(path);
          return;
        }
        const original = normalizeLineBreaks(diff.original);
        // Normalized equality alone cannot distinguish autocrlf from a real
        // change, so only then is git asked whether it lists the file.
        const eolDiffers =
          diff.original !== diff.current &&
          original === normalizeLineBreaks(diff.current);
        if (eolDiffers && first && opened) {
          file = await listed();
          if (cancelled || request !== generation) return;
        }
        setGitBase({
          path,
          original,
          kind,
          lineEnding: detectLineEnding(diff.original || diff.current),
          eolOnly: !!(file?.staged || file?.unstaged) && eolDiffers,
        });
        setGitSettledPath(path);
      })().catch(() => {
        if (cancelled || request !== generation) return;
        shown = true;
        setGitBase(null);
        setGitSettledPath(path);
      });
    };

    load();
    reloadGitRef.current = load;
    const onFocus = () => {
      if (!document.hidden) load();
    };
    const onGit = () => {
      if (!document.hidden) load();
    };
    let timer = 0;
    const onDisk = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        load();
        void reloadFromDisk();
      }, 50);
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    const unsubGit = subscribeGitChanged(onGit, { cwd });
    const unsubWatch = watchFile(path, onDisk);
    return () => {
      cancelled = true;
      reloadGitRef.current = null;
      window.clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      unsubGit();
      unsubWatch();
    };
  }, [cwd, path, reloadFromDisk, showDiff]);

  // Picking the file's other side in the Changes panel reuses this editor.
  const shownChangeKind = useRef(changeKind);
  useEffect(() => {
    if (shownChangeKind.current === changeKind) return;
    shownChangeKind.current = changeKind;
    reloadGitRef.current?.();
  }, [changeKind]);

  const gitDiff = gitBase?.path === path ? gitBase : null;
  const gitOriginal = gitDiff?.original ?? null;

  useEffect(() => {
    if (loadState.status !== "ready") return;
    let timer = 0;
    const stop = watchFile(path, () => {
      if (dirtyRef.current) {
        pendingDiskRef.current = true;
        return;
      }
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void reloadFromDisk();
      }, 50);
    });
    return () => {
      window.clearTimeout(timer);
      stop();
    };
  }, [loadState.status, path, reloadFromDisk]);

  const save = useCallback(
    async (content: string) => {
      const generation = ++saveGeneration.current;
      setSaveState({ status: "saving" });
      const serializedContent = restoreLineEnding(content, eolRef.current);
      const operation = saveQueue.current.then(() =>
        writeTextFile(path, serializedContent),
      );
      saveQueue.current = operation.catch(() => {});
      try {
        await operation;
        await syncWatchedMtime(path);
        notifyGitChanged(cwd, "index");
        if (generation === saveGeneration.current) {
          setSaveState({ status: "saved" });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (generation === saveGeneration.current) {
          setSaveState({ status: "error", message });
        }
        throw error;
      }
    },
    [cwd, path],
  );

  const stageGit = useCallback(
    async (contents: string) => {
      const relative = displayPath(path, cwd);
      if (!cwd || cwd === "~" || !relative || relative === path) {
        throw new Error("Can't stage this file");
      }
      if (!gitDiff || gitDiff.kind !== "unstaged") {
        throw new Error("Only unstaged changes can be staged");
      }
      try {
        // Keep the index convention outside the selected text hunk.
        await gitStageContents(
          cwd,
          relative,
          restoreLineEnding(contents, gitDiff.lineEnding),
        );
        notifyGitChanged(cwd, "index");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setSaveState({ status: "error", message });
        throw error;
      }
    },
    [cwd, path, gitDiff],
  );

  const dirtyChange = useCallback(
    (dirty: boolean) => {
      dirtyRef.current = dirty;
      onDirtyChange(path, dirty);
      if (dirty) {
        setSaveState((current) =>
          current.status === "saving" ? current : { status: "idle" },
        );
        return;
      }
      if (pendingDiskRef.current) {
        pendingDiskRef.current = false;
        void reloadFromDisk();
      }
    },
    [onDirtyChange, path, reloadFromDisk],
  );

  const errorCountChange = useCallback(
    (count: number) => onErrorCountChange?.(path, count),
    [onErrorCountChange, path],
  );

  const relativePath = path.startsWith(`${cwd}/`)
    ? path.slice(cwd.length + 1)
    : path;
  const footerBlameReason = useInlineBlameUnavailableReason(cwd, path);
  const diffRelative = showDiff ? displayPath(path, cwd) : "";
  const diffPending =
    showDiff &&
    !!cwd &&
    cwd !== "~" &&
    !!diffRelative &&
    diffRelative !== path &&
    gitSettledPath !== path;

  if (loadState.status === "loading" || diffPending) {
    return (
      <div className="grid h-full place-items-center text-[12px] text-content/45">
        Opening {basename(path)}…
      </div>
    );
  }

  if (loadState.status === "error") {
    return (
      <div className="grid h-full place-items-center p-6">
        <div className="max-w-md text-center">
          <AlertCircle className="mx-auto mb-3 size-5 text-red-400" />
          <p className="text-[13px] text-content">
            Couldn’t open {basename(path)}
          </p>
          <p className="mt-1 text-[12px] leading-5 text-content/50">
            {loadState.message}
          </p>
          <button
            type="button"
            onClick={() => setReloadKey((value) => value + 1)}
            className="mx-auto mt-4 flex h-7 items-center gap-1.5 rounded-md bg-content/10 px-2.5 text-[12px] text-content hover:bg-content/15"
          >
            <RotateCcw className="size-3" strokeWidth={1.75} />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      {showDiff && gitDiff?.eolOnly && (
        <p
          role="status"
          className="shrink-0 border-b border-stroke px-3 py-1 text-[12px] text-content/60"
        >
          {gitDiff.kind === "staged" ? "Staged" : "Unstaged"} line-ending
          changes. Line breaks are normalized in this view.
        </p>
      )}
      {markdown || svg ? (
        <MarkdownViewShell
          mode={mode}
          onModeChange={setMode}
          preview={
            markdown ? (
              <FilePreviewSearch
                active={active && mode === "preview"}
                contentVersion={draft}
              >
                <MarkdownDocumentPreview
                  text={draft}
                  metadataLabel="Properties"
                  cwd={cwd}
                  onOpenFile={onOpenFile}
                />
              </FilePreviewSearch>
            ) : (
              <SvgPreview source={draft} />
            )
          }
          source={
            <div className="flex h-full min-h-0 min-w-0 flex-col">
              <CodeMirrorEditor
                key={`${path}:${reloadKey}`}
                path={path}
                cwd={cwd}
                commentPath={relativePath}
                value={loadState.content}
                showDiff={showDiff}
                gitOriginal={gitOriginal}
                active={active && mode === "source"}
                navigation={navigation}
                onDirtyChange={dirtyChange}
                onErrorCountChange={errorCountChange}
                onSave={save}
                canAutosave={() => !pendingDiskRef.current}
                onStageGit={
                  showDiff && gitDiff?.kind === "unstaged"
                    ? stageGit
                    : undefined
                }
                onDocChange={setDraft}
                onOpenFile={onOpenFile}
              />
            </div>
          }
        />
      ) : (
        <CodeMirrorEditor
          key={`${path}:${reloadKey}`}
          path={path}
          cwd={cwd}
          commentPath={relativePath}
          value={loadState.content}
          showDiff={showDiff}
          gitOriginal={gitOriginal}
          active={active}
          navigation={navigation}
          onDirtyChange={dirtyChange}
          onErrorCountChange={errorCountChange}
          onSave={save}
          canAutosave={() => !pendingDiskRef.current}
          onStageGit={
            showDiff && gitDiff?.kind === "unstaged" ? stageGit : undefined
          }
          onOpenFile={onOpenFile}
        />
      )}
      <footer className="flex h-6 shrink-0 items-center border-t border-stroke px-2.5 font-mono text-[10.5px] text-content/40">
        <span className="min-w-0 flex-1 truncate" title={path}>
          {relativePath}
        </span>
        <InlineBlameToggle reason={footerBlameReason} />
        {saveState.status === "saving" ? (
          <span>Saving…</span>
        ) : saveState.status === "saved" ? (
          <span>Saved</span>
        ) : saveState.status === "error" ? (
          <span
            className="max-w-64 truncate text-red-400"
            title={saveState.message}
          >
            Save failed: {saveState.message}
          </span>
        ) : null}
      </footer>
    </div>
  );
}

export function CodeMirrorEditor({
  path,
  cwd,
  commentPath,
  value,
  showDiff,
  gitOriginal,
  active,
  navigation,
  onDirtyChange,
  onErrorCountChange,
  onSave,
  canAutosave,
  onStageGit,
  onDocChange,
  onOpenFile,
  formatOnSave = true,
}: {
  path: string;
  cwd: string;
  commentPath: string;
  value: string;
  showDiff: boolean;
  gitOriginal: string | null;
  active: boolean;
  navigation?: EditorNavigationRequest | null;
  onDirtyChange: (dirty: boolean) => void;
  onErrorCountChange: (count: number) => void;
  onSave: (content: string) => Promise<void>;
  canAutosave: () => boolean;
  onStageGit?: (contents: string) => Promise<void>;
  onDocChange?: (content: string) => void;
  /** Lets the conflict bar step to the next conflicted file. */
  onOpenFile?: (path: string) => void;
  formatOnSave?: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const leftViewRef = useRef<EditorView | null>(null);
  const savedDocumentRef = useRef<Text | null>(null);
  const dirtyRef = useRef(false);
  const activeRef = useRef(active);
  const onDirtyChangeRef = useRef(onDirtyChange);
  const onErrorCountChangeRef = useRef(onErrorCountChange);
  const onSaveRef = useRef(onSave);
  const canAutosaveRef = useRef(canAutosave);
  const onStageGitRef = useRef(onStageGit);
  const canStage = onStageGit !== undefined;
  const onDocChangeRef = useRef(onDocChange);
  const valueRef = useRef(value);
  const navigationTokenRef = useRef<number | undefined>(undefined);
  const pendingNavigationRef = useRef<EditorNavigationRequest | null>(null);
  const gitOriginalRef = useRef(gitOriginal);
  const chunkNavPinnedRef = useRef<number | null>(null);
  // The side-by-side pair, when that layout is showing. `viewRef` is then its
  // right pane, so saving, dirty tracking and reloads need no second path.
  const splitRef = useRef<MergeView | null>(null);
  // What scrolls the editor: its own scroller, or the pair's shared container.
  const scrollerRef = useRef<HTMLElement | null>(null);
  // What a rebuilt editor needs to pick up where the last one stopped.
  const carryRef = useRef<EditorCarry | null>(null);
  const lockOverscroll = useLockOverscroll<HTMLDivElement>();
  const colorScheme = useColorScheme();
  const diffLayout = useDiffLayout();
  // A file with conflict markers stays in the inline layout, where the
  // per-block actions live. Sticky for this editor, so resolving the last block
  // does not rebuild it as a side-by-side pair mid-edit.
  const [conflictInline, setConflictInline] = useState(() =>
    hasConflictMarkers(value),
  );
  useEffect(() => {
    if (!conflictInline && hasConflictMarkers(value)) setConflictInline(true);
  }, [conflictInline, value]);
  // Without a "before" there is nothing to put on the left.
  const splitDiff =
    showDiff && diffLayout === "split" && gitOriginal !== null && !conflictInline;
  const [conflictCount, setConflictCount] = useState(0);
  // Set once a block was seen, so "Mark resolved" is only offered after a
  // resolution here and not on every file that was merged before.
  const [hadConflicts, setHadConflicts] = useState(false);
  const [stillUnmerged, setStillUnmerged] = useState(false);
  const [marking, setMarking] = useState<{ busy: boolean; error: string | null }>({
    busy: false,
    error: null,
  });
  const blameReason = useInlineBlameUnavailableReason(cwd, path);
  const gitRelative = blameReason === null ? displayPath(path, cwd) : null;
  const gitTargetRef = useRef({ cwd, relative: gitRelative });
  gitTargetRef.current = { cwd, relative: gitRelative };
  const blameOn = useInlineBlame() && blameReason === null;
  const blameOnRef = useRef(blameOn);
  blameOnRef.current = blameOn;
  const [blameError, setBlameError] = useState<string | null>(null);
  const scheduleBlameRef = useRef<(() => void) | null>(null);
  const saveNowRef = useRef<(() => Promise<boolean>) | null>(null);
  const [chunkNav, setChunkNav] = useState<{
    positions: number[];
    index: number;
    additions: number;
    deletions: number;
  } | null>(null);
  const [commentTarget, setCommentTarget] =
    useState<DiffCommentComposerTarget | null>(null);
  const [selectionTarget, setSelectionTarget] =
    useState<EditorSelectionTarget | null>(null);
  const gitOptions = {
    onStage: canStage
      ? (contents: string) => onStageGitRef.current?.(contents)
      : undefined,
    onComment: setCommentTarget,
  };
  activeRef.current = active;
  onDirtyChangeRef.current = onDirtyChange;
  onErrorCountChangeRef.current = onErrorCountChange;
  onSaveRef.current = onSave;
  canAutosaveRef.current = canAutosave;
  onStageGitRef.current = onStageGit;
  onDocChangeRef.current = onDocChange;
  valueRef.current = value;
  gitOriginalRef.current = gitOriginal;

  const syncChunkNav = useCallback((view: EditorView, fromScroll = true) => {
    const split = splitRef.current;
    const positions = split
      ? splitNavigablePositions(split)
      : diffNavigablePositions(view);
    const { additions, deletions } = split
      ? splitLineStats(split)
      : diffLineStatsForView(view);
    if (positions.length === 0) {
      setChunkNav((current) =>
        current && current.positions.length === 0
          ? current
          : {
              positions: [],
              index: 0,
              additions: 0,
              deletions: 0,
            },
      );
      chunkNavPinnedRef.current = null;
      return;
    }
    let index = chunkNavPinnedRef.current;
    if (
      fromScroll ||
      index === null ||
      index < 0 ||
      index >= positions.length
    ) {
      index = diffActiveChunkIndex(
        view,
        positions,
        scrollerRef.current ?? view.scrollDOM,
      );
    }
    chunkNavPinnedRef.current = index;
    setChunkNav((current) => {
      if (
        current &&
        current.index === index &&
        current.additions === additions &&
        current.deletions === deletions &&
        current.positions.length === positions.length &&
        current.positions.every((pos, i) => pos === positions[i])
      ) {
        return current;
      }
      return { positions, index, additions, deletions };
    });
  }, []);

  const stepChunkNav = useCallback(
    (delta: number) => {
      const view = viewRef.current;
      if (!view || !chunkNav || chunkNav.positions.length === 0) return;
      const next = Math.min(
        chunkNav.positions.length - 1,
        Math.max(0, chunkNav.index + delta),
      );
      if (next === chunkNav.index) return;
      chunkNavPinnedRef.current = next;
      diffScrollToChunk(view, chunkNav.positions[next]);
      setChunkNav({
        positions: chunkNav.positions,
        index: next,
        additions: chunkNav.additions,
        deletions: chunkNav.deletions,
      });
    },
    [chunkNav],
  );

  const setDirty = (nextDirty: boolean) => {
    if (dirtyRef.current === nextDirty) return;
    dirtyRef.current = nextDirty;
    onDirtyChangeRef.current(nextDirty);
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const language = new Compartment();
    let disposed = false;
    let saveGeneration = 0;
    let autosaveTimer = 0;
    let view: EditorView;
    let split: MergeView | null = null;
    const carry = carryRef.current;
    carryRef.current = null;

    const markDirty = () => {
      const saved = savedDocumentRef.current;
      setDirty(saved ? !view.state.doc.eq(saved) : false);
    };

    /** Resolves true once the document reached the disk. */
    const saveDocument = (automatic = false): Promise<boolean> => {
      const retryPendingAutosave = autosaveTimer !== 0 && loadAutosave();
      window.clearTimeout(autosaveTimer);
      const generation = ++saveGeneration;
      return (async () => {
        const before = view.state.doc.toString();
        if (formatOnSave && loadFormatOnSave()) {
          const result = await formatText(
            path,
            before,
            view.state.selection.main.head,
          );
          if (disposed || generation !== saveGeneration) return false;

          if (
            result &&
            result.formatted !== before &&
            view.state.doc.toString() === before
          ) {
            replaceEditorDoc(view, result.formatted, {
              selection: {
                anchor: Math.min(
                  Math.max(0, result.cursorOffset),
                  result.formatted.length,
                ),
              },
              scroller: scrollerRef.current ?? undefined,
            });
          }
        }

        const document = view.state.doc;
        if (automatic && !canAutosaveRef.current()) return false;
        try {
          await onSaveRef.current(document.toString());
        } catch {
          if (
            retryPendingAutosave &&
            !disposed &&
            generation === saveGeneration &&
            dirtyRef.current
          ) {
            scheduleAutosave();
          }
          return false;
        }
        if (disposed || generation !== saveGeneration) return true;
        savedDocumentRef.current = document;
        markDirty();
        scheduleBlame();
        return true;
      })();
    };
    const save = (automatic = false) => {
      void saveDocument(automatic);
      return true;
    };
    saveNowRef.current = () => saveDocument();

    // Blame describes what is on disk, so it is fetched when it is switched on,
    // after a save and when git reports a change. One timer folds those into a
    // single request.
    let blameTimer = 0;
    const loadBlame = async () => {
      const { cwd: root, relative } = gitTargetRef.current;
      if (disposed || !blameOnRef.current || !relative) return;
      try {
        await refreshBlame(
          view,
          savedDocumentRef.current ?? view.state.doc,
          () => gitBlame(root, relative),
          () => !disposed && blameOnRef.current,
        );
        if (!disposed) setBlameError(null);
      } catch (error: unknown) {
        if (disposed || !blameOnRef.current) return;
        setBlameError(error instanceof Error ? error.message : String(error));
      }
    };
    function scheduleBlame() {
      window.clearTimeout(blameTimer);
      blameTimer = window.setTimeout(() => void loadBlame(), 120);
    }
    scheduleBlameRef.current = scheduleBlame;
    const unsubscribeGit = subscribeGitChanged(
      () => {
        if (blameOnRef.current && !document.hidden) scheduleBlame();
      },
      { cwd: gitTargetRef.current.cwd },
    );

    function scheduleAutosave() {
      window.clearTimeout(autosaveTimer);
      if (!loadAutosave()) return;
      autosaveTimer = window.setTimeout(() => {
        autosaveTimer = 0;
        if (
          dirtyRef.current &&
          loadAutosave() &&
          canAutosaveRef.current()
        ) {
          save(true);
        }
      }, FILE_EDITOR_AUTOSAVE_DELAY_MS);
    }

    // Folding would pull one pane's lines out of line with the other, and the
    // pair scrolls as a whole, so the editor's own scrollbar has no job.
    const extensions: Extension[] = [
      minimalSetup,
      showDiff && !splitDiff ? editorGitConfig.of(editorGit(gitOptions)) : [],
      // Ahead of the line numbers, so the blame gutter is the leftmost one.
      editorBlameConfig.of(blameOnRef.current ? inlineBlameExtension : []),
      editorConflicts,
      lineNumbers(),
      splitDiff ? [] : foldGutter(),
      highlightActiveLine(),
      highlightActiveLineGutter(),
      EditorView.lineWrapping,
      wrappedLineIndent,
      language.of([]),
      editorScheme.of(schemeExtensions(isLightScheme() ? "light" : "dark")),
      editorMatching,
      editorTyping(path),
      editorAutocomplete,
      editorLint(path, (count) => onErrorCountChangeRef.current(count)),
      splitDiff ? [] : [editorOverview, editorScrollbar],
      editorSearch,
      Prec.high(
        keymap.of([
          ...(splitDiff ? [] : foldKeymap),
          { key: "Mod-s", run: () => save(), preventDefault: true },
          {
            key: "Tab",
            run: (view) => {
              if (
                completionStatus(view.state) === "active" &&
                acceptCompletion(view)
              ) {
                return true;
              }
              return tryExpandEmmet(view) || indentOrInsertTab(view);
            },
            shift: indentLess,
            preventDefault: true,
          },
        ]),
      ),
      EditorView.updateListener.of((update) => {
        if (
          update.transactions.some(
            (tr) =>
              (tr.selection || tr.docChanged) &&
              !tr.annotation(diskReload) &&
              !tr.annotation(sourceNavigation),
          )
        ) {
          pendingNavigationRef.current = null;
        }
        if (update.selectionSet) {
          setSelectionTarget(
            editorSelectionTarget(
              update.view,
              commentPath,
              scrollerRef.current ?? update.view.scrollDOM,
            ),
          );
        } else if (update.docChanged) {
          setSelectionTarget(null);
        }
        if (!update.docChanged) return;
        setConflictCount(conflictBlocks(update.state).length);
        onDocChangeRef.current?.(update.state.doc.toString());
        if (update.transactions.some((tr) => tr.annotation(diskReload))) {
          return;
        }
        markDirty();
        scheduleAutosave();
      }),
      EditorView.domEventHandlers({
        blur: () => {
          pendingNavigationRef.current = null;
        },
      }),
      showDiff
        ? EditorView.updateListener.of((update) => {
            const relevant = splitDiff
              ? splitNavUpdateRelevant(update)
              : diffNavUpdateRelevant(update);
            if (!relevant) return;
            chunkNavPinnedRef.current = null;
            syncChunkNav(update.view);
          })
        : [],
    ];
    // Unsaved edits survive a rebuild; anything else re-reads the file.
    const initialDoc = carry?.doc ?? valueRef.current;
    let leftView: EditorView | null = null;
    if (splitDiff) {
      split = createSplitDiff({
        parent: host,
        original: gitOriginalRef.current ?? "",
        doc: initialDoc,
        extensions,
        originalExtensions: [
          minimalSetup,
          lineNumbers(),
          EditorView.lineWrapping,
          wrappedLineIndent,
          language.of([]),
          editorScheme.of(schemeExtensions(isLightScheme() ? "light" : "dark")),
        ],
        stage: () => onStageGitRef.current,
      });
      view = split.b;
      leftView = split.a;
      leftViewRef.current = leftView;
    } else {
      view = new EditorView({ doc: initialDoc, parent: host, extensions });
    }
    splitRef.current = split;
    const detachSplitOverview = split ? attachSplitOverview(split) : null;
    scrollerRef.current = split ? split.dom : view.scrollDOM;
    if (carry?.saved) {
      savedDocumentRef.current = carry.saved;
    } else {
      savedDocumentRef.current = view.state.doc;
      dirtyRef.current = false;
    }
    viewRef.current = view;
    setConflictCount(conflictBlocks(view.state).length);
    if (blameOnRef.current) scheduleBlame();
    lockOverscroll(scrollerRef.current as HTMLDivElement);
    if (carry) {
      view.dispatch({
        selection: { anchor: Math.min(carry.head, view.state.doc.length) },
      });
      scrollLineToTop(view, carry.topLine);
      if (dirtyRef.current) scheduleAutosave();
    }
    if (showDiff) {
      if (!splitDiff && gitOriginalRef.current) {
        setGitOriginal(view, gitOriginalRef.current);
      }
      syncChunkNav(view);
    } else {
      setChunkNav({
        positions: [],
        index: 0,
        additions: 0,
        deletions: 0,
      });
    }
    if (activeRef.current) view.focus();

    void languageForPath(path).then((extension) => {
      if (!disposed && extension) {
        const reconfigure = { effects: language.reconfigure(extension) };
        view.dispatch(reconfigure);
        leftView?.dispatch(reconfigure);
      }
    });

    return () => {
      disposed = true;
      window.clearTimeout(autosaveTimer);
      window.clearTimeout(blameTimer);
      unsubscribeGit();
      saveNowRef.current = null;
      scheduleBlameRef.current = null;
      setConflictCount(0);
      onErrorCountChangeRef.current(0);
      lockOverscroll(null);
      carryRef.current = {
        doc: dirtyRef.current ? view.state.doc : null,
        saved: dirtyRef.current ? savedDocumentRef.current : null,
        head: view.state.selection.main.head,
        topLine: topVisibleLine(view, scrollerRef.current ?? view.scrollDOM),
      };
      viewRef.current = null;
      leftViewRef.current = null;
      splitRef.current = null;
      scrollerRef.current = null;
      savedDocumentRef.current = null;
      setChunkNav(null);
      setSelectionTarget(null);
      detachSplitOverview?.();
      if (split) split.destroy();
      else view.destroy();
    };
  }, [formatOnSave, lockOverscroll, path, showDiff, splitDiff, syncChunkNav]);

  useEffect(() => {
    const reconfigure = {
      effects: editorScheme.reconfigure(schemeExtensions(colorScheme)),
    };
    viewRef.current?.dispatch(reconfigure);
    leftViewRef.current?.dispatch(reconfigure);
  }, [colorScheme]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: editorBlameConfig.reconfigure(
        blameOn ? inlineBlameExtension : [],
      ),
    });
    if (blameOn) scheduleBlameRef.current?.();
    else setBlameError(null);
  }, [blameOn]);

  useEffect(() => {
    if (conflictCount > 0) setHadConflicts(true);
  }, [conflictCount]);

  // The file stays unmerged in git until it is staged, whatever the buffer says.
  useEffect(() => {
    if (conflictCount > 0 || !hadConflicts || !gitRelative) {
      setStillUnmerged(false);
      return;
    }
    let cancelled = false;
    const check = () => {
      gitConflicts(cwd).then(
        (files) => {
          if (!cancelled) setStillUnmerged(files.includes(gitRelative));
        },
        () => {
          if (!cancelled) setStillUnmerged(false);
        },
      );
    };
    check();
    const unsubscribe = subscribeGitChanged(check, { cwd });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [conflictCount, cwd, gitRelative, hadConflicts]);

  const [fileNote, setFileNote] = useState<string | null>(null);
  useEffect(() => setFileNote(null), [path]);

  // The next file git still lists as unmerged, wrapping around.
  const openNextConflictedFile = useCallback(async () => {
    if (!onOpenFile) return;
    try {
      const next = nextConflictedFile(await gitConflicts(cwd), gitRelative);
      if (!next) {
        setFileNote("No other conflicted files");
        return;
      }
      setFileNote(null);
      onOpenFile(`${cwd.replace(/[\\/]+$/, "")}/${next}`);
    } catch (error: unknown) {
      setFileNote(error instanceof Error ? error.message : String(error));
    }
  }, [cwd, gitRelative, onOpenFile]);

  const markResolved = useCallback(async () => {
    if (!gitRelative) return;
    setMarking({ busy: true, error: null });
    try {
      const saved = (await saveNowRef.current?.()) ?? false;
      if (!saved || dirtyRef.current) throw new Error("Couldn't save the file");
      await gitStageFile(cwd, gitRelative);
      notifyGitChanged(cwd, "index");
      setHadConflicts(false);
      setMarking({ busy: false, error: null });
    } catch (error: unknown) {
      setMarking({
        busy: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, [cwd, gitRelative]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !showDiff || splitDiff) return;
    view.dispatch({
      effects: editorGitConfig.reconfigure(editorGit(gitOptions)),
    });
  }, [canStage, showDiff, splitDiff]);

  useEffect(() => {
    if (splitRef.current) setSplitCanStage(splitRef.current, canStage);
  }, [canStage, splitDiff]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !showDiff) return;
    const split = splitRef.current;
    let changed = false;
    preserveEditorViewport(
      view,
      () => {
        changed = split
          ? setSplitOriginal(split, gitOriginal ?? "")
          : setGitOriginal(view, gitOriginal);
      },
      scrollerRef.current ?? view.scrollDOM,
    );
    if (!changed) return;
    chunkNavPinnedRef.current = null;
    syncChunkNav(view);
  }, [gitOriginal, showDiff, splitDiff, syncChunkNav]);

  useEffect(() => {
    const view = viewRef.current;
    const scroller = scrollerRef.current;
    if (!view || !scroller || !showDiff) return;
    const onScroll = () => {
      chunkNavPinnedRef.current = null;
      syncChunkNav(view);
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => scroller.removeEventListener("scroll", onScroll);
  }, [showDiff, splitDiff, syncChunkNav, path]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || dirtyRef.current) return;
    if (view.state.doc.toString() === value) return;
    replaceEditorDoc(view, value, {
      annotations: [Transaction.addToHistory.of(false), diskReload.of(true)],
      scroller: scrollerRef.current ?? undefined,
    });
    savedDocumentRef.current = view.state.doc;
    setDirty(false);
    if (showDiff) {
      chunkNavPinnedRef.current = null;
      syncChunkNav(view);
    }
  }, [showDiff, syncChunkNav, value]);

  useEffect(() => {
    if (!navigation) {
      pendingNavigationRef.current = null;
      return;
    }
    if (navigationTokenRef.current !== navigation.token) {
      navigationTokenRef.current = navigation.token;
      pendingNavigationRef.current = navigation;
    }
    const pending = pendingNavigationRef.current;
    if (!pending) return;
    const view = viewRef.current;
    if (!view) return;

    let cancelled = false;
    const run = () => {
      if (cancelled || pendingNavigationRef.current !== pending) return;
      revealNavigation(view, pending);
      // Retry a clamped location only while its line has not arrived and
      // the user has not moved the caret, edited the file, or left the editor.
      if (pending.line <= view.state.doc.lines) {
        pendingNavigationRef.current = null;
      }
    };
    requestAnimationFrame(() => requestAnimationFrame(run));

    return () => {
      cancelled = true;
    };
  }, [navigation, value]);

  useEffect(() => {
    if (!active) return;
    const view = viewRef.current;
    if (!view) return;
    view.requestMeasure();
    const activeEl = document.activeElement;
    if (
      activeEl &&
      view.dom.contains(activeEl) &&
      activeEl !== view.contentDOM
    ) {
      return;
    }
    view.focus();
  }, [active, path]);

  useEffect(() => {
    if (!active) setSelectionTarget(null);
  }, [active]);

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {showDiff ? (
          <DiffChunkNav
            index={chunkNav?.index ?? 0}
            total={chunkNav?.positions.length ?? 0}
            additions={chunkNav?.additions ?? 0}
            deletions={chunkNav?.deletions ?? 0}
            onPrev={() => stepChunkNav(-1)}
            onNext={() => stepChunkNav(1)}
          />
        ) : null}
        <EditorConflictBar
          count={conflictCount}
          canMarkResolved={hadConflicts && stillUnmerged}
          marking={marking.busy}
          error={marking.error}
          onPrev={() => viewRef.current && stepConflict(viewRef.current, -1)}
          onNext={() => viewRef.current && stepConflict(viewRef.current, 1)}
          onNextFile={onOpenFile && gitRelative ? () => void openNextConflictedFile() : undefined}
          fileNote={fileNote}
          onMarkResolved={() => void markResolved()}
        />
        {blameOn && blameError ? (
          <p
            role="status"
            className="shrink-0 truncate border-b border-stroke px-3 py-1 text-[11px] text-content/45"
            title={blameError}
          >
            Blame unavailable: {blameError}
          </p>
        ) : null}
        <div ref={hostRef} className="relative min-h-0 flex-1" />
      </div>
      {commentTarget ? (
        <DiffCommentComposer
          path={commentPath}
          target={commentTarget}
          onDismiss={() => setCommentTarget(null)}
        />
      ) : null}
      <EditorSelectionMenu
        selection={selectionTarget}
        onDismiss={() => setSelectionTarget(null)}
      />
    </>
  );
}

function editorSelectionTarget(
  view: EditorView,
  path: string,
  scroller: HTMLElement,
): EditorSelectionTarget | null {
  if (view.state.selection.ranges.length !== 1) return null;
  const selection = view.state.selection.main;
  if (selection.empty) return null;

  const text = view.state.sliceDoc(selection.from, selection.to);
  if (!text.trim()) return null;
  const coordinates = view.coordsAtPos(
    selection.head,
    selection.head === selection.from ? 1 : -1,
  );
  if (!coordinates) return null;

  const viewport = scroller.getBoundingClientRect();
  if (
    coordinates.bottom < viewport.top ||
    coordinates.top > viewport.bottom ||
    coordinates.right < viewport.left ||
    coordinates.left > viewport.right
  ) {
    return null;
  }

  const lastSelectedPosition = Math.max(selection.from, selection.to - 1);
  return {
    path,
    startLine: view.state.doc.lineAt(selection.from).number,
    endLine: view.state.doc.lineAt(lastSelectedPosition).number,
    anchor: new DOMRect(
      coordinates.left,
      coordinates.top,
      Math.max(1, coordinates.right - coordinates.left),
      Math.max(1, coordinates.bottom - coordinates.top),
    ),
  };
}

function DiffChunkNav({
  index,
  total,
  additions,
  deletions,
  onPrev,
  onNext,
}: {
  index: number;
  total: number;
  additions: number;
  deletions: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <header
      className="flex h-8 shrink-0 items-center justify-between gap-3 border-b border-stroke px-3 pr-1"
      role="toolbar"
      aria-label="Jump between changes"
    >
      <DiffChunkStat additions={additions} deletions={deletions} />
      <div className="flex items-center gap-0.5">
        <DiffLayoutToggle className="mr-1" />
        <button
          type="button"
          title="Previous change"
          aria-label="Previous change"
          disabled={total === 0 || index <= 0}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onPrev}
          className="grid size-6 place-items-center rounded text-content/70 hover:bg-content/10 hover:text-content disabled:opacity-35"
        >
          <ChevronUp className="size-3.5" strokeWidth={1.75} />
        </button>
        <span className="min-w-10 px-0.5 text-center font-mono text-[10.5px] font-medium tabular-nums text-content/55 select-none">
          {total === 0 ? "0/0" : `${index + 1}/${total}`}
        </span>
        <button
          type="button"
          title="Next change"
          aria-label="Next change"
          disabled={total === 0 || index >= total - 1}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onNext}
          className="grid size-6 place-items-center rounded text-content/70 hover:bg-content/10 hover:text-content disabled:opacity-35"
        >
          <ChevronDown className="size-3.5" strokeWidth={1.75} />
        </button>
      </div>
    </header>
  );
}

function DiffChunkStat({
  additions,
  deletions,
}: {
  additions: number;
  deletions: number;
}) {
  if (additions <= 0 && deletions <= 0) {
    return <span className="min-w-0 flex-1" />;
  }
  return (
    <span className="flex min-w-0 shrink-0 items-center gap-1.5 font-sans text-[11px] font-semibold tabular-nums">
      {additions > 0 ? (
        <span className="text-emerald-400">+{formatInteger(additions)}</span>
      ) : null}
      {deletions > 0 ? (
        <span className="text-red-400">-{formatInteger(deletions)}</span>
      ) : null}
    </span>
  );
}

function revealNavigation(view: EditorView, target: EditorNavigation) {
  const lineNumber = Math.min(Math.max(1, target.line), view.state.doc.lines);
  const line = view.state.doc.line(lineNumber);
  const column = Math.max(1, target.column ?? 1);
  const anchor = Math.min(line.from + column - 1, line.to);
  view.dispatch({
    selection: { anchor },
    effects: EditorView.scrollIntoView(anchor, { y: "center" }),
    annotations: sourceNavigation.of(true),
  });
  view.focus();
}

const diskReload = Annotation.define<boolean>();
const sourceNavigation = Annotation.define<boolean>();

function indentOrInsertTab(view: EditorView): boolean {
  const { state, dispatch } = view;
  if (state.readOnly) return false;
  if (state.selection.ranges.some((range) => !range.empty)) {
    return indentMore(view);
  }

  const unit = state.facet(indentUnit);
  if (unit === "\t") {
    dispatch(
      state.update(state.replaceSelection("\t"), {
        scrollIntoView: true,
        userEvent: "input",
      }),
    );
    return true;
  }

  const width = getIndentUnit(state);
  dispatch(
    state.update(
      state.changeByRange((range) => {
        const line = state.doc.lineAt(range.head);
        const column = countColumn(
          line.text.slice(0, range.head - line.from),
          state.tabSize,
        );
        const insert = " ".repeat(width - (column % width) || width);
        return {
          changes: { from: range.head, insert },
          range: EditorSelection.cursor(range.head + insert.length),
        };
      }),
      { scrollIntoView: true, userEvent: "input" },
    ),
  );
  return true;
}

type LineRange = { from: number; to: number };

type EditorCarry = {
  /** Set only when the old editor held unsaved edits. */
  doc: Text | null;
  saved: Text | null;
  head: number;
  topLine: number;
};

const wrappedLineIndent = StateField.define<DecorationSet>({
  create(state) {
    return Decoration.set(
      indentDecorations(state, [{ from: 0, to: state.doc.length }]),
      true,
    );
  },
  update(decorations, transaction) {
    if (!transaction.docChanged) return decorations;
    const ranges: LineRange[] = [];
    transaction.changes.iterChangedRanges((_fromA, _toA, fromB, toB) => {
      const from = transaction.state.doc.lineAt(fromB).from;
      const to = transaction.state.doc.lineAt(toB).to;
      ranges.push({ from, to });
    });
    const changedLines = mergeLineRanges(ranges);
    return decorations.map(transaction.changes).update({
      filter: (from) =>
        !changedLines.some((range) => from >= range.from && from <= range.to),
      add: indentDecorations(transaction.state, changedLines),
      sort: true,
    });
  },
  provide: (field) => EditorView.decorations.from(field),
});

function indentDecorations(state: EditorState, ranges: LineRange[]) {
  const decorations = [];
  for (const range of ranges) {
    let line = state.doc.lineAt(range.from);
    while (line.from <= range.to) {
      const columns = leadingIndentColumns(line.text, state.tabSize);
      if (columns > 0) {
        const indent = Math.min(columns, 40);
        decorations.push(
          Decoration.line({
            attributes: {
              class: "cm-wrapped-indent",
              style: `padding-left: calc(${indent}ch + 6px); text-indent: -${indent}ch`,
            },
          }).range(line.from),
        );
      }
      if (line.number >= state.doc.lines) break;
      line = state.doc.line(line.number + 1);
    }
  }
  return decorations;
}

function leadingIndentColumns(text: string, tabSize: number): number {
  let columns = 0;
  for (const character of text) {
    if (character === " ") {
      columns += 1;
    } else if (character === "\t") {
      columns += tabSize - (columns % tabSize);
    } else {
      break;
    }
  }
  return columns;
}

function mergeLineRanges(ranges: LineRange[]): LineRange[] {
  const sorted = [...ranges].sort((a, b) => a.from - b.from);
  const merged: LineRange[] = [];
  for (const range of sorted) {
    const previous = merged[merged.length - 1];
    if (previous && range.from <= previous.to + 1) {
      previous.to = Math.max(previous.to, range.to);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

/**
 * SVG is text, so it stays editable in CodeMirror and renders through an
 * `<img>` rather than inline. In that context the webview runs no script and
 * fetches no external reference the document asks for, which is what makes it
 * safe to preview a file the agent may have just written.
 */
function SvgPreview({ source }: { source: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const next = URL.createObjectURL(
      new Blob([source], { type: "image/svg+xml" }),
    );
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [source]);

  if (!url) return null;
  return (
    <div className="grid h-full place-items-center overflow-auto p-6">
      <img src={url} alt="" className="max-h-full max-w-full object-contain" />
    </div>
  );
}

function isSvgPath(path: string): boolean {
  return basename(path).toLowerCase().endsWith(".svg");
}

function isMarkdownPath(path: string): boolean {
  const name = basename(path).toLowerCase();
  const extension = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";
  return [".md", ".mdx", ".markdown"].includes(extension);
}
