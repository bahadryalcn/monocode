import { useCallback, useState } from "react";
import { ask } from "@tauri-apps/plugin-dialog";
import { ChevronDown, ChevronRight, Plus } from "../../../shared/ui/icons";
import {
  gitStash,
  gitStashAction,
  gitStashList,
  notifyGitChanged,
  type GitHistoryCommit,
  type GitStashEntry,
} from "../../../platform/tauri/fs";
import {
  GIT_ACTIONS,
  useRemoteSupports,
} from "../../connections/model/remoteCapabilities";
import { useGitResource } from "../hooks/useGitResource";
import { GitFeedback, GitLoading } from "./GitFeedback";
import {
  useGitPanelState,
  withGitOperation,
  setGitFeedback,
} from "../model/gitPanelState";
import { appName } from "../../../shared/lib/appName";

type Props = {
  cwd: string;
  enabled: boolean;
  hasChanges: boolean;
  onOpenCommit: (commit: GitHistoryCommit, pin?: boolean) => void;
};

let stashOpen = false;

function errorText(error: unknown): string {
  if (typeof error === "string") return error;
  return error instanceof Error ? error.message : String(error);
}

/** A stash is a commit, so the commit diff view can show what it holds. */
export function stashCommit(entry: GitStashEntry): GitHistoryCommit {
  return {
    sha: entry.sha,
    shortSha: entry.sha.slice(0, 7),
    parents: [],
    author: "",
    timestamp: entry.timestamp,
    subject: entry.message,
    refs: [],
    head: false,
  };
}

const ACTION =
  "shrink-0 rounded-md px-1.5 py-0.5 text-[11px] text-content/65 hover:bg-content/10 hover:text-content disabled:opacity-40";

/** Lists the repository's stashes. On another machine, needs a host with `git.actions`. */
export function GitStashSection({
  cwd,
  enabled,
  hasChanges,
  onOpenCommit,
}: Props) {
  const supported = useRemoteSupports(cwd, GIT_ACTIONS) === true;
  const active = enabled && !!cwd && cwd !== "~" && supported;
  const [open, setOpen] = useState(stashOpen);
  const [busy] = useGitPanelState(cwd, "busy");
  const read = useCallback(() => gitStashList(cwd), [cwd]);
  const { data, loading, error, refresh } = useGitResource(
    cwd,
    `stashes:${cwd}`,
    active,
    read,
  );
  const entries = data ?? [];

  if (!active) return null;

  const run = async (work: () => Promise<unknown>) => {
    try {
      await withGitOperation(cwd, "Updating stash…", work);
      setGitFeedback(cwd, {
        kind: "success",
        title: "Stash operation complete",
      });
    } catch (error) {
      setGitFeedback(cwd, {
        kind: "error",
        title: "Couldn’t update stash",
        detail: errorText(error),
      });
    } finally {
      notifyGitChanged(cwd, "refs");
    }
  };

  const drop = async (entry: GitStashEntry) => {
    const confirmed = await ask(
      `Drop "${entry.message}"? The stashed changes are lost.`,
      { title: appName(), kind: "warning", okLabel: "Drop" },
    );
    if (confirmed) await run(() => gitStashAction(cwd, "drop", entry.index));
  };

  return (
    <div className="shrink-0 border-t border-stroke">
      <div className="flex h-7 items-center gap-1 px-1.5">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => {
            stashOpen = !open;
            setOpen(stashOpen);
          }}
          className="flex min-w-0 flex-1 items-center gap-1 text-left"
        >
          {open ? (
            <ChevronDown
              className="size-3.5 shrink-0 text-content/50"
              strokeWidth={1.75}
            />
          ) : (
            <ChevronRight
              className="size-3.5 shrink-0 text-content/50"
              strokeWidth={1.75}
            />
          )}
          <span className="min-w-0 truncate text-[10px] font-semibold tracking-[0.04em] text-content/55 uppercase">
            Stashes
          </span>
          <span className="text-[10px] tabular-nums text-content/40">
            {entries.length}
          </span>
        </button>
        <button
          type="button"
          title="Stash all changes, including untracked files"
          aria-label="Stash all changes"
          disabled={!!busy || !hasChanges}
          onClick={() => void run(() => gitStash(cwd))}
          className="grid size-5 shrink-0 place-items-center rounded-md text-content/50 hover:bg-content/8 hover:text-content disabled:opacity-40"
        >
          <Plus className="size-3.5" strokeWidth={1.75} />
        </button>
      </div>
      {error ? (
        <GitFeedback
          title="Couldn’t load stashes"
          detail={error}
          stale={data !== null}
          onRetry={refresh}
        />
      ) : null}
      {loading ? (
        <GitLoading text={data ? "Refreshing stashes…" : "Loading stashes…"} />
      ) : null}
      {open ? (
        entries.length === 0 && !loading && !error ? (
          <p className="px-3 pb-2 text-[12px] text-content/45">No stashes</p>
        ) : (
          <ul className="max-h-40 overflow-y-auto pb-1">
            {entries.map((entry) => (
              <li
                key={entry.sha}
                className="flex items-center gap-0.5 px-3 py-0.5"
              >
                <button
                  type="button"
                  title={entry.message}
                  onClick={() => onOpenCommit(stashCommit(entry))}
                  className="min-w-0 flex-1 truncate text-left text-[12px] text-content hover:underline"
                >
                  {entry.message}
                </button>
                <button
                  type="button"
                  disabled={!!busy}
                  title="Apply and keep the stash"
                  onClick={() =>
                    void run(() => gitStashAction(cwd, "apply", entry.index))
                  }
                  className={ACTION}
                >
                  Apply
                </button>
                <button
                  type="button"
                  disabled={!!busy}
                  title="Apply and remove the stash"
                  onClick={() =>
                    void run(() => gitStashAction(cwd, "pop", entry.index))
                  }
                  className={ACTION}
                >
                  Pop
                </button>
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => void drop(entry)}
                  className={ACTION}
                >
                  Drop
                </button>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}
