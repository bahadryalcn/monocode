import { useSyncExternalStore } from "react";
import { isRemoteProjectPath } from "../../projects/model/recents";
import {
  loadInlineBlame,
  saveInlineBlame,
  subscribeInlineBlame,
} from "../../settings/model/settings";
import { displayPath } from "../../../shared/lib/paths";

/** The inline blame preference, shared by every open editor. */
export function useInlineBlame(): boolean {
  return useSyncExternalStore(
    subscribeInlineBlame,
    loadInlineBlame,
    loadInlineBlame,
  );
}

/**
 * Why blame cannot run for this file, or null when it can. Whether git tracks
 * the file is only known once git answers, and shows up as a quiet message.
 */
export function inlineBlameUnavailableReason(
  cwd: string,
  path: string,
): string | null {
  if (isRemoteProjectPath(cwd) || isRemoteProjectPath(path)) {
    return "Blame is not available for remote projects";
  }
  const relative = displayPath(path, cwd);
  if (!cwd || cwd === "~" || !relative || relative === path) {
    return "Blame needs a file inside a git project";
  }
  return null;
}

/** Turns the editor's per-line blame gutter on and off. */
export function InlineBlameToggle({ reason }: { reason: string | null }) {
  const on = useInlineBlame() && !reason;
  return (
    <button
      type="button"
      title={reason ?? "Show git blame for each line"}
      aria-label="Git blame"
      aria-pressed={on}
      disabled={reason !== null}
      // Keep the caret where it is in the editor.
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => saveInlineBlame(!on)}
      className={`ml-2 h-4 shrink-0 rounded px-1.5 font-sans text-[10.5px] hover:bg-content/10 hover:text-content disabled:opacity-35 disabled:hover:bg-transparent ${
        on ? "bg-content/10 text-content/80" : "text-content/45"
      }`}
    >
      Blame
    </button>
  );
}
