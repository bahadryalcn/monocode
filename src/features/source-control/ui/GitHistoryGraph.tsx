import { t, useLocale } from "../../../shared/i18n";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { ask } from "@tauri-apps/plugin-dialog";
import {
  ChevronDown,
  ChevronRight,
  GitBranch,
  Maximize2,
  Search,
  Loader,
  RefreshCw,
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
  type GitHistoryCommit,
} from "../../../platform/tauri/fs";
import { ExplorerMenu } from "../../files/ui/ExplorerMenu";
import { isRemoteProjectPath } from "../../projects/model/recents";
import {
  GIT_ACTIONS,
  useRemoteSupports,
} from "../../connections/model/remoteCapabilities";
import {
  reportRemoteLoad,
  useRemoteLoadFailure,
} from "../../connections/model/remoteHealth";
import { RemoteLoadError } from "../../connections/ui/RemoteLoadError";
import { commitMenuItems, filterHistory } from "../model/commitActions";
import { layoutGitGraph } from "../model/gitGraph";
import { GitGraphDialog } from "./GitGraphDialog";
import { GitGraphList, type GraphListItem } from "./GitGraphList";
import { GraphSearchInput } from "./GitGraphParts";
import { RefNameDialog } from "./RefNameDialog";
import { appName } from "../../../shared/lib/appName";
import { useGitResource } from "../hooks/useGitResource";
import { GitFeedback, GitLoading } from "./GitFeedback";
import {
  useGitPanelState,
  withGitOperation,
  setGitFeedback,
} from "../model/gitPanelState";

type Props = {
  cwd: string;
  enabled: boolean;
  expanded: boolean;
  selectedSha?: string;
  onToggleExpanded: () => void;
  onOpenCommit: (commit: GitHistoryCommit, pin?: boolean) => void;
};

const HISTORY_PAGE = 200;

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
  useLocale();
  // Commit actions and the wider scope need this computer or a host with `git.actions`.
  const actions = useRemoteSupports(cwd, GIT_ACTIONS) === true;
  const [showAll, setShowAll] = useState(graphShowAll);
  const [limit, setLimit] = useState(HISTORY_PAGE);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [fullOpen, setFullOpen] = useState(false);
  const { commits, failure, loading, error, refresh } = useGitHistory(
    cwd,
    enabled && (expanded || fullOpen),
    actions && showAll,
    limit,
  );
  const [busy] = useGitPanelState(cwd, "busy");
  const rows = useMemo(() => layoutGitGraph(commits), [commits]);
  const rowBySha = useMemo(
    () => new Map(commits.map((commit, index) => [commit.sha, rows[index]])),
    [commits, rows],
  );
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
      await withGitOperation(cwd, "Updating repository…", action);
      setGitFeedback(cwd, { kind: "success", get title() { return t("Git operation complete"); } });
    } catch (error) {
      setGitFeedback(cwd, {
        kind: "error",
        get title() { return t("Git operation failed"); },
        detail: errorText(error),
      });
    } finally {
      // Also after a failure: a conflict leaves the tree and index changed.
      notifyGitChanged(cwd, "refs");
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
          { title: appName(), kind: "warning", okLabel: "Reset" },
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
      await withGitOperation(cwd, "Creating reference…", async () => {
        if (naming.kind === "branch")
          await gitCreateBranchAt(cwd, name, naming.commit.sha);
        else await gitCreateTag(cwd, name, naming.commit.sha);
      });
      setNaming(null);
      notifyGitChanged(cwd, "refs");
    } catch (error) {
      setNamingError(errorText(error));
    } finally {
      setNamingBusy(false);
    }
  };

  const showAllButton = actions ? (
    <button
      type="button"
      title={showAll ? t("Showing all branches") : t("Show all branches")}
      aria-label={t("Show all branches")}
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
        <p className="px-3 py-2 text-[12px] text-content/45">{t("No project folder")}</p>
      ) : commits.length === 0 ? (
        loading ? (
          <GitLoading text="Loading commit graph…" />
        ) : error || failure ? (
          <p className="px-3 py-2 text-[12px] text-content/45">{t("Commit history unavailable")}</p>
        ) : (
          <p className="px-3 py-2 text-[12px] text-content/45">{t("No commits yet")}</p>
        )
      ) : items.length === 0 ? (
        <p className="px-3 py-2 text-[12px] text-content/45">{t("No matching commits in the ")}{commits.length}{t(" loaded")}</p>
      ) : undefined;
    const graph = (
      <GitGraphList
        variant={variant}
        items={items}
        plain={searching}
        selectedSha={selectedSha}
        hasMore={hasMore && !loading && !error && !failure}
        empty={empty}
        suspendHover={menu !== null}
        onLoadMore={() => setLimit((value) => value + HISTORY_PAGE)}
        onOpen={(commit, pin) => {
          if (variant === "wide") closeFull();
          onOpenCommit(commit, pin);
        }}
        onMenu={
          actions && !busy
            ? (x, y, commit) => setMenu({ x, y, commit })
            : undefined
        }
      />
    );
    return failure ? (
      <>
        <RemoteLoadError
          cwd={cwd}
          failure={failure}
          stale={commits.length > 0}
          onRetry={refresh}
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col opacity-60">
          {graph}
        </div>
      </>
    ) : (
      <>
        {loading && commits.length > 0 ? (
          <GitLoading text="Refreshing commit graph…" />
        ) : null}
        {error ? (
          <GitFeedback
            title={t("Couldn’t load commit graph")}
            detail={error}
            stale={commits.length > 0}
            onRetry={refresh}
          />
        ) : null}
        {graph}
      </>
    );
  };

  return (
    <div
      aria-busy={loading}
      className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
    >
      <div
        className={`flex w-full shrink-0 items-center ${expanded ? "h-7" : "h-full"}`}
      >
        <button
          type="button"
          onClick={onToggleExpanded}
          aria-expanded={expanded}
          aria-label={expanded ? t("Collapse graph") : t("Expand graph")}
          className="flex h-full min-w-0 flex-1 items-center gap-1 px-3 text-left leading-none hover:bg-content/5"
        >
          <span className="text-[10px] font-semibold tracking-[0.04em] text-content/55 uppercase">{t("Graph")}</span>
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
        {loading ? (
          <Loader
            aria-hidden
            className="mr-1 size-3 animate-spin text-content/50"
          />
        ) : null}
        {expanded ? (
          <button
            type="button"
            title={t("Refresh commit graph")}
            aria-label={t("Refresh commit graph")}
            disabled={loading}
            onClick={refresh}
            className={HEADER_BUTTON}
          >
            <RefreshCw className="size-3.5" />
          </button>
        ) : null}
        {expanded ? showAllButton : null}
        {expanded ? (
          <button
            type="button"
            title={t("Search commits")}
            aria-label={t("Search commits")}
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
            title={t("Open full graph")}
            aria-label={t("Open full graph")}
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
          title={t("Commit Graph")}
          onClose={closeFull}
          toolbar={
            <>
              {showAllButton}
              <button
                type="button"
                title={t("Refresh commit graph")}
                aria-label={t("Refresh full commit graph")}
                disabled={loading}
                onClick={refresh}
                className={HEADER_BUTTON}
              >
                <RefreshCw className="size-3.5" />
              </button>
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
          title={naming.kind === "branch" ? t("New branch") : t("New tag")}
          description={
            naming.kind === "branch"
              ? t("Create and check out a branch at {p0}.", { p0: naming.commit.shortSha })
              : t("Create a tag at {p0}.", { p0: naming.commit.shortSha })
          }
          label={naming.kind === "branch" ? t("Branch name") : t("Tag name")}
          placeholder={
            naming.kind === "branch" ? t("feature/my-branch") : "v1.0.0"
          }
          submitLabel="Create"
          busy={namingBusy || !!busy}
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
) {
  const failure = useRemoteLoadFailure(cwd, "graph");
  const remote = isRemoteProjectPath(cwd);
  const read = useCallback(
    async () => (await gitHistory(cwd, limit, all)).commits,
    [cwd, limit, all],
  );
  const resource = useGitResource(
    cwd,
    `history:${cwd}:${all}`,
    enabled && !!cwd && cwd !== "~",
    read,
  );
  useEffect(() => {
    if (enabled && remote && !resource.loading)
      reportRemoteLoad(cwd, "graph", resource.error ?? undefined);
  }, [cwd, enabled, remote, resource.loading, resource.error]);
  return {
    commits: resource.data ?? [],
    loading: resource.loading,
    error: resource.error,
    failure,
    refresh: resource.refresh,
  };
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
  useLocale();
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
      aria-label={t("Resize graph")}
      aria-valuenow={height}
      className={`z-10 h-1.5 shrink-0 cursor-row-resize touch-none ${
        dragging ? "bg-content/15" : "hover:bg-content/10"
      }`}
      onPointerDown={onPointerDown}
      onDoubleClick={() => commitRef.current(clamp(GRAPH_PANEL_DEFAULT))}
    />
  );
}
