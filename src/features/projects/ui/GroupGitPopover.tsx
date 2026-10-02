import { useEffect, useState } from "react";
import { gitDiffIndex } from "../../../platform/tauri/fs";
import { basename } from "../../../platform/tauri/fs";
import { Popover, type PopoverAnchor } from "../../../shared/ui/Popover";
import { applyProjectDiffStats } from "../../source-control/hooks/useProjectDiffStats";
import { summarizeGroupGit } from "../model/groupGit";
import { isLocalProject } from "../model/recents";

type Detail =
  | { state: "loading" }
  | { state: "error"; message: string }
  | {
      state: "ready";
      branch: string | null;
      files: number;
      ahead: number;
      behind: number;
      hasUpstream: boolean;
    };

/**
 * Per-project branch, changed files and ahead/behind for a group. The sync
 * numbers need a full git index per project, so they are read only while this
 * popover is open, one project at a time.
 */
export function GroupGitPopover({
  anchor,
  name,
  paths,
  onSelect,
  onDismiss,
}: {
  anchor: PopoverAnchor;
  name: string;
  paths: readonly string[];
  onSelect: (path: string) => void;
  onDismiss: () => void;
}) {
  const [details, setDetails] = useState<Record<string, Detail>>({});
  const key = paths.join("\0");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      for (const path of paths) {
        if (cancelled) return;
        if (!isLocalProject(path)) continue;
        let detail: Detail;
        try {
          const index = await gitDiffIndex(path);
          if (cancelled) return;
          applyProjectDiffStats(path, {
            files: index.files.length,
            additions: index.additions,
            deletions: index.deletions,
          });
          detail = {
            state: "ready",
            branch: index.branch,
            files: index.files.length,
            ahead: index.ahead,
            behind: index.behind,
            hasUpstream: index.upstream != null,
          };
        } catch (error) {
          detail = {
            state: "error",
            message: error instanceof Error ? error.message : String(error),
          };
        }
        if (cancelled) return;
        setDetails((current) => ({ ...current, [path]: detail }));
      }
    })();
    return () => {
      cancelled = true;
    };
    // `key` stands in for `paths`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const summary = summarizeGroupGit(
    paths.map((path) => {
      const detail = details[path];
      const ready = detail?.state === "ready" ? detail : null;
      return {
        remote: !isLocalProject(path),
        files: ready ? ready.files : null,
        ahead: ready?.hasUpstream ? ready.ahead : null,
        behind: ready?.hasUpstream ? ready.behind : null,
      };
    }),
  );

  return (
    <Popover
      anchor={anchor}
      align="start"
      width={320}
      role="dialog"
      aria-label={`${name} git overview`}
      onDismiss={onDismiss}
      className="overflow-y-auto p-1"
    >
      <p className="px-2.5 pb-1 pt-1.5 text-xs text-content/50">
        {summary.dirty} of {summary.local} local{" "}
        {summary.local === 1 ? "project has" : "projects have"} uncommitted
        changes
        {summary.syncKnown > 0
          ? ` · ↑${summary.ahead} ↓${summary.behind}`
          : ""}
      </p>
      <ul>
        {paths.map((path) => {
          const local = isLocalProject(path);
          const detail = details[path];
          return (
            <li key={path}>
              <button
                type="button"
                title="Open this project's Changes tab"
                onClick={() => onSelect(path)}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] text-content/80 hover:bg-content/8 hover:text-content"
              >
                <span className="min-w-0 flex-1 truncate">{basename(path)}</span>
                {!local ? (
                  <span className="shrink-0 text-[11px] text-content/45">remote</span>
                ) : !detail || detail.state === "loading" ? (
                  <span className="shrink-0 text-[11px] text-content/40">…</span>
                ) : detail.state === "error" ? (
                  <span
                    className="shrink-0 text-[11px] text-content/45"
                    title={detail.message}
                  >
                    no git info
                  </span>
                ) : (
                  <span className="flex shrink-0 items-center gap-2 text-[11px] tabular-nums text-content/55">
                    <span className="max-w-[110px] truncate">
                      {detail.branch ?? "detached"}
                    </span>
                    <span
                      className={detail.files > 0 ? "text-amber-400" : undefined}
                      title={`${detail.files} changed ${detail.files === 1 ? "file" : "files"}`}
                    >
                      {detail.files}
                    </span>
                    <span title="Ahead / behind upstream">
                      {detail.hasUpstream
                        ? `↑${detail.ahead} ↓${detail.behind}`
                        : "no upstream"}
                    </span>
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </Popover>
  );
}
