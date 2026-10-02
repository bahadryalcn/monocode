import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import { FilePlus } from "../../../shared/ui/icons";
import { Modal } from "../../../shared/ui/Modal";
import { isImeComposition } from "../../../shared/lib/keyboard";
import {
  isFileReferenceText,
  messageFilesFromClipboard,
  nativeClipboardAttachments,
} from "../../../platform/tauri/clipboard";
import {
  attachmentsFromFiles,
  filesFromClipboard,
  pickAttachments,
  revokeAttachment,
} from "../model/attachments";
import { attachmentTokens } from "../model/attachmentTokens";
import {
  addDraftAttachments,
  applyQueuedEdit,
  deleteDraftTokenAtCaret,
  editDraftText,
  hasQueuedEditChanges,
  isQueuedEditEmpty,
  queuedEditDraft,
  removeDraftAttachment,
  type QueuedEditDraft,
} from "../model/queuedMessageEdit";
import type { Attachment, QueuedMessage } from "../model/session";
import { AttachmentChip } from "./AttachmentChip";

type Props = {
  message: QueuedMessage;
  /** False when the harness cannot take attachments: chips can then only be removed. */
  canAttach: boolean;
  onSave: (text: string, attachments: Attachment[]) => void;
  /** Take the message out of the queue; offered when nothing would be left to send. */
  onRemove: () => void;
  onCancel: () => void;
};

const BUTTON_GHOST =
  "rounded-md px-3 py-1.5 text-[12px] text-content/70 hover:bg-content/8 hover:text-content disabled:opacity-40";

/** Edits a queued message's text and attachments in a dialog instead of the queue row. */
export function QueuedMessageEditDialog({
  message,
  canAttach,
  onSave,
  onRemove,
  onCancel,
}: Props) {
  const [draft, setDraft] = useState<QueuedEditDraft>(() =>
    queuedEditDraft(message),
  );
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  /** Where the caret goes once the next draft is rendered. */
  const pendingCaret = useRef<number | null>(null);
  /** Attachments added here: theirs to release if the edit does not keep them. */
  const added = useRef(new Map<string, Attachment>());
  const saved = useRef(false);

  const empty = isQueuedEditEmpty(message, draft);
  const dirty = hasQueuedEditChanges(message, draft);
  const tokens = attachmentTokens(draft.attachments);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const el = field.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
      el.scrollTop = el.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const files = added.current;
    return () => {
      const keep = saved.current
        ? new Set(draftRef.current.attachments.map((file) => file.id))
        : new Set<string>();
      for (const file of files.values()) {
        if (!keep.has(file.id)) revokeAttachment(file);
      }
    };
  }, []);

  // Grow with the text up to the CSS max height, then scroll.
  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
    if (pendingCaret.current !== null) {
      el.setSelectionRange(pendingCaret.current, pendingCaret.current);
      pendingCaret.current = null;
    }
  }, [draft.text]);

  const requestClose = useCallback(() => {
    if (confirmingDiscard) setConfirmingDiscard(false);
    else if (dirty) setConfirmingDiscard(true);
    else onCancel();
  }, [confirmingDiscard, dirty, onCancel]);

  const save = () => {
    if (empty) return;
    const next = applyQueuedEdit(message, draft);
    saved.current = true;
    onSave(next.text, next.attachments);
  };

  const change = (text: string, caret: number) => {
    const edit = editDraftText(draftRef.current, text, caret);
    pendingCaret.current = edit.caret;
    setError(null);
    setDraft(edit.draft);
  };

  const attach = (incoming: Attachment[]) => {
    if (!canAttach || incoming.length === 0) return;
    const el = field.current;
    const selection = el
      ? { start: el.selectionStart, end: el.selectionEnd }
      : null;
    const result = addDraftAttachments(draftRef.current, incoming, selection);
    for (const file of result.draft.attachments) {
      if (incoming.some((item) => item.id === file.id)) {
        added.current.set(file.id, file);
      }
    }
    pendingCaret.current = result.caret;
    setError(null);
    setDraft(result.draft);
    el?.focus();
  };

  const remove = (id: string) => {
    const file = draftRef.current.attachments.find((item) => item.id === id);
    if (file && added.current.delete(id)) revokeAttachment(file);
    setDraft(removeDraftAttachment(draftRef.current, id));
    field.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (isImeComposition(event.nativeEvent)) return;
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      save();
      return;
    }
    const back = event.key === "Backspace";
    if (!back && event.key !== "Delete") return;
    const el = event.currentTarget;
    if (el.selectionStart !== el.selectionEnd) return;
    const edit = deleteDraftTokenAtCaret(
      draftRef.current,
      el.selectionStart,
      back ? "back" : "forward",
    );
    if (!edit) return;
    event.preventDefault();
    pendingCaret.current = edit.caret;
    setDraft(edit.draft);
  };

  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const data = event.clipboardData;
    const messageFiles = messageFilesFromClipboard(data);
    const files = messageFiles ?? filesFromClipboard(data);
    if (files.length > 0) {
      event.preventDefault();
      if (!canAttach) return;
      void attachmentsFromFiles(files).then(attach, showError);
      return;
    }
    // A webview reports a pasted screenshot or copied file as text only (or
    // nothing); both live on the native clipboard.
    const text = data.getData("text/plain");
    if (!canAttach || (text && !isFileReferenceText(text))) return;
    event.preventDefault();
    void nativeClipboardAttachments(text).then(({ files: pasted, warning }) => {
      attach(pasted);
      if (warning) setError(warning);
    }, showError);
  };

  const showError = (reason: unknown) =>
    setError(reason instanceof Error ? reason.message : String(reason));

  const hasFiles = (event: DragEvent) =>
    Array.from(event.dataTransfer?.types ?? []).includes("Files");

  return (
    <Modal
      title="Edit queued message"
      size="md"
      fitViewport
      onClose={requestClose}
    >
      <div
        className="flex flex-col gap-3 p-4"
        onDragOver={(event) => {
          if (!canAttach || !hasFiles(event)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }}
        onDrop={(event) => {
          if (!hasFiles(event)) return;
          event.preventDefault();
          if (!canAttach) return;
          void attachmentsFromFiles([...event.dataTransfer.files]).then(
            attach,
            showError,
          );
        }}
      >
        <div className="rounded-lg border border-content/10 bg-content/5 focus-within:border-content/25">
          {draft.attachments.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 px-3 pt-2.5">
              {draft.attachments.map((file, index) => (
                <AttachmentChip
                  key={file.id}
                  attachment={file}
                  token={tokens[index]}
                  onRemove={() => remove(file.id)}
                />
              ))}
            </div>
          ) : null}
          <textarea
            ref={field}
            aria-label="Queued message text"
            value={draft.text}
            rows={5}
            spellCheck={false}
            placeholder="Message"
            onChange={(event) =>
              change(
                event.target.value,
                event.target.selectionStart ?? event.target.value.length,
              )
            }
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            className="scrollbar-none block max-h-[45vh] min-h-28 w-full resize-none bg-transparent px-3 py-2.5 font-sans text-sm leading-5.5 text-content outline-none placeholder:text-content/30"
          />
          {canAttach ? (
            <div className="flex px-2 pb-2">
              <button
                type="button"
                title="Add files or images"
                aria-label="Add files or images"
                onClick={() =>
                  void pickAttachments().then(attach, showError)
                }
                className="grid size-6.5 place-items-center rounded-md bg-selection text-content/50 hover:bg-selection-hover hover:text-content"
              >
                <FilePlus className="size-3.5" strokeWidth={1.5} />
              </button>
            </div>
          ) : null}
        </div>

        {draft.attachments.some((file) => file.missing) ? (
          <p className="text-[11px] leading-4 text-amber-400">
            Missing files are dropped from the message when you save.
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-[11px] leading-4 text-red-400/90">
            {error}
          </p>
        ) : null}

        {confirmingDiscard ? (
          <div
            role="alert"
            className="flex items-center justify-end gap-2 text-[12px] text-content/70"
          >
            <span className="mr-auto">Discard your changes?</span>
            <button
              type="button"
              onClick={() => setConfirmingDiscard(false)}
              className={BUTTON_GHOST}
            >
              Keep editing
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md bg-red-500/90 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-red-500"
            >
              Discard
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-end gap-2">
            {empty ? (
              <button
                type="button"
                onClick={onRemove}
                className="mr-auto rounded-md px-3 py-1.5 text-[12px] text-red-400 hover:bg-red-500/10"
              >
                Remove from queue
              </button>
            ) : null}
            <button type="button" onClick={requestClose} className={BUTTON_GHOST}>
              Cancel
            </button>
            <button
              type="button"
              disabled={empty}
              onClick={save}
              title="Save (Ctrl/Cmd+Enter)"
              className="inline-flex items-center gap-1.5 rounded-md bg-content px-3 py-1.5 text-[12px] font-medium text-background-base hover:bg-content/80 disabled:opacity-40"
            >
              Save
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
