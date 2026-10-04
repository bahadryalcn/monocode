import {
  Check,
  ChevronDown,
  Copy,
  File,
  LoaderCircle,
  Plus,
  Trash2,
  X,
} from "../../../shared/ui/icons";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { useDragResize } from "../../../shared/hooks/useDragResize";
import { useLockOverscroll } from "../../../shared/hooks/useLockOverscroll";
import { formatRelativeTime } from "../../inbox/model/githubTasks";
import { looksLikeProject } from "../../projects/model/recents";
import { requestAddToChat } from "../../sessions/model/quoteDraft";
import {
  createNote,
  deleteNote,
  loadNotes,
  NOTES_CHANGED_EVENT,
  noteTitle,
  peekNotes,
  upsertNote,
  type Note,
} from "../notes";
import {
  loadNotesPanelWidth,
  NOTES_PANEL_COMMAND,
  NOTES_PANEL_DEFAULT_WIDTH,
  NOTES_PANEL_MIN_WIDTH,
  notesPanelFocusRequested,
  notesPanelMaxWidth,
  panelNotes,
  pickPanelNote,
  saveNotesPanelWidth,
  setNotesPanelOpen,
  takeNotesPanelFocusRequest,
} from "../notesPanel";
import { keybindingShortcutLabel } from "../../settings/model/settings";
import { MOD } from "../../../platform/tauri/platform";

/** The note each session last had open, so reopening the panel resumes it. */
const lastNoteBySession = new Map<string, string>();

// Saves of one note run in order and outlive the editor that started them, so a
// reload never reads the list before a pending edit has been written.
const pendingSaves = new Map<string, Promise<void>>();

function enqueueSave(id: string, run: () => Promise<void>) {
  const previous = pendingSaves.get(id) ?? Promise.resolve();
  const next = previous.then(run, run).finally(() => {
    if (pendingSaves.get(id) === next) pendingSaves.delete(id);
  });
  pendingSaves.set(id, next);
  return next;
}

async function settlePendingSaves() {
  await Promise.allSettled([...pendingSaves.values()]);
}

const errorText = (err: unknown) =>
  err instanceof Error ? err.message : String(err);

type Props = {
  sessionId: string;
  cwd: string;
};

/**
 * Right-docked notes for the focused session. It reads and writes the same
 * notes as the Notes screen: this session's notes first, then the project's.
 */
export function SessionNotesPanel({ sessionId, cwd }: Props) {
  const project = looksLikeProject(cwd) ? cwd : "";
  const resize = useDragResize({
    direction: "left",
    min: NOTES_PANEL_MIN_WIDTH,
    max: () => notesPanelMaxWidth(window.innerWidth),
    defaultWidth: NOTES_PANEL_DEFAULT_WIDTH,
    initial: loadNotesPanelWidth(),
    onCommit: saveNotesPanelWidth,
  });
  const listLock = useLockOverscroll<HTMLDivElement>();
  const [notes, setNotes] = useState<Note[]>(() => peekNotes() ?? []);
  const [loaded, setLoaded] = useState(() => peekNotes() !== null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(
    () => lastNoteBySession.get(sessionId) ?? null,
  );
  const [listOpen, setListOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [wantFocus, setWantFocus] = useState(notesPanelFocusRequested);
  const focused = useCallback(() => {
    takeNotesPanelFocusRequest();
    setWantFocus(false);
  }, []);

  const refresh = useCallback(async () => {
    try {
      await settlePendingSaves();
      setNotes(await loadNotes(true));
      setError(null);
    } catch (err: unknown) {
      setError(errorText(err));
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onChanged = () => void refresh();
    window.addEventListener(NOTES_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(NOTES_CHANGED_EVENT, onChanged);
  }, [refresh]);

  const offered = useMemo(
    () => panelNotes(notes, sessionId, project),
    [notes, sessionId, project],
  );
  const selected = pickPanelNote(offered, selectedId);

  useEffect(() => {
    if (!selected) return;
    lastNoteBySession.set(sessionId, selected.id);
    if (selected.id !== selectedId) setSelectedId(selected.id);
  }, [selected, selectedId, sessionId]);

  const onCreate = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const created = await createNote({
        title: "Untitled",
        body: "",
        sourceSessionId: sessionId,
        ...(project ? { sourceCwd: project } : {}),
      });
      setNotes(await loadNotes(true));
      setSelectedId(created.id);
      setListOpen(false);
      setWantFocus(true);
      setError(null);
    } catch (err: unknown) {
      setError(errorText(err));
    } finally {
      setCreating(false);
    }
  };

  const onSaved = useCallback((saved: Note) => {
    setNotes((current) =>
      current.map((item) => (item.id === saved.id ? saved : item)),
    );
  }, []);

  const onDelete = async (id: string) => {
    try {
      await deleteNote(id);
      setNotes(await loadNotes(true));
      setError(null);
    } catch (err: unknown) {
      setError(errorText(err));
    }
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== "Escape" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    event.stopPropagation();
    if (listOpen) setListOpen(false);
    else setNotesPanelOpen(false);
  };

  const shortcut = keybindingShortcutLabel(NOTES_PANEL_COMMAND, `${MOD}N`);
  const closeLabel = shortcut ? `Close notes (${shortcut})` : "Close notes";
  const hasNotes = offered.session.length + offered.project.length > 0;

  return (
    <aside
      ref={resize.setPaneRef}
      role="complementary"
      aria-label="Session notes"
      data-notes-panel
      onKeyDown={onKeyDown}
      className="relative flex h-full min-h-0 shrink-0 flex-col border-l border-stroke text-content"
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize notes panel"
        className={`absolute inset-y-0 -left-px z-10 w-1.5 cursor-col-resize touch-none ${
          resize.dragging ? "bg-content/15" : "hover:bg-content/10"
        }`}
        onPointerDown={resize.onPointerDown}
        onDoubleClick={resize.onDoubleClick}
      />
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-stroke px-2">
        <button
          type="button"
          aria-expanded={listOpen}
          aria-label="Switch note"
          title="Switch note"
          onClick={() => setListOpen((open) => !open)}
          className="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 text-left text-[12px] hover:bg-content/10"
        >
          <File
            className="size-3.5 shrink-0 text-content/45"
            strokeWidth={1.75}
          />
          <span className="min-w-0 flex-1 truncate">
            {selected?.title ?? "Notes"}
          </span>
          <ChevronDown
            className={`size-3 shrink-0 text-content/45 transition-transform ${
              listOpen ? "rotate-180" : ""
            }`}
            strokeWidth={1.75}
          />
        </button>
        <PanelIconButton
          label="New note"
          disabled={creating}
          onClick={() => void onCreate()}
        >
          {creating ? (
            <LoaderCircle
              className="size-3.5 animate-spin"
              strokeWidth={1.75}
            />
          ) : (
            <Plus className="size-3.5" strokeWidth={1.75} />
          )}
        </PanelIconButton>
        <PanelIconButton
          label={closeLabel}
          onClick={() => setNotesPanelOpen(false)}
        >
          <X className="size-3.5" strokeWidth={1.75} />
        </PanelIconButton>
      </div>
      {listOpen ? (
        <div
          ref={listLock}
          className="max-h-56 shrink-0 overflow-y-auto overscroll-none border-b border-stroke p-1.5"
        >
          <NoteGroup
            label="This session"
            notes={offered.session}
            activeId={selected?.id}
            onSelect={(id) => {
              setSelectedId(id);
              setListOpen(false);
              setWantFocus(true);
            }}
          />
          <NoteGroup
            label="Project notes"
            notes={offered.project}
            activeId={selected?.id}
            onSelect={(id) => {
              setSelectedId(id);
              setListOpen(false);
              setWantFocus(true);
            }}
          />
          {hasNotes || error || !loaded ? null : (
            <p className="px-2 py-1.5 text-[12px] text-content/50">
              No notes yet.
            </p>
          )}
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="px-3 py-2 text-[12px] text-red-400/90">
          {error}{" "}
          <button
            type="button"
            className="underline"
            onClick={() => void refresh()}
          >
            Retry
          </button>
        </p>
      ) : null}
      {selected ? (
        <PanelNoteEditor
          key={selected.id}
          note={selected}
          autoFocus={wantFocus}
          onFocused={focused}
          onSaved={onSaved}
          onDelete={onDelete}
        />
      ) : error ? null : (
        <EmptyPanel
          loaded={loaded}
          autoFocus={wantFocus}
          creating={creating}
          onFocused={focused}
          onCreate={() => void onCreate()}
        />
      )}
    </aside>
  );
}

function PanelIconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-6 shrink-0 place-items-center rounded-md text-content/45 hover:bg-content/10 hover:text-content disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function NoteGroup({
  label,
  notes,
  activeId,
  onSelect,
}: {
  label: string;
  notes: Note[];
  activeId?: string;
  onSelect: (id: string) => void;
}) {
  if (notes.length === 0) return null;
  return (
    <section aria-label={label} className="mb-1 last:mb-0">
      <h3 className="px-2 pb-1 pt-1.5 text-[11px] text-content/45">{label}</h3>
      <ul className="flex flex-col gap-0.5">
        {notes.map((note) => {
          const time = formatRelativeTime(
            new Date(note.updatedAt).toISOString(),
          );
          return (
            <li key={note.id}>
              <button
                type="button"
                title={note.title}
                aria-current={note.id === activeId ? "true" : undefined}
                onClick={() => onSelect(note.id)}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] ${
                  note.id === activeId
                    ? "bg-selection text-content"
                    : "text-content/80 hover:bg-content/5 hover:text-content"
                }`}
              >
                <span className="min-w-0 flex-1 truncate">{note.title}</span>
                {time ? (
                  <span className="shrink-0 text-[11px] tabular-nums text-content/45">
                    {time}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function EmptyPanel({
  loaded,
  autoFocus,
  creating,
  onFocused,
  onCreate,
}: {
  loaded: boolean;
  autoFocus: boolean;
  creating: boolean;
  onFocused: () => void;
  onCreate: () => void;
}) {
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!autoFocus || !loaded) return;
    button.current?.focus();
    onFocused();
  }, [autoFocus, loaded, onFocused]);
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      {loaded ? (
        <>
          <p className="text-[13px] text-content/45">
            No notes for this project yet.
          </p>
          <button
            ref={button}
            type="button"
            disabled={creating}
            onClick={onCreate}
            className="inline-flex h-6.5 items-center gap-1 rounded-md bg-content px-3 text-[12px] text-background-base hover:bg-content/80 disabled:opacity-40"
          >
            New note
          </button>
        </>
      ) : (
        <LoaderCircle
          className="size-4 animate-spin text-content/40"
          strokeWidth={1.75}
        />
      )}
    </div>
  );
}

function PanelNoteEditor({
  note,
  autoFocus,
  onFocused,
  onSaved,
  onDelete,
}: {
  note: Note;
  autoFocus: boolean;
  onFocused: () => void;
  onSaved: (note: Note) => void;
  onDelete: (id: string) => void | Promise<void>;
}) {
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  const titleRef = useRef(title);
  const bodyRef = useRef(body);
  const savedRef = useRef(note);
  const titleTouched = useRef(false);
  const skipSave = useRef(false);
  const saveTimer = useRef<number | null>(null);
  const copyTimer = useRef<number | null>(null);
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  useEffect(() => {
    if (!autoFocus) return;
    field.current?.focus();
    onFocused();
  }, [autoFocus, onFocused]);

  const save = useCallback(async () => {
    if (skipSave.current) return;
    const current = savedRef.current;
    const nextBody = bodyRef.current;
    const typed = titleRef.current.trim();
    // An untouched placeholder title follows the first line, as on the Notes screen.
    const nextTitle =
      typed && (typed !== "Untitled" || titleTouched.current)
        ? typed
        : noteTitle(nextBody);
    if (nextTitle === current.title && nextBody === current.body) return;
    try {
      const saved = await upsertNote({
        id: current.id,
        title: nextTitle,
        body: nextBody,
        tags: current.tags,
      });
      savedRef.current = saved;
      setSaveError(null);
      onSavedRef.current(saved);
      if (!titleTouched.current) {
        titleRef.current = saved.title;
        setTitle(saved.title);
      }
    } catch (err: unknown) {
      setSaveError(errorText(err));
    }
  }, []);

  const saveNow = useCallback(() => {
    if (saveTimer.current != null) window.clearTimeout(saveTimer.current);
    saveTimer.current = null;
    return enqueueSave(note.id, save);
  }, [note.id, save]);

  const scheduleSave = useCallback(() => {
    if (saveTimer.current != null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null;
      void saveNow();
    }, 400);
  }, [saveNow]);

  useEffect(
    () => () => {
      void saveNow();
      if (copyTimer.current != null) window.clearTimeout(copyTimer.current);
    },
    [saveNow],
  );

  const copy = () => {
    void navigator.clipboard
      ?.writeText(bodyRef.current)
      .then(() => {
        setCopied(true);
        if (copyTimer.current != null) window.clearTimeout(copyTimer.current);
        copyTimer.current = window.setTimeout(() => setCopied(false), 1200);
      })
      .catch(() => undefined);
  };

  const sendToChat = () => {
    const el = field.current;
    const selection =
      el && el.selectionStart !== el.selectionEnd
        ? bodyRef.current.slice(el.selectionStart, el.selectionEnd)
        : "";
    requestAddToChat(selection || bodyRef.current, "plain");
  };

  const hasBody = Boolean(body.trim());

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <input
        value={title}
        onChange={(event) => {
          titleTouched.current = true;
          titleRef.current = event.target.value;
          setTitle(event.target.value);
          scheduleSave();
        }}
        onBlur={() => void saveNow()}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          field.current?.focus();
        }}
        aria-label="Note title"
        placeholder="Untitled"
        spellCheck={false}
        className="h-9 w-full shrink-0 border-0 border-b border-stroke bg-transparent px-3 text-[13px] font-semibold text-content outline-none placeholder:text-content/35"
      />
      <textarea
        ref={field}
        value={body}
        onChange={(event) => {
          bodyRef.current = event.target.value;
          setBody(event.target.value);
          scheduleSave();
        }}
        onBlur={() => void saveNow()}
        aria-label="Note"
        placeholder="Write markdown…"
        spellCheck={false}
        className="min-h-0 w-full flex-1 resize-none border-0 bg-transparent px-3 py-2 font-mono text-[13px] leading-5 text-content outline-none placeholder:text-content/35"
      />
      {saveError ? (
        <div
          role="alert"
          className="flex shrink-0 items-center gap-2 px-3 py-1.5 text-[12px] text-red-400/90"
        >
          <span className="min-w-0 flex-1">Could not save: {saveError}</span>
          <button
            type="button"
            onClick={() => {
              setSaveError(null);
              void saveNow();
            }}
            className="shrink-0 underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      ) : null}
      <div className="flex h-9 shrink-0 items-center gap-1 border-t border-stroke px-2">
        <PanelIconButton
          label={copied ? "Copied" : "Copy note"}
          disabled={!hasBody}
          onClick={copy}
        >
          {copied ? (
            <Check className="size-3.5" strokeWidth={1.75} />
          ) : (
            <Copy className="size-3.5" strokeWidth={1.75} />
          )}
        </PanelIconButton>
        <button
          type="button"
          disabled={!hasBody}
          title="Add the selection, or the whole note, to the composer"
          onClick={sendToChat}
          className="h-6 rounded-md px-2 text-[12px] text-content/70 hover:bg-content/10 hover:text-content disabled:opacity-40"
        >
          Add to chat
        </button>
        <span className="min-w-0 flex-1" />
        <PanelIconButton
          label="Delete note"
          onClick={() => {
            skipSave.current = true;
            if (saveTimer.current != null)
              window.clearTimeout(saveTimer.current);
            void enqueueSave(note.id, async () => {
              await onDelete(note.id);
            });
          }}
        >
          <Trash2 className="size-3.5" strokeWidth={1.75} />
        </PanelIconButton>
      </div>
    </div>
  );
}
