import { Fragment, useState } from "react";
import { attachmentPreviewSrc } from "../model/attachments";
import { splitAttachmentTokens } from "../model/attachmentTokens";
import type { Attachment } from "../model/session";
import { ImageLightbox } from "../../../shared/ui/ImageLightbox";

type PillProps = {
  token: string;
  label: string;
  attachment: Attachment;
};

const PILL_CLASS =
  "mx-px rounded bg-content/12 px-1 py-px align-baseline text-[0.85em] text-content/80";

/** A token as a pill. It keeps its brackets in the DOM so selecting and copying give the text back. */
function TokenPill({ token, label, attachment }: PillProps) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const preview = attachmentPreviewSrc(attachment);
  const body = (
    <>
      <span className="sr-only">[</span>
      {label}
      <span className="sr-only">]</span>
    </>
  );
  if (attachment.kind !== "image" || !preview) {
    return (
      <span className={PILL_CLASS} title={attachment.path ?? attachment.name}>
        {body}
      </span>
    );
  }
  return (
    <>
      <button
        type="button"
        title={`Open ${attachment.name} full screen`}
        aria-label={`Open ${token} (${attachment.name}) full screen`}
        onClick={(event) => {
          event.stopPropagation();
          setPreviewOpen(true);
        }}
        className={`${PILL_CLASS} cursor-zoom-in hover:bg-content/20`}
      >
        {body}
      </button>
      {previewOpen ? (
        <ImageLightbox
          src={preview}
          alt={attachment.name}
          onClose={() => setPreviewOpen(false)}
        />
      ) : null}
    </>
  );
}

/** Message text with the tokens that name one of its attachments shown as pills. */
export function AttachmentTokenText({
  text,
  attachments,
}: {
  text: string;
  attachments: Attachment[] | undefined;
}) {
  if (!attachments?.length) return <>{text}</>;
  const segments = splitAttachmentTokens(text, attachments);
  return (
    <>
      {segments.map((segment, index) => (
        <Fragment key={index}>
          {"token" in segment ? (
            <TokenPill
              token={segment.token}
              label={segment.label}
              attachment={segment.attachment}
            />
          ) : (
            segment.text
          )}
        </Fragment>
      ))}
    </>
  );
}
