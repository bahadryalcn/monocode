import { NativePopupHost } from "./NativePopupHost";
import { X } from "./icons";
import { useContext, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLockOverscroll } from "../hooks/useLockOverscroll";
import { LAYER } from "../lib/layers";
import { GlassBackdrop } from "../../app/shell/GlassBackdrop";
import { OverlayParent, useOverlay } from "./overlay";

export type ModalSize = "sm" | "md" | "lg";

const WIDTH: Record<ModalSize, string> = {
  sm: "w-[min(420px,calc(100vw-24px))]",
  md: "w-[min(560px,calc(100vw-24px))]",
  lg: "w-[min(880px,calc(100vw-24px))]",
};

const TOP: Record<ModalSize, string> = {
  sm: "top-[22%]",
  md: "top-[10%]",
  lg: "top-[8%]",
};

type Props = {
  onClose: () => void;
  title: string;
  description?: string;
  size?: ModalSize;
  /** Keeps the accessible title while letting focused content own the visual hierarchy. */
  minimalHeader?: boolean;
  /** Extra classes on the panel (fixed height, etc). */
  className?: string;
  /** Keep taller dialogs inside the viewport, scrolling their content. */
  fitViewport?: boolean;
  children: ReactNode;
};

export function ModalPanel({
  onClose,
  title,
  description,
  size = "md",
  minimalHeader = false,
  className,
  fitViewport = true,
  children,
}: Props) {
  const popupHost = useContext(NativePopupHost);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const overlayId = useOverlay(dialogRef, true, onClose);
  const lockOverscroll = useLockOverscroll<HTMLDivElement>();
  const uid = useId();
  const titleId = `${uid}-title`;
  const descriptionId = description ? `${uid}-desc` : undefined;

  return (
    <OverlayParent.Provider value={overlayId}>
      <div
        className={
          popupHost
            ? "relative w-full"
            : `absolute left-1/2 ${fitViewport ? "top-1/2 -translate-y-1/2" : TOP[size]} ${WIDTH[size]} -translate-x-1/2`
        }
      >
        <div
          ref={dialogRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          onMouseDown={(event) => event.stopPropagation()}
          className={`relative isolate flex flex-col overflow-hidden rounded-2xl border border-content/7 shadow-2xl ${fitViewport ? "max-h-[calc(100dvh-32px)]" : ""} ${className ?? ""}`}
        >
          <GlassBackdrop className="bg-background-base/85" />
          <div className="modal-panel relative z-[1] flex min-h-0 flex-1 flex-col">
            <header
              className={
                minimalHeader
                  ? "absolute top-3 right-3 z-[2]"
                  : "flex shrink-0 items-start gap-2 px-4 pt-3"
              }
            >
              <div
                className={minimalHeader ? "sr-only" : "min-w-0 flex-1 pt-0.5"}
              >
                <h2
                  id={titleId}
                  className="text-xl font-medium leading-tight text-content"
                >
                  {title}
                </h2>
                {description ? (
                  <p
                    id={descriptionId}
                    className="ui-secondary-text mt-0.5 break-words leading-snug"
                  >
                    {description}
                  </p>
                ) : null}
              </div>
              <button
                ref={closeRef}
                type="button"
                aria-label="Close"
                onClick={onClose}
                className="grid size-7 shrink-0 place-items-center rounded-md text-content/45 hover:bg-content/8 hover:text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <X className="size-3.5" strokeWidth={1.75} />
              </button>
            </header>
            <div
              ref={lockOverscroll}
              className="min-h-0 flex-1 overflow-y-auto overscroll-none"
            >
              {children}
            </div>
          </div>
        </div>
      </div>
    </OverlayParent.Provider>
  );
}

export function Modal(props: Props) {
  const host = useContext(NativePopupHost);
  if (host) return createPortal(<ModalPanel {...props} />, host);
  return createPortal(
    <div className="fixed inset-0" style={{ zIndex: LAYER.dialog }}>
      <div
        className="modal-backdrop absolute inset-0 bg-black/40"
        onMouseDown={props.onClose}
      />
      <ModalPanel {...props} />
    </div>,
    document.body,
  );
}
