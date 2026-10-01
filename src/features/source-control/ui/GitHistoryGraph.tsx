import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { ask, message } from "@tauri-apps/plugin-dialog";
import {
  ChevronDown,
  ChevronRight,
  GitBranch,
  Maximize2,
  Search,
} from "../../../shared/ui/icons";
import { suppressTextSelection } from "../../../shared/lib/drag";
import {
  gitCheckoutCommit,
  gitCherryPick,
  gitCreateBranchAt,
  gitCreateTag,
  gitHistory,
  gitReset,
  gitRevert,
  notifyGitChanged,
  subscribeGitChanged,
  type GitHistoryCommit,
} from "../../../platform/tauri/fs";
import { ExplorerMenu } from "../../files/ui/ExplorerMenu";
import { isRemoteProjectPath } from "../../projects/model/recents";
import { commitMenuItems, filterHistory } from "../model/commitActions";
import { layoutGitGraph } from "../model/gitGraph";
import { GitGraphDialog } from "./GitGraphDialog";
import { GitGraphList, type GraphListItem } from "./GitGraphList";
import { GraphSearchInput } from "./GitGraphParts";
import { RefNameDialog } from "./RefNameDialog";

type Props = {
  cwd: string;
  enabled: boolean;
  expanded: boolean;
  selectedSha?: string;
  onToggleExpanded: () => void;
  onOpenCommit: (commit: GitHistoryCommit, pin?: boolean) => void;
};

const HISTORY_PAGE = 200;

const historyByCwd = new Map<string, GitHistoryCommit[]>();

/** Remembered across remounts, like the panel height. */
let graphShowAll = false;

function errorText(error: unknown): string {
  if (typeof error === "string") return error;
  return error instanceof Error ? error.message : String(error);
}

const HEADER_BUTTON =
  "mr-1 grid size-5 shrink-0 place-items-center rounded-md text-content/50 hover:bg-content/8 hover:text-content aria-pressed:bg-content/10 aria-pressed:text-content";

export function GitHistoryGraph({
  cwd,
  enabled,
  expanded,
  selectedSha,
  onToggleExpanded,
  onOpenCommit,
}: Props) {
  // Commit actions and the wider scope are not implemented for connected machines.
  const local = !isRemoteProjectPath(cwd);
  const [showAll, setShowAll] = useState(graphShowAll);
  const [limit, setLimit] = useState(HISTORY_PAGE);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { commits } = useGitHistory(cwd, enabled && expanded, local && showAll, limit);
  const rows = useMemo(() => layoutGitGraph(commits), [commits]);
  const rowBySha = useMemo(
    () => new Map(commits.map((commit, index) => [commit.sha, rows[index]])),
    [commits, rows],
  );
  const [fullOpen, setFullOpen] = useState(false);
  // The full-graph dialog has its own search field bound to the same query.
  const searching = (searchOpen || fullOpen) && query.trim() !== "";
  const items = useMemo(() => {
    const visible = searching ? filterHistory(commits, query) : commits;
    return visible.flatMap((commit): GraphListItem[] => {
      const row = rowBySha.get(commit.sha);
      return row ? [{ commit, row }] : [];
    });
  }, [commits, query, searching, rowBySha]);
  const hasMore = commits.length >= limit;

  useEffect(() => setLimit(HISTORY_PAGE), [cwd, showAll]);

  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    commit: GitHistoryCommit;
  } | null>(null);
  const [naming, setNaming] = useState<{
    kind: "branch" | "tag";
    commit: GitHistoryCommit;
  } | null>(null);
  const [namingBusy, setNamingBusy] = useState(false);
  const [namingError, setNamingError] = useState<string | null>(null);

  const run = async (action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (error) {
      await message(errorText(error), { title: "MonoCode", kind: "error" });
    } finally {
      // Also after a failure: a conflict leaves the tree and index changed.
      notifyGitChanged();
    }
  };

  const onPick = async (id: string, commit: GitHistoryCommit) => {
    const { sha } = commit;
    switch (id) {
      case "checkout":
        return run(() => gitCheckoutCommit(cwd, sha));
      case "branch":
      case "tag":
        setNamingError(null);
        setNaming({ kind: id, commit });
        return;
      case "cherry-pick":
        return run(() => gitCherryPick(cwd, sha));
      case "revert":
        return run(() => gitRevert(cwd, sha));
      case "reset-soft":
        return run(() => gitReset(cwd, sha, "soft"));
      case "reset-mixed":
        return run(() => gitReset(cwd, sha, "mixed"));
      case "reset-hard": {
        const confirmed = await ask(
          `Reset the current branch to ${commit.shortSha} and discard all uncommitted changes? This cannot be undone.`,
          { title: "MonoCode", kind: "warning", okLabel: "Reset" },
        );
        if (confirmed) await run(() => gitReset(cwd, sha, "hard"));
        return;
      }
      case "copy-sha":
        await navigator.clipboard.writeText(sha);
        return;
    }
  };

  const submitName = async (name: string) => {
    if (!naming) return;
    setNamingBusy(true);
    setNamingError(null);
    try {
      if (naming.kind === "branch") {
        await gitCreateBranchAt(cwd, name, naming.commit.sha);
      } else {
        await gitCreateTag(cwd, name, naming.commit.sha);
      }
      setNaming(null);
      notifyGitChanged();
    } catch (error) {
      setNamingError(errorText(error));
    } finally {
      setNamingBusy(false);
    }
  };

  const showAllButton =
    local ? (
      <button
        type="button"
        title={showAll ? "Showing all branches" : "Show all branches"}
        aria-label="Show all branches"
        aria-pressed={showAll}
        onClick={() => {
          graphShowAll = !showAll;
          setShowAll(graphShowAll);
        }}
        className={HEADER_BUTTON}
      >
        <GitBranch className="size-3.5" strokeWidth={1.75} />
      </button>
    ) : null;

  const closeFull = () => {
    setFullOpen(false);
    if (!searchOpen) setQuery("");
  };

  const list = (variant: "compact" | "wide") => {
    const empty =
      !cwd || cwd === "~" ? (
        <p className="px-3 py-2 text-[12px] text-content/45">No project folder</p>
      ) : commits.length === 0 ? (
        <p className="px-3 py-2 text-[12px] text-content/45">No commits yet</p>
      ) : items.length === 0 ? (
        <p className="px-3 py-2 text-[12px] text-content/45">
          No matching commits in the {commits.length} loaded
        </p>
      ) : undefined;
    return (
      <GitGraphList
        variant={variant}
        items={items}
        plain={searching}
        selectedSha={selectedSha}
        hasMore={hasMore}
        empty={empty}
        suspendHover={menu !== null}
        onLoadMore={() => setLimit((value) => value + HISTORY_PAGE)}
        onOpen={(commit, pin) => {
          if (variant === "wide") closeFull();
          onOpenCommit(commit, pin);
        }}
        onMenu={local ? (x, y, commit) => setMenu({ x, y, commit }) : undefined}
      />
    );
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <div
        className={`flex w-full shrink-0 items-center ${expanded ? "h-7" : "h-full"}`}
      >
        <button
          type="button"
          onClick={onToggleExpanded}
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse graph" : "Expand graph"}
          className="flex h-full min-w-0 flex-1 items-center gap-1 px-3 text-left leading-none hover:bg-content/5"
        >
          <span className="text-[10px] font-semibold tracking-[0.04em] text-content/55 uppercase">
            Graph
          </span>
          {expanded ? (
            <ChevronDown
              className="size-3.5 shrink-0 text-content/50"
              strokeWidth={1.75}
            />
          ) : (
            <ChevronRight
              className="ml-auto size-3.5 shrink-0 text-content/50"
              strokeWidth={1.75}
            />
          )}
        </button>
        {expanded ? showAllButton : null}
        {expanded ? (
          <button
            type="button"
            title="Search commits"
            aria-label="Search commits"
            aria-pressed={searchOpen}
            onClick={() => {
              setSearchOpen((open) => !open);
              setQuery("");
            }}
            className={HEADER_BUTTON}
          >
            <Search className="size-3.5" strokeWidth={1.75} />
          </button>
        ) : null}
        {expanded && cwd && cwd !== "~" ? (
          <button
            type="button"
            title="Open full graph"
            aria-label="Open full graph"
            onClick={() => setFullOpen(true)}
            className={HEADER_BUTTON}
          >
            <Maximize2 className="size-3.5" strokeWidth={1.75} />
          </button>
        ) : null}
      </div>
      {expanded && searchOpen ? (
        <div className="shrink-0 px-2 pb-1.5">
          <GraphSearchInput
            value={query}
            autoFocus
            onChange={setQuery}
            onEscape={() => {
              setSearchOpen(false);
              setQuery("");
            }}
          />
        </div>
      ) : null}
      {expanded ? list("compact") : null}
      {fullOpen ? (
        <GitGraphDialog
          title="Commit Graph"
          onClose={closeFull}
          toolbar={
            <>
              {showAllButton}
              <div className="max-w-sm min-w-0 flex-1">
                <GraphSearchInput value={query} onChange={setQuery} />
              </div>
            </>
          }
        >
          {list("wide")}
        </GitGraphDialog>
      ) : null}
      {menu ? (
        <ExplorerMenu
          x={menu.x}
          y={menu.y}
          ariaLabel="Commit actions"
          items={commitMenuItems(menu.commit)}
          onPick={(id) => {
            const { commit } = menu;
            setMenu(null);
            void onPick(id, commit);
          }}
          onClose={() => setMenu(null)}
        />
      ) : null}
      {naming ? (
        <RefNameDialog
          title={naming.kind === "branch" ? "New branch" : "New tag"}
          description={
            naming.kind === "branch"
              ? `Create and check out a branch at ${naming.commit.shortSha}.`
              : `Create a tag at ${naming.commit.shortSha}.`
          }
          label={naming.kind === "branch" ? "Branch name" : "Tag name"}
          placeholder={naming.kind === "branch" ? "feature/my-branch" : "v1.0.0"}
          submitLabel="Create"
          busy={namingBusy}
          error={namingError}
          onSubmit={(name) => void submitName(name)}
          onCancel={() => setNaming(null)}
        />
      ) : null}
    </div>
  );
}

function useGitHistory(
  cwd: string,
  enabled: boolean,
  all: boolean,
  limit: number,
): { commits: GitHistoryCommit[] } {
  const cacheKey = all ? `${cwd}\nall` : cwd;
  const [commits, setCommits] = useState<GitHistoryCommit[]>(
    () => historyByCwd.get(cacheKey) ?? [],
  );
  const commitsRef = useRef(commits);
  commitsRef.current = commits;

  const load = useCallback(() => {
    if (!enabled || !cwd || cwd === "~") return;
    void gitHistory(cwd, limit, all)
      .then((next) => {
        const prev = commitsRef.current;
        if (sameHistory(prev, next.commits)) return;
        historyByCwd.set(cacheKey, next.commits);
        commitsRef.current = next.commits;
        setCommits(next.commits);
      })
      .catch(() => {
        historyByCwd.delete(cacheKey);
        commitsRef.current = [];
        setCommits([]);
      });
  }, [all, cacheKey, cwd, enabled, limit]);

  useEffect(() => {
    if (!enabled || !cwd || cwd === "~") {
      commitsRef.current = [];
      setCommits([]);
      return;
    }
    const cached = historyByCwd.get(cacheKey) ?? [];
    commitsRef.current = cached;
    setCommits(cached);
    load();
    const onResume = () => {
      if (!document.hidden) load();
    };
    window.addEventListener("focus", onResume);
    document.addEventListener("visibilitychange", onResume);
    const unsub = subscribeGitChanged(load);
    return () => {
      window.removeEventListener("focus", onResume);
      document.removeEventListener("visibilitychange", onResume);
      unsub();
    };
  }, [cacheKey, cwd, enabled, load]);

  return { commits };
}

function sameHistory(
  prev: GitHistoryCommit[],
  next: GitHistoryCommit[],
): boolean {
  if (prev.length !== next.length) return false;
  return prev.every((commit, i) => {
    const other = next[i];
    return (
      other &&
      commit.sha === other.sha &&
      commit.subject === other.subject &&
      commit.head === other.head &&
      commit.refs.length === other.refs.length &&
      commit.refs.every(
        (ref, j) =>
          other.refs[j]?.name === ref.name && other.refs[j]?.kind === ref.kind,
      )
    );
  });
}

export const GRAPH_PANEL_MIN = 120;
export const GRAPH_PANEL_DEFAULT = 240;

let graphPanelHeight = GRAPH_PANEL_DEFAULT;

export function loadGraphPanelHeight(): number {
  return graphPanelHeight;
}

export function saveGraphPanelHeight(height: number) {
  graphPanelHeight = height;
}

export function GraphResizeSash({
  height,
  onHeightPaint,
  onHeightCommit,
  maxHeight,
}: {
  height: number;
  onHeightPaint: (height: number) => void;
  onHeightCommit: (height: number) => void;
  maxHeight: () => number;
}) {
  const drag = useRef<{ start: number; size: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const paintedRef = useRef(height);
  paintedRef.current = height;
  const paintRef = useRef(onHeightPaint);
  paintRef.current = onHeightPaint;
  const commitRef = useRef(onHeightCommit);
  commitRef.current = onHeightCommit;
  const maxRef = useRef(maxHeight);
  maxRef.current = maxHeight;

  const clamp = (value: number) =>
    Math.min(maxRef.current(), Math.max(GRAPH_PANEL_MIN, Math.round(value)));

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget;
    const pointerId = event.pointerId;
    handle.setPointerCapture(pointerId);
    drag.current = { start: event.clientY, size: paintedRef.current };
    setDragging(true);
    const restoreSelection = suppressTextSelection();
    const previousCursor = document.body.style.cursor;
    document.body.style.cursor = "row-resize";
    document.documentElement.classList.add("is-resizing");

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId || !drag.current) return;
      const next = clamp(drag.current.size - (ev.clientY - drag.current.start));
      paintedRef.current = next;
      paintRef.current(next);
    };

    const stop = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      restoreSelection();
      document.body.style.cursor = previousCursor;
      document.documentElement.classList.remove("is-resizing");
      setDragging(false);
      drag.current = null;
      try {
        handle.releasePointerCapture(pointerId);
      } catch {
        /* already released */
      }
      commitRef.current(clamp(paintedRef.current));
    };

    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      stop();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize graph"
      aria-valuenow={height}
      className={`z-10 h-1.5 shrink-0 cursor-row-resize touch-none ${
        dragging ? "bg-content/15" : "hover:bg-content/10"
      }`}
      onPointerDown={onPointerDown}
      onDoubleClick={() => commitRef.current(clamp(GRAPH_PANEL_DEFAULT))}
    />
  );
}
