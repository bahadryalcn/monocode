import { useEffect } from "react";
import { createPortal } from "react-dom";
import { LAYER } from "../lib/layers";

const VISIBLE_MS = 7000;

/** A short message in the corner that dismisses itself or on click. */
export function TransientNotice({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const id = window.setTimeout(onDismiss, VISIBLE_MS);
    return () => window.clearTimeout(id);
  }, [message, onDismiss]);

  return createPortal(
    <button
      type="button"
      role="status"
      aria-label="Dismiss notice"
      style={{ zIndex: LAYER.toast }}
      className="fixed right-3 bottom-3 w-[min(340px,calc(100vw-24px))] rounded-xl border border-content/15 bg-background-base/95 px-3 py-2.5 text-left text-[12px] text-content shadow-xl backdrop-blur-xl"
      onClick={onDismiss}
    >
      {message}
    </button>,
    document.body,
  );
}
