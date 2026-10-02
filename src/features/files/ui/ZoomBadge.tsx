import { formatZoomPercent } from "./documentZoom";

/** Floating zoom readout for viewers without a toolbar; click to reset. */
export function ZoomBadge({
  zoom,
  onReset,
}: {
  zoom: number;
  onReset: () => void;
}) {
  if (zoom === 1) return null;
  return (
    <button
      type="button"
      title="Reset zoom"
      aria-label={`Zoom ${formatZoomPercent(zoom)}, reset to 100%`}
      onClick={onReset}
      className="absolute bottom-3 right-4 z-30 h-6 rounded-md bg-content/10 px-2 text-[11px] tabular-nums text-content/70 backdrop-blur hover:bg-content/15 hover:text-content"
    >
      {formatZoomPercent(zoom)}
    </button>
  );
}
