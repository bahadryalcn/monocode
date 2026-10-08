import { t, useLocale } from "../../../shared/i18n";
import { useState } from "react";
import { X } from "../../../shared/ui/icons";
import { attachmentPreviewSrc, isAttachmentFolder } from "../model/attachments";
import { tokenLabel } from "../model/attachmentTokens";
import type { Attachment } from "../model/session";
import { FileTypeIcon } from "../../files/ui/FileTypeIcon";
import { ImageLightbox } from "../../../shared/ui/ImageLightbox";

type Props = {
  attachment: Attachment;
  onRemove?: () => void;
  /** The token that refers to this attachment in the message text. */
  token?: string;
  /** Puts the token into the message text again. */
  onInsertToken?: () => void;
};

export function AttachmentChip({
  attachment,
  onRemove,
  token,
  onInsertToken,
}: Props) {
  useLocale();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [loadedPreview, setLoadedPreview] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const preview = loadedPreview ?? attachmentPreviewSrc(attachment);
  const loadPreview = async () => {
    if (!attachment.loadPreview || loading) return;
    setLoading(true);
    setPreviewError(false);
    try {
      const data = await attachment.loadPreview();
      setLoadedPreview(attachmentPreviewSrc({ ...attachment, data }));
      setPreviewOpen(true);
    } catch {
      setPreviewError(true);
    } finally {
      setLoading(false);
    }
  };
  // A gone image has no picture worth showing; it reads as a marked file chip.
  const image =
    attachment.kind === "image" &&
    !attachment.missing &&
    attachmentPreviewSrc(attachment);
  const label = token ? tokenLabel(token) : null;
  const labelClass = image
    ? "absolute inset-x-0 bottom-0 truncate rounded-b-lg bg-black/60 px-0.5 text-center text-[9px] leading-3.5 text-white"
    : "shrink-0 rounded bg-content/10 px-1 text-[10px] leading-4 text-content/60";
  const labelNode =
    label && onInsertToken ? (
      <button
        type="button"
        title={t("Insert {p0} into the message", { p0: token })}
        aria-label={t("Insert {p0} into the message", { p0: token })}
        // Keeps focus, and so the caret, in the message box.
        onMouseDown={(event) => event.preventDefault()}
        onClick={(event) => {
          event.stopPropagation();
          onInsertToken();
        }}
        className={`${labelClass} hover:bg-accent hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent`}
      >
        {label}
      </button>
    ) : label ? (
      <span className={labelClass}>{label}</span>
    ) : null;

  return (
    <>
      <div
        className={`group relative flex min-w-0 items-center gap-1.5 rounded-md ${
          image ? "" : "bg-content/10 py-0.5 pl-1 pr-1"
        }`}
        title={attachment.path ?? attachment.name}
      >
        {image ? (
          <span className="relative shrink-0">
            <button
              type="button"
              aria-label={t("Open {p0} full screen", { p0: attachment.name })}
              title={t("Open {p0} full screen", { p0: attachment.name })}
              onClick={(event) => {
                event.stopPropagation();
                setPreviewOpen(true);
              }}
              className="shrink-0 cursor-zoom-in rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <img
                src={preview}
                alt=""
                draggable={false}
                className="size-9 rounded-lg object-cover"
              />
            </button>
            {labelNode}
          </span>
        ) : (
          <>
            {labelNode}
            <span className="grid size-5 shrink-0 place-items-center">
              <FileTypeIcon
                name={attachment.name}
                isDir={isAttachmentFolder(attachment)}
                size={16}
              />
            </span>
            <span className="min-w-0 max-w-[140px] truncate text-[11px] leading-none text-content/80">
              {attachment.loadPreview ? (
                <button
                  type="button"
                  disabled={loading}
              aria-label={t("Open {p0} full screen", { p0: attachment.name })}
                  onClick={(event) => {
                event.stopPropagation();
                    void loadPreview();
                  }}
                  className="cursor-zoom-in hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  {loading ? t("Loading…") : attachment.name}
                </button>
              ) : (
                attachment.name
              )}
            </span>
            {previewError ? (
              <span role="alert" className="text-[10px] text-amber-400">{t("Preview unavailable. Try again.")}</span>
            ) : null}
            {attachment.missing ? (
              <span className="shrink-0 text-[10px] leading-none text-amber-400">{t("missing")}</span>
            ) : null}
          </>
        )}
        {onRemove ? (
          <button
            type="button"
            title={t("Remove")}
            aria-label={t("Remove {p0}", { p0: attachment.name })}
            onClick={(event) => {
              event.stopPropagation();
              onRemove();
            }}
            className={`grid shrink-0 place-items-center rounded-full text-content/70 hover:bg-content/15 hover:text-content ${
              image
                ? "absolute -right-1 -top-1 size-5 bg-content/20 opacity-100 shadow-sm backdrop-blur-sm"
                : "size-4 text-content/40"
            }`}
          >
            <X className="size-3" strokeWidth={2} />
          </button>
        ) : null}
      </div>
      {preview && previewOpen ? (
        <ImageLightbox
          src={preview}
          alt={attachment.name}
          onClose={() => {
            setPreviewOpen(false);
            setLoadedPreview(undefined);
          }}
        />
      ) : null}
    </>
  );
}
