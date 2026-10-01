import { useEffect, useState } from "react";
import {
  basename,
  gitFetch,
  gitRemotes,
  notifyGitChanged,
} from "../../../platform/tauri/fs";
import { Popover } from "../../../shared/ui/Popover";
import { fetchAllProjects, type FetchAllResult } from "../model/groupGit";

const LABELS: Record<FetchAllResult["status"], string> = {
  fetched: "Fetched",
  "no-remote": "No remote",
  failed: "Failed",
};

/** Runs `git fetch` for the group's local projects, one at a time. */
export function GroupFetchPopover({
  x,
  y,
  name,
  paths,
  onClose,
}: {
  x: number;
  y: number;
  name: string;
  paths: readonly string[];
  onClose: () => void;
}) {
  const [results, setResults] = useState<readonly FetchAllResult[]>([]);
  const [current, setCurrent] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchAllProjects(
      paths,
      {
        hasRemote: async (path) => (await gitRemotes(path)).length > 0,
        fetch: (path) => gitFetch(path),
      },
      (next, index) => {
        if (cancelled) return;
        setResults([...next]);
        setCurrent(index);
      },
      () => cancelled,
    ).then(() => {
      if (cancelled) return;
      setDone(true);
      notifyGitChanged();
    });
    return () => {
      cancelled = true;
    };
    // Runs once per open; the list is fixed when the popover is created.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Popover
      anchor={{ x, y }}
      gap={0}
      width={320}
      role="dialog"
      aria-label={`Fetch all in ${name}`}
      aria-live="polite"
      onDismiss={onClose}
      className="overflow-y-auto p-1"
    >
      <p className="px-2.5 pb-1 pt-1.5 text-xs text-content/50">
        {paths.length === 0
          ? "No local projects to fetch"
          : done
            ? `Fetched ${results.filter((r) => r.status === "fetched").length} of ${paths.length}`
            : `Fetching ${Math.min(current + 1, paths.length)} of ${paths.length}…`}
      </p>
      <ul>
        {paths.map((path, index) => {
          const result = results[index];
          return (
            <li
              key={path}
              className="flex items-center gap-2 px-2.5 py-1 text-[13px] text-content/80"
            >
              <span className="min-w-0 flex-1 truncate" title={path}>
                {basename(path)}
              </span>
              <span
                className={`shrink-0 text-[11px] ${
                  result?.status === "failed"
                    ? "text-red-400"
                    : result?.status === "fetched"
                      ? "text-emerald-400"
                      : "text-content/45"
                }`}
                title={result?.error}
              >
                {result ? LABELS[result.status] : index === current && !done ? "Fetching…" : "Waiting"}
              </span>
            </li>
          );
        })}
      </ul>
    </Popover>
  );
}
