import { useRef, useState, useSyncExternalStore } from "react";
import { basename } from "../../../platform/tauri/fs";
import { pathKey, prettyCwd } from "../../../shared/lib/paths";
import { Folder } from "../../../shared/ui/icons";
import { Popover } from "../../../shared/ui/Popover";
import {
  additionalDirCandidates,
  additionalDirsForSession,
  loadAdditionalDirs,
  loadSessionAdditionalDirs,
  saveSessionAdditionalDirs,
  subscribeSessionAdditionalDirs,
} from "../../projects/model/additionalDirs";

/** Folders this session could use: the project's own plus what its rail group offers. */
export function sessionDirCandidates(project: string): string[] {
  return [...loadAdditionalDirs(project), ...additionalDirCandidates(project)].filter(
    (path, index, all) =>
      all.findIndex((other) => pathKey(other) === pathKey(path)) === index,
  );
}

/**
 * Composer control to pick which extra folders this one session may use.
 * Without a choice the session follows its project's additional folders.
 */
export function SessionDirsPicker({
  sessionId,
  project,
  onClose,
}: {
  sessionId: string;
  project: string;
  onClose?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  // The override lives in localStorage; the snapshot is its serialized form so
  // it stays comparable between renders.
  useSyncExternalStore(
    subscribeSessionAdditionalDirs,
    () => (loadSessionAdditionalDirs(sessionId) ?? ["\0default"]).join("\n"),
    () => "",
  );
  const overridden = loadSessionAdditionalDirs(sessionId) !== undefined;
  const effective = additionalDirsForSession(sessionId, project);
  const effectiveKeys = new Set(effective.map(pathKey));
  const candidates = sessionDirCandidates(project);
  const label =
    effective.length === 0
      ? "No folders"
      : effective.length === 1
        ? basename(effective[0]!)
        : `${effective.length} folders`;

  const toggle = (path: string) => {
    const next = effectiveKeys.has(pathKey(path))
      ? effective.filter((dir) => pathKey(dir) !== pathKey(path))
      : [...effective, path];
    saveSessionAdditionalDirs(sessionId, project, next);
  };

  const dismiss = (restore: boolean) => {
    setOpen(false);
    if (restore) onClose?.();
  };

  return (
    <div ref={root} className="relative shrink-0">
      <button
        type="button"
        title={
          overridden
            ? "Additional folders for this session only. Applies from the next message."
            : "Additional folders, following the project setting. Pick folders here to change them for this session only."
        }
        aria-label="Additional folders for this session"
        aria-expanded={open}
        aria-haspopup="dialog"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => (open ? dismiss(true) : setOpen(true))}
        className="flex h-6.5 max-w-40 items-center gap-1 rounded-md bg-selection px-1.5 text-content hover:bg-selection-hover"
      >
        <Folder
          className={`size-3.5 shrink-0 ${overridden ? "text-accent" : ""}`}
          strokeWidth={1.75}
        />
        <span className="min-w-0 truncate text-[11px]">{label}</span>
      </button>
      {open ? (
        <Popover
          anchor={root}
          side="top"
          width={288}
          autoFocus
          onDismiss={(reason) => dismiss(reason === "escape")}
          role="dialog"
          aria-label="Additional folders for this session"
          tabIndex={-1}
          className="p-1.5"
        >
          <p className="px-2 pb-1 pt-0.5 text-[10px] font-medium uppercase tracking-wide text-content/40">
            Folders for this session
          </p>
          {candidates.map((path) => (
            <label
              key={pathKey(path)}
              className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-content/5"
            >
              <input
                type="checkbox"
                checked={effectiveKeys.has(pathKey(path))}
                onChange={() => toggle(path)}
              />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[13px] text-content">
                  {basename(path)}
                </span>
                <span className="truncate text-[11px] text-content/45">
                  {prettyCwd(path)}
                </span>
              </span>
            </label>
          ))}
          <div className="flex items-center gap-2 px-2 pb-0.5 pt-1.5">
            <p className="min-w-0 flex-1 text-[11px] leading-4 text-content/50">
              {overridden
                ? "This session only. Applies from the next message."
                : "Following the project setting."}
            </p>
            {overridden ? (
              <button
                type="button"
                onClick={() =>
                  saveSessionAdditionalDirs(sessionId, project, null)
                }
                className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] text-content/70 hover:bg-content/10 hover:text-content"
              >
                Use project setting
              </button>
            ) : null}
          </div>
        </Popover>
      ) : null}
    </div>
  );
}
