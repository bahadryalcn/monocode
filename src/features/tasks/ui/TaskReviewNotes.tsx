import type { TaskReviewNote } from "../model/hostTasks";
import { unreadReviewNotes } from "../model/taskReviewNotes";

type Props = {
  notes: readonly TaskReviewNote[];
  busy: boolean;
  stale?: boolean;
  onRead: (noteIds: string[]) => void;
  onResolve: (noteId: string, resolved: boolean) => void;
  onOpenReview: (sessionId: string) => void;
};

const NOTE_ACTION =
  "rounded px-1.5 py-1 text-[11px] text-content/60 hover:bg-content/10 hover:text-content disabled:opacity-40";

export function TaskReviewNotes({
  notes,
  busy,
  stale,
  onRead,
  onResolve,
  onOpenReview,
}: Props) {
  const unread = unreadReviewNotes(notes);
  const open = notes.filter((note) => note.resolvedAt === undefined).length;
  return (
    <section
      aria-label="Review notes"
      className="space-y-2 border-t border-stroke pt-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-1">
        <h3 className="text-[12px] font-medium text-content/80">
          Review notes · {open} open
        </h3>
        {unread > 0 ? (
          <button
            type="button"
            className={NOTE_ACTION}
            disabled={busy || stale}
            onClick={() =>
              onRead(
                notes
                  .filter((note) => note.readAt === undefined)
                  .map((note) => note.id),
              )
            }
          >
            Mark {unread} as read
          </button>
        ) : null}
      </div>
      {notes.length === 0 ? (
        <p className="text-[12px] text-content/45">No review notes yet.</p>
      ) : (
        <ul className="space-y-2">
          {[...notes].reverse().map((note) => {
            const resolved = note.resolvedAt !== undefined;
            return (
              <li
                key={note.id}
                data-review-note={note.id}
                className="space-y-1.5 rounded-md border border-content/10 p-2"
              >
                <div className="flex flex-wrap items-center gap-2 text-[10px]">
                  <span
                    className={resolved ? "text-emerald-400" : "text-amber-400"}
                  >
                    {resolved ? "Fixed" : "Open"}
                  </span>
                  {note.readAt === undefined ? (
                    <span className="text-sky-400">New</span>
                  ) : null}
                  {note.kind === "suggestion" ? (
                    <span className="text-content/45">Optional suggestion</span>
                  ) : null}
                  {note.category === "external" ? (
                    <span className="text-amber-400">
                      External verification
                    </span>
                  ) : null}
                  {note.occurrences > 1 ? (
                    <span className="text-content/45">
                      Reported {note.occurrences} times
                    </span>
                  ) : null}
                  <time
                    dateTime={new Date(note.createdAt).toISOString()}
                    className="text-content/45"
                  >
                    {new Date(note.createdAt).toLocaleString()}
                  </time>
                </div>
                <p className="whitespace-pre-wrap break-words text-[12px] text-content/80">
                  {note.finding}
                </p>
                {note.suggestion ? (
                  <p className="whitespace-pre-wrap break-words text-[12px] text-content/55">
                    Suggested correction: {note.suggestion}
                  </p>
                ) : null}
                {note.details ? (
                  <details className="text-[12px] text-content/55">
                    <summary className="cursor-pointer">Review details</summary>
                    <p className="mt-1 whitespace-pre-wrap break-words">
                      {note.details}
                    </p>
                  </details>
                ) : null}
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    className={NOTE_ACTION}
                    disabled={busy || stale}
                    onClick={() => onResolve(note.id, !resolved)}
                  >
                    {resolved ? "Reopen note" : "Mark fixed"}
                  </button>
                  {note.sessionId ? (
                    <button
                      type="button"
                      className={NOTE_ACTION}
                      onClick={() => onOpenReview(note.sessionId!)}
                    >
                      Open review
                    </button>
                  ) : null}
                </div>
                {(note.sessionIds?.length ?? 0) > 1 ? (
                  <details className="text-[11px] text-content/45">
                    <summary className="cursor-pointer">Review history</summary>
                    <div className="flex flex-wrap gap-1">
                      {note.sessionIds!.map((sessionId, index) => (
                        <button
                          key={sessionId}
                          type="button"
                          className={NOTE_ACTION}
                          onClick={() => onOpenReview(sessionId)}
                        >
                          Review {index + 1}
                        </button>
                      ))}
                    </div>
                  </details>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-[11px] text-content/45">
        Marking a note fixed does not complete this task. Its checks and review
        still apply.
      </p>
    </section>
  );
}
