import { useCallback, useEffect, useState } from "react";
import { ask, message } from "@tauri-apps/plugin-dialog";
import {
  gitOperationAbort,
  gitOperationContinue,
  gitOperationStatus,
  gitResolveConflict,
  gitStageFile,
  notifyGitChanged,
  readTextFile,
  subscribeGitChanged,
  writeTextFile,
  type GitFileDiffKind,
  type GitOperation,
} from "../../../platform/tauri/fs";
import { isRemoteProjectPath } from "../../projects/model/recents";
import { GIT_ACTIONS, useRemoteSupports } from "../../connections/model/remoteCapabilities";
import { remotePollDue, reportRemoteLoad } from "../../connections/model/remoteHealth";
import { operationLabel } from "../model/commitActions";
import {
  hasConflictMarkers,
  resolveConflictMarkers,
} from "../model/conflictMarkers";
import { appName } from "../../../shared/lib/appName";

const POLL_MS = 5000;

type Props = {
  cwd: string;
  enabled: boolean;
  onOpenFile: (path: string, kind: GitFileDiffKind, pin?: boolean) => void;
};

function errorText(error: unknown): string {
  if (typeof error === "string") return error;
  return error instanceof Error ? error.message : String(error);
}

const ACTION =
  "shrink-0 rounded-md px-1.5 py-0.5 text-[11px] text-content/65 hover:bg-content/10 hover:text-content disabled:opacity-40";

/**
 * Shown while git is stopped in the middle of a merge, rebase, cherry-pick, or
 * revert, and whenever files have unresolved conflicts. On another machine,
 * needs a host with `git.actions`, which answers both questions in one request;
 * polling slows while that machine is unreachable.
 */
export function GitOperationBanner({ cwd, enabled, onOpenFile }: Props) {
  const remote = isRemoteProjectPath(cwd);
  const supported = useRemoteSupports(cwd, GIT_ACTIONS) === true;
  const active = enabled && !!cwd && cwd !== "~" && supported;
  const [operation, setOperation] = useState<GitOperation | null>(null);
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!active || document.hidden) return;
    void gitOperationStatus(cwd).then(
      (status) => {
        if (remote) reportRemoteLoad(cwd, "banner");
        setOperation(status.operation);
        setConflicts(status.conflicts);
      },
      (error: unknown) => {
        // A remote machine that cannot be reached keeps the last state shown.
        if (remote) return reportRemoteLoad(cwd, "banner", error);
        setOperation(null);
        setConflicts([]);
      },
    );
  }, [active, cwd, remote]);

  useEffect(() => {
    setOperation(null);
    setConflicts([]);
    if (!active) return;
    load();
    const timer = window.setInterval(() => {
      if (!remote || remotePollDue(cwd)) load();
    }, POLL_MS);
    window.addEventListener("focus", load);
    const unsub = subscribeGitChanged(load);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", load);
      unsub();
    };
  }, [active, cwd, load, remote]);

  if (!operation && conflicts.length === 0) return null;
  const label = operation ? operationLabel(operation) : null;

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await work();
    } catch (error) {
      await message(errorText(error), { title: appName(), kind: "error" });
    } finally {
      setBusy(false);
      notifyGitChanged();
    }
  };

  const abort = async () => {
    const confirmed = await ask(
      `Abort the ${label?.toLowerCase()}? Changes made while resolving it are discarded.`,
      { title: appName(), kind: "warning", okLabel: "Abort" },
    );
    if (confirmed) await run(() => gitOperationAbort(cwd));
  };

  const acceptBoth = (relative: string) =>
    run(async () => {
      const path = `${cwd}/${relative}`;
      await writeTextFile(path, resolveConflictMarkers(await readTextFile(path), "both"));
      await gitStageFile(cwd, relative);
    });

  const markResolved = (relative: string) =>
    run(async () => {
      if (hasConflictMarkers(await readTextFile(`${cwd}/${relative}`))) {
        const confirmed = await ask(
          `${relative} still contains conflict markers. Mark it as resolved anyway?`,
          { title: appName(), kind: "warning", okLabel: "Mark Resolved" },
        );
        if (!confirmed) return;
      }
      await gitStageFile(cwd, relative);
    });

  return (
    <div
      role="status"
      className="shrink-0 border-b border-stroke bg-content/5 text-[12px] text-content/80"
    >
      <div className="flex items-center gap-1 px-3 py-1.5">
        <span className="min-w-0 flex-1 truncate">
          {label ? `${label} in progress` : "Merge conflicts"}
          {conflicts.length > 0
            ? ` · ${conflicts.length} conflict${conflicts.length === 1 ? "" : "s"}`
            : ""}
        </span>
        {operation ? (
          <>
            <button
              type="button"
              disabled={busy || conflicts.length > 0}
              title={
                conflicts.length > 0 ? "Resolve every conflict first" : undefined
              }
              onClick={() => void run(() => gitOperationContinue(cwd))}
              className={ACTION}
            >
              Continue
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void abort()}
              className={ACTION}
            >
              Abort
            </button>
          </>
        ) : null}
      </div>
      {conflicts.length > 0 ? (
        <ul className="max-h-40 overflow-y-auto pb-1">
          {conflicts.map((relative) => (
            <li key={relative} className="flex items-center gap-0.5 px-3 py-0.5">
              <button
                type="button"
                title={`Open ${relative}`}
                onClick={() => onOpenFile(`${cwd}/${relative}`, "unstaged", true)}
                className="min-w-0 flex-1 truncate text-left text-[12px] text-content hover:underline"
              >
                {relative}
              </button>
              <button
                type="button"
                disabled={busy}
                title="Keep the current branch's version of the whole file"
                onClick={() => void run(() => gitResolveConflict(cwd, relative, "ours"))}
                className={ACTION}
              >
                Current
              </button>
              <button
                type="button"
                disabled={busy}
                title="Keep the incoming version of the whole file"
                onClick={() => void run(() => gitResolveConflict(cwd, relative, "theirs"))}
                className={ACTION}
              >
                Incoming
              </button>
              <button
                type="button"
                disabled={busy}
                title="Keep both sides of every conflict, current first"
                onClick={() => void acceptBoth(relative)}
                className={ACTION}
              >
                Both
              </button>
              <button
                type="button"
                disabled={busy}
                title="Stage the file as it is now"
                onClick={() => void markResolved(relative)}
                className={ACTION}
              >
                Resolved
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
