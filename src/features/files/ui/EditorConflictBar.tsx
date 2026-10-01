import { ChevronDown, ChevronUp } from "../../../shared/ui/icons";

const iconButton =
  "grid size-6 place-items-center rounded text-content/70 hover:bg-content/10 hover:text-content disabled:opacity-35";

/**
 * The editor's merge-conflict strip: how many blocks are left and a way to
 * step between them, then, once the last one is gone, a way to stage the file.
 */
export function EditorConflictBar({
  count,
  canMarkResolved,
  marking,
  error,
  onPrev,
  onNext,
  onMarkResolved,
}: {
  count: number;
  canMarkResolved: boolean;
  marking: boolean;
  error: string | null;
  onPrev: () => void;
  onNext: () => void;
  onMarkResolved: () => void;
}) {
  if (count === 0 && !canMarkResolved) return null;
  return (
    <header
      className="flex h-8 shrink-0 items-center justify-between gap-3 border-b border-stroke px-3 pr-1 text-[11px]"
      role="toolbar"
      aria-label="Merge conflicts"
    >
      {count > 0 ? (
        <>
          <span className="font-semibold tabular-nums text-amber-400" role="status">
            {count === 1 ? "1 conflict" : `${count} conflicts`}
          </span>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              title="Previous conflict"
              aria-label="Previous conflict"
              onMouseDown={(event) => event.preventDefault()}
              onClick={onPrev}
              className={iconButton}
            >
              <ChevronUp className="size-3.5" strokeWidth={1.75} />
            </button>
            <button
              type="button"
              title="Next conflict"
              aria-label="Next conflict"
              onMouseDown={(event) => event.preventDefault()}
              onClick={onNext}
              className={iconButton}
            >
              <ChevronDown className="size-3.5" strokeWidth={1.75} />
            </button>
          </div>
        </>
      ) : (
        <>
          <span className="min-w-0 truncate text-content/60" role="status">
            {error ? (
              <span className="text-red-400" title={error}>
                {error}
              </span>
            ) : (
              "All conflicts resolved"
            )}
          </span>
          <button
            type="button"
            disabled={marking}
            onMouseDown={(event) => event.preventDefault()}
            onClick={onMarkResolved}
            title="Save the file and stage it"
            className="mr-2 h-6 shrink-0 rounded-md bg-content/10 px-2 text-[11px] font-medium text-content hover:bg-content/15 disabled:opacity-50"
          >
            {marking ? "Staging…" : "Mark resolved"}
          </button>
        </>
      )}
    </header>
  );
}
