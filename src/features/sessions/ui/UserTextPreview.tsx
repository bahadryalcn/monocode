import { memo, useEffect, useId, useRef, useState } from "react";
import { Modal } from "../../../shared/ui/Modal";
import { Popover } from "../../../shared/ui/Popover";
import {
  boundedTextPreview,
  type UserTextPart,
} from "../model/userTextPreview";
import type { Attachment } from "../model/session";
import { AttachmentTokenText } from "./AttachmentTokenText";

function TextCard({
  part,
  messageId,
  attachments,
}: {
  part: UserTextPart;
  messageId: string;
  attachments?: Attachment[];
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hovered, setHovered] = useState(false);
  const [open, setOpen] = useState(false);
  const previewId = useId();
  const label = part.kind === "json" ? "JSON" : "Long text";
  const cancel = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );
  const enter = () => {
    cancel();
    setHovered(true);
  };
  const leave = () => {
    cancel();
    timer.current = setTimeout(() => setHovered(false), 150);
  };
  const showFull = () => {
    cancel();
    setHovered(false);
    setOpen(true);
  };
  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-label={`Show full ${label.toLowerCase()}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-describedby={hovered && !open ? previewId : undefined}
        onMouseEnter={enter}
        onMouseLeave={leave}
        onFocus={enter}
        onBlur={leave}
        onClick={showFull}
        className="my-1 block w-full min-w-0 rounded-lg border border-content/10 bg-content/5 px-3 py-2 text-left hover:bg-content/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <span className="flex items-center justify-between gap-6 text-xs">
          <span className="font-medium text-content/80">{label}</span>
          <span className="text-content/45">
            {part.text.length.toLocaleString()} characters
          </span>
        </span>
        <span
          className={`mt-1 block whitespace-pre-wrap break-words text-xs text-content/60 ${part.kind === "json" ? "font-mono" : "font-sans"}`}
        >
          {boundedTextPreview(part.text, 160, 2)}
        </span>
        <span className="mt-1.5 block text-xs text-content/65">
          Show full content ↗
        </span>
      </button>
      {hovered && !open ? (
        <Popover
          anchor={trigger}
          width={440}
          maxHeight={360}
          onDismiss={() => {
            cancel();
            setHovered(false);
          }}
          onMouseEnter={enter}
          onMouseLeave={leave}
          onFocusCapture={enter}
          onBlurCapture={leave}
        >
          <div id={previewId} className="p-3">
            <div className="mb-2 text-xs font-medium text-content/70">
              {label} preview
            </div>
            <pre
              className={`max-h-56 overflow-auto whitespace-pre-wrap break-words text-xs text-content/80 ${part.kind === "json" ? "font-mono" : "font-sans"}`}
            >
              {boundedTextPreview(part.text)}
            </pre>
            <button
              type="button"
              onClick={showFull}
              className="mt-2 rounded px-2 py-1 text-xs text-content/70 hover:bg-content/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              Show full content
            </button>
          </div>
        </Popover>
      ) : null}
      {open ? (
        <Modal
          title={label}
          size="lg"
          onClose={() => {
            setOpen(false);
            trigger.current?.focus();
            setHovered(false);
          }}
        >
          <pre
            data-selectable-agent-response={messageId}
            className={`m-4 max-h-[65dvh] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-content/5 p-4 text-sm text-content ${part.kind === "json" ? "font-mono" : "font-sans"}`}
          >
            <AttachmentTokenText text={part.text} attachments={attachments} />
          </pre>
        </Modal>
      ) : null}
    </>
  );
}

export const UserTextPreview = memo(function UserTextPreview({
  parts,
  messageId,
  attachments,
}: {
  parts: UserTextPart[];
  messageId: string;
  attachments?: Attachment[];
}) {
  return (
    <div className="min-w-0 text-sm">
      {parts.map((part, index) =>
        part.compact ? (
          <TextCard
            key={index}
            part={part}
            messageId={messageId}
            attachments={attachments}
          />
        ) : (
          <pre
            key={index}
            data-selectable-agent-response={messageId}
            className="whitespace-pre-wrap break-words font-sans"
          >
            <AttachmentTokenText text={part.text} attachments={attachments} />
          </pre>
        ),
      )}
    </div>
  );
});
