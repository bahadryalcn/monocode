import { useCallback, useEffect, useRef, useState } from "react";
import {
  GlobalWorkerOptions,
  TextLayer,
  getDocument,
  type PDFDocumentProxy,
} from "pdfjs-dist/legacy/build/pdf.mjs";
// The worker is bundled as a hashed asset, so it loads from the app's own
// origin (allowed by `script-src 'self'`) and works offline. The legacy build
// avoids syntax older macOS WebKit versions reject.
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import { Minus, Plus } from "../../../shared/ui/icons";
import { documentErrorMessage } from "../model/documentViewer";
import { DocumentMessage } from "./DocumentMessage";
import "./pdfTextLayer.css";

GlobalWorkerOptions.workerSrc = workerUrl;

const MIN_SCALE = 0.25;
const MAX_SCALE = 5;
const ZOOM_STEP = 1.25;
const PAGE_GAP = 12;
const SIDE_PADDING = 32;

type Size = readonly [width: number, height: number];
type Zoom = "fit" | number;

export default function PdfViewer({ bytes }: { bytes: Uint8Array }) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // pdf.js transfers the buffer to its worker; hand it a copy so `bytes`
    // stays valid for a remount or reload.
    // The JPEG 2000 wasm decoder would need a `connect-src` entry, so it's off.
    const task = getDocument({ data: bytes.slice(), useWasm: false });
    task.promise.then(
      (loaded) => {
        if (!cancelled) setDoc(loaded);
      },
      (cause: unknown) => {
        if (!cancelled) setError(documentErrorMessage(cause));
      },
    );
    return () => {
      cancelled = true;
      void task.destroy();
    };
  }, [bytes]);

  if (error)
    return (
      <DocumentMessage title="Couldn’t read this PDF" error>
        {error}
      </DocumentMessage>
    );
  if (!doc) {
    return (
      <div className="grid h-full place-items-center text-[12px] text-content/45">
        Loading PDF…
      </div>
    );
  }
  return <PdfPages doc={doc} />;
}

function PdfPages({ doc }: { doc: PDFDocumentProxy }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [zoom, setZoom] = useState<Zoom>("fit");
  const [current, setCurrent] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  // Unscaled page sizes; pages not yet measured borrow the first page's.
  const [sizes, setSizes] = useState<Record<number, Size>>({});

  useEffect(() => {
    let cancelled = false;
    void doc.getPage(1).then((page) => {
      const view = page.getViewport({ scale: 1 });
      if (!cancelled)
        setSizes((prev) => ({ ...prev, 1: [view.width, view.height] }));
    });
    return () => {
      cancelled = true;
    };
  }, [doc]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    setWidth(element.clientWidth);
    return () => observer.disconnect();
  }, []);

  useEffect(() => setPageInput(String(current)), [current]);

  const first = sizes[1];
  const fitScale = first
    ? clamp((width - SIDE_PADDING) / first[0], MIN_SCALE, MAX_SCALE)
    : 1;
  const scale = zoom === "fit" ? fitScale : zoom;

  const onSize = useCallback((page: number, size: Size) => {
    setSizes((prev) => {
      const known = prev[page];
      if (known && known[0] === size[0] && known[1] === size[1]) return prev;
      return { ...prev, [page]: size };
    });
  }, []);

  const goTo = (page: number) => {
    const target = clamp(Math.round(page) || 1, 1, doc.numPages);
    scrollRef.current
      ?.querySelector<HTMLElement>(`[data-page="${target}"]`)
      ?.scrollIntoView({ block: "start" });
    setCurrent(target);
    setPageInput(String(target));
  };

  const zoomBy = (factor: number) =>
    setZoom(clamp(scale * factor, MIN_SCALE, MAX_SCALE));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-stroke px-3 text-[11px] text-content/60">
        <input
          aria-label="Page number"
          value={pageInput}
          inputMode="numeric"
          onChange={(event) => setPageInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") goTo(Number(pageInput));
          }}
          onBlur={() => setPageInput(String(current))}
          className="h-5 w-10 rounded bg-content/10 text-center tabular-nums text-content outline-none"
        />
        <span className="tabular-nums">/ {doc.numPages}</span>
        <span className="flex-1" />
        <ToolbarButton label="Zoom out" onClick={() => zoomBy(1 / ZOOM_STEP)}>
          <Minus className="size-3" strokeWidth={1.75} />
        </ToolbarButton>
        <span className="w-10 text-center tabular-nums">
          {Math.round(scale * 100)}%
        </span>
        <ToolbarButton label="Zoom in" onClick={() => zoomBy(ZOOM_STEP)}>
          <Plus className="size-3" strokeWidth={1.75} />
        </ToolbarButton>
        <button
          type="button"
          title="Fit to width"
          onClick={() => setZoom("fit")}
          className={`h-5 rounded px-1.5 hover:bg-content/10 hover:text-content ${
            zoom === "fit" ? "text-content" : ""
          }`}
        >
          Fit width
        </button>
      </div>
      <div
        ref={scrollRef}
        className="flex min-h-0 flex-1 flex-col items-center overflow-auto overscroll-contain bg-content/[0.04] py-3"
        style={{ gap: PAGE_GAP }}
      >
        {Array.from({ length: doc.numPages }, (_, index) => {
          const number = index + 1;
          return (
            <PdfPage
              key={number}
              doc={doc}
              number={number}
              scale={scale}
              size={sizes[number] ?? first}
              root={scrollRef}
              onSize={onSize}
              onCenter={setCurrent}
            />
          );
        })}
      </div>
    </div>
  );
}

function PdfPage({
  doc,
  number,
  scale,
  size,
  root,
  onSize,
  onCenter,
}: {
  doc: PDFDocumentProxy;
  number: number;
  scale: number;
  size: Size | undefined;
  root: React.RefObject<HTMLDivElement | null>;
  onSize: (page: number, size: Size) => void;
  onCenter: (page: number) => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);

  // Only pages within a screen or so of the viewport are rasterized; the rest
  // stay as empty frames, so a 300-page file costs a handful of canvases.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const observer = new IntersectionObserver(
      (entries) => setNear(entries[entries.length - 1].isIntersecting),
      { root: root.current, rootMargin: "100% 0px" },
    );
    observer.observe(frame);
    return () => observer.disconnect();
  }, [root]);

  // The page crossing the middle of the viewport is the "current" one.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[entries.length - 1].isIntersecting) onCenter(number);
      },
      { root: root.current, rootMargin: "-50% 0px -50% 0px" },
    );
    observer.observe(frame);
    return () => observer.disconnect();
  }, [root, number, onCenter]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const text = textRef.current;
    if (!near || !canvas || !text) return;
    let cancelled = false;
    let renderTask: { cancel: () => void } | null = null;
    let textLayer: TextLayer | null = null;

    void doc.getPage(number).then((page) => {
      if (cancelled) return;
      const natural = page.getViewport({ scale: 1 });
      onSize(number, [natural.width, natural.height]);
      const viewport = page.getViewport({ scale });
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      const task = page.render({
        canvas,
        viewport,
        transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
      });
      renderTask = task;
      task.promise.then(
        () => {
          if (cancelled) return;
          text.replaceChildren();
          textLayer = new TextLayer({
            textContentSource: page.streamTextContent(),
            container: text,
            viewport,
          });
          textLayer.render().catch(() => {});
        },
        () => {
          // A cancelled render rejects; a real failure leaves the page blank.
        },
      );
    });

    return () => {
      cancelled = true;
      renderTask?.cancel();
      textLayer?.cancel();
      // Free the bitmap when the page scrolls away or is about to re-render.
      canvas.width = 0;
      canvas.height = 0;
      text.replaceChildren();
    };
  }, [doc, number, scale, near, onSize]);

  const width = size ? Math.floor(size[0] * scale) : undefined;
  const height = size ? Math.floor(size[1] * scale) : undefined;

  return (
    <div
      ref={frameRef}
      data-page={number}
      className="relative shrink-0 bg-white shadow-sm"
      style={
        {
          width,
          height: height ?? 800,
          "--total-scale-factor": scale,
        } as React.CSSProperties
      }
    >
      <canvas ref={canvasRef} className="block" />
      <div ref={textRef} className="pdf-text-layer" />
    </div>
  );
}

function ToolbarButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="grid size-5 place-items-center rounded hover:bg-content/10 hover:text-content"
    >
      {children}
    </button>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
