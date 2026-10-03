import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Loader } from "../../../shared/ui/icons";
import {
  gitDiffFiles,
  gitDiscardFile,
  gitFileDiff,
  gitStageContents,
  gitStageFile,
  notifyGitChanged,
  subscribeGitChanged,
  type GitChangedFile,
  type GitFileDiffKind,
} from "../../../platform/tauri/fs";
import { forEachConcurrent } from "../../../shared/lib/concurrent";
import { buildUnifiedFile, type UnifiedFileDiff } from "../model/unifiedDiff";
import {
  prioritizeWorkingTreeDiffEntries,
  workingTreeDiffEntries,
  workingTreeDiffEntryLabel,
  workingTreeDiffFocusId,
} from "../model/workingTreeDiff";
import { stageChunkText } from "../../files/editor/editorGit";
import { LINE_DIFF_CONFIG } from "../model/lineDiff";
import { confirmDiscardFile } from "../model/gitConfirmation";
import { UnifiedDiffView, type UnifiedDiffFileModel } from "./UnifiedDiffView";

type Props = {
  cwd: string;
  focusPath?: string;
  focusKind?: GitFileDiffKind;
  focusRequest?: number;
};

type LoadedDiff = {
  binary: boolean;
  tooLarge: boolean;
  original: string;
  current: string;
  unified: UnifiedFileDiff | null;
  error?: string;
};

const DIFF_LOAD_CONCURRENCY = 4;

export function WorkingTreeDiff({
  cwd,
  focusPath,
  focusKind,
  focusRequest,
}: Props) {
  const [files, setFiles] = useState<GitChangedFile[] | null>(null);
  const [diffs, setDiffs] = useState<Map<string, LoadedDiff>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const mutationQueue = useRef(Promise.resolve());
  const pendingIds = useRef(new Set<string>());
  const mutationContext = useRef({ cwd, active: true });
  useEffect(() => {
    const context = { cwd, active: true };
    mutationContext.current = context;
    setBusyId(null);
    setMutationError(null);
    return () => {
      context.active = false;
    };
  }, [cwd]);

  const enqueueMutation = useCallback(
    (id: string, action: () => Promise<boolean | void>) => {
      const context = mutationContext.current;
      const key = `${cwd}\0${id}`;
      if (pendingIds.current.has(key)) return;
      pendingIds.current.add(key);
      const task = mutationQueue.current
        .then(async () => {
          if (!context.active) return;
          setBusyId(id);
          setMutationError(null);
          try {
            if ((await action()) !== false) notifyGitChanged(cwd, "index");
          } catch (caught) {
            if (context.active)
              setMutationError(
                caught instanceof Error ? caught.message : String(caught),
              );
          } finally {
            if (context.active) setBusyId(null);
          }
        })
        .finally(() => {
          pendingIds.current.delete(key);
        });
      mutationQueue.current = task;
      return task;
    },
    [cwd],
  );
  const diffsRef = useRef(diffs);
  diffsRef.current = diffs;

  useEffect(() => {
    setError(null);
    if (!cwd || cwd === "~") {
      setFiles([]);
      setDiffs(new Map());
      return;
    }

    let disposed = false;
    let generation = 0;
    setFiles(null);
    setDiffs(new Map());

    const run = () => {
      const current = ++generation;
      setError(null);
      void gitDiffFiles(cwd)
        .then(async (index) => {
          if (disposed || current !== generation) return;
          setFiles(index.files);
          setError(null);
          const entries = workingTreeDiffEntries(index.files, focusKind);
          // A refresh keeps each loaded diff on screen until its replacement
          // arrives; only files that left the list are dropped.
          const kept = new Set(entries.map((entry) => entry.id));
          setDiffs((existing) => {
            if ([...existing.keys()].every((id) => kept.has(id))) {
              return existing;
            }
            return new Map([...existing].filter(([id]) => kept.has(id)));
          });
          const loadOrder = prioritizeWorkingTreeDiffEntries(
            entries,
            focusPath,
            focusKind,
          );
          await forEachConcurrent(
            loadOrder,
            DIFF_LOAD_CONCURRENCY,
            async (entry) => {
              let loaded: LoadedDiff;
              try {
                const diff = await gitFileDiff(
                  cwd,
                  entry.file.relative,
                  entry.kind,
                );
                const unified =
                  !diff.binary && !diff.tooLarge
                    ? buildUnifiedFile(diff.original, diff.current)
                    : null;
                loaded = {
                  binary: diff.binary,
                  tooLarge: diff.tooLarge,
                  original: diff.original,
                  current: diff.current,
                  unified,
                };
              } catch (caught: unknown) {
                loaded = {
                  binary: false,
                  tooLarge: false,
                  original: "",
                  current: "",
                  unified: null,
                  error:
                    caught instanceof Error ? caught.message : String(caught),
                };
              }
              if (disposed || current !== generation) return;
              setDiffs((existing) => {
                const next = new Map(existing);
                next.set(entry.id, loaded);
                return next;
              });
            },
            () => !disposed && current === generation,
          );
        })
        .catch((caught: unknown) => {
          if (disposed || current !== generation) return;
          setError(caught instanceof Error ? caught.message : String(caught));
          setFiles([]);
        });
    };

    run();
    let refreshFrame = 0;
    const scheduleRun = () => {
      if (refreshFrame) return;
      refreshFrame = window.requestAnimationFrame(() => {
        refreshFrame = 0;
        run();
      });
    };
    const unsub = subscribeGitChanged(scheduleRun, { cwd });
    const onFocus = () => {
      if (!document.hidden) scheduleRun();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      disposed = true;
      if (refreshFrame) window.cancelAnimationFrame(refreshFrame);
      unsub();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [cwd, focusKind, retry]);

  // A review opened from the Changes or Staged Changes section shows only that side.
  const entries = useMemo(
    () => workingTreeDiffEntries(files ?? [], focusKind),
    [files, focusKind],
  );

  const models = useMemo<UnifiedDiffFileModel[]>(() => {
    if (!files) return [];
    return entries.map((entry) => {
      const { file, kind } = entry;
      const loaded = diffs.get(entry.id);
      const unified = loaded?.unified ?? null;
      const unchanged =
        unified != null &&
        unified.additions === 0 &&
        unified.deletions === 0 &&
        !loaded?.binary;
      const canUseIndexCounts =
        loaded != null && !loaded.error && !(file.staged && file.unstaged);
      return {
        id: entry.id,
        path: file.path,
        label: workingTreeDiffEntryLabel(entry),
        binary: loaded?.binary,
        tooLarge: loaded?.tooLarge,
        emptyMessage:
          loaded == null
            ? "Loading…"
            : loaded.error
              ? `Couldn’t load diff: ${loaded.error}`
              : unchanged
                ? kind === "staged"
                  ? "No staged changes"
                  : "No unstaged changes"
                : undefined,
        additions:
          unified?.additions ?? (canUseIndexCounts ? file.additions : 0),
        deletions:
          unified?.deletions ?? (canUseIndexCounts ? file.deletions : 0),
        blocks: unchanged ? [] : (unified?.blocks ?? []),
        canStage: kind === "unstaged",
        canDiscard: kind === "unstaged",
        canStageHunk:
          kind === "unstaged" && !loaded?.binary && !loaded?.tooLarge,
      };
    });
  }, [diffs, entries, files]);

  const totals = useMemo(
    () =>
      models.reduce(
        (sum, file) => ({
          additions: sum.additions + file.additions,
          deletions: sum.deletions + file.deletions,
        }),
        { additions: 0, deletions: 0 },
      ),
    [models],
  );

  const focusId = useMemo(
    () => workingTreeDiffFocusId(entries, focusPath, focusKind),
    [entries, focusKind, focusPath],
  );

  const onStageFile = useCallback(
    async (id: string) => {
      const entry = entries.find((candidate) => candidate.id === id);
      if (!entry || entry.kind !== "unstaged") return;
      await enqueueMutation(id, () => gitStageFile(cwd, entry.file.relative));
    },
    [cwd, entries, enqueueMutation],
  );

  const onDiscardFile = useCallback(
    async (id: string) => {
      const entry = entries.find((candidate) => candidate.id === id);
      if (!entry || entry.kind !== "unstaged") return;
      await enqueueMutation(id, async () => {
        if (!(await confirmDiscardFile(entry.file))) return false;
        await gitDiscardFile(cwd, entry.file.relative);
      });
    },
    [cwd, entries, enqueueMutation],
  );

  const onStageHunk = useCallback(
    async (id: string, pos: number) => {
      const entry = entries.find((candidate) => candidate.id === id);
      if (!entry || entry.kind !== "unstaged") return;
      const loaded = diffsRef.current.get(id);
      if (!loaded || loaded.error || loaded.binary || loaded.tooLarge) return;
      // Same diff the view used to produce `pos`, so the same hunk is staged.
      const next = stageChunkText(
        loaded.original,
        loaded.current,
        pos,
        null,
        LINE_DIFF_CONFIG,
      );
      if (next == null) return;
      await enqueueMutation(id, () =>
        gitStageContents(cwd, entry.file.relative, next),
      );
    },
    [cwd, entries, enqueueMutation],
  );

  if (!cwd || cwd === "~") {
    return (
      <p className="grid h-full place-items-center text-[13px] text-content/45">
        No project folder
      </p>
    );
  }
  if (error) {
    return (
      <div className="grid h-full place-items-center p-6 text-center">
        <AlertCircle className="mx-auto mb-3 size-5 text-red-400" />
        <p className="text-[13px] text-content">Couldn’t load changes</p>
        <p className="mt-1 text-[12px] text-content/50">{error}</p>
        <button
          type="button"
          onClick={() => setRetry((value) => value + 1)}
          className="mt-3 text-[13px] text-content"
        >
          Retry
        </button>
      </div>
    );
  }
  if (files == null) {
    return (
      <div className="grid h-full place-items-center text-content/40">
        <Loader className="size-4 animate-spin" strokeWidth={1.75} />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {mutationError && (
        <p role="alert" className="shrink-0 px-3 py-2 text-[12px] text-red-400">
          {mutationError}
        </p>
      )}
      <UnifiedDiffView
        files={models}
        fileCount={focusKind ? entries.length : files.length}
        focusId={focusId}
        focusRequest={focusRequest}
        busyId={busyId}
        totals={totals}
        onStageFile={onStageFile}
        onDiscardFile={onDiscardFile}
        onStageHunk={onStageHunk}
      />
    </div>
  );
}
