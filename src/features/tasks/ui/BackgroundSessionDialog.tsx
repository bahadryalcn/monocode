import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { LAYER } from "../../../shared/lib/layers";
import { AlertCircle, LoaderCircle } from "../../../shared/ui/icons";
import {
  loadBackgroundSessionSummary,
  type BackgroundSessionSummary,
  type BackgroundSessionTarget,
} from "../model/backgroundSession";

/** A read-only look at a session this computer's own host ran in the
 * background. The desktop has no transcript view for those, so this shows
 * where it stands and the agent's last reply. */
export function BackgroundSessionDialog({
  target,
  onClose,
}: {
  target: Pick<BackgroundSessionTarget, "machineId" | "sessionId">;
  onClose: () => void;
}) {
  const [summary, setSummary] = useState<BackgroundSessionSummary>();
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    loadBackgroundSessionSummary(target).then(
      (loaded) => {
        if (alive) setSummary(loaded);
      },
      (reason: unknown) => {
        if (alive)
          setError(reason instanceof Error ? reason.message : String(reason));
      },
    );
    return () => {
      alive = false;
    };
  }, [target.machineId, target.sessionId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0" style={{ zIndex: LAYER.dialog }}>
      <div className="absolute inset-0 bg-black/30" onMouseDown={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={summary?.title ?? "Background session"}
        className="absolute left-1/2 top-[16%] flex max-h-[70vh] w-[min(520px,calc(100vw-24px))] -translate-x-1/2 flex-col gap-3 rounded-lg border border-content/10 bg-content/5 p-4 shadow-xl backdrop-blur-xl"
      >
        {error ? (
          <p className="flex items-start gap-2 text-[12px] text-rose-400">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
            <span>{error}</span>
          </p>
        ) : !summary ? (
          <div className="grid h-20 place-items-center text-content/35">
            <LoaderCircle className="size-4 animate-spin" />
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-1">
              <h2 className="text-[13px] font-medium leading-tight text-content">
                {summary.title}
              </h2>
              <p className="text-[12px] leading-snug text-content/55">
                {summary.status} · on this computer’s host
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain whitespace-pre-wrap break-words rounded-md border border-content/10 bg-content/3 p-3 text-[12px] leading-relaxed text-content/80">
              {summary.reply || (
                <span className="text-content/45">No reply yet.</span>
              )}
            </div>
            {summary.note ? (
              <p className="whitespace-pre-wrap break-words text-[12px] leading-snug text-content/55">
                {summary.note}
              </p>
            ) : null}
          </>
        )}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-[12px] text-content/70 hover:bg-content/8 hover:text-content"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
