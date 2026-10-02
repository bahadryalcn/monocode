import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { read, utils, type WorkBook } from "xlsx";
import {
  MAX_SHEET_ROWS,
  buildSheetGrid,
  documentErrorMessage,
  looksLikeSpreadsheet,
  type SheetGrid,
} from "../model/documentViewer";
import { formatInteger } from "../../../shared/lib/numbers";
import { DocumentMessage } from "./DocumentMessage";
import { useAnchoredZoom } from "./documentZoom";
import { ZoomBadge } from "./ZoomBadge";

const ROW_HEIGHT = 24;
const HEADER_HEIGHT = 24;
const ROW_HEADER_WIDTH = 56;
const COLUMN_WIDTH = 120;
const FONT_SIZE = 12;
const CELL_PADDING = 8;
const OVERSCAN = 10;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;

type State =
  | { status: "loading" }
  | { status: "ready"; book: WorkBook }
  | { status: "error"; message: string };

export default function SheetViewer({ bytes }: { bytes: Uint8Array }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [active, setActive] = useState(0);

  useEffect(() => {
    setState({ status: "loading" });
    setActive(0);
    // Parsing is synchronous; the frame between these two states lets the
    // "Reading" notice paint first. Formulas and HTML are never evaluated:
    // SheetJS only reads the cached values and number formats stored in the file.
    const timer = window.setTimeout(() => {
      try {
        if (!looksLikeSpreadsheet(bytes)) {
          throw new Error(
            "This isn’t a valid Excel workbook; the file may be corrupt.",
          );
        }
        const book = read(bytes, {
          type: "array",
          sheetRows: MAX_SHEET_ROWS + 1,
          cellFormula: false,
          cellHTML: false,
          cellStyles: false,
        });
        setState({ status: "ready", book });
      } catch (cause) {
        setState({ status: "error", message: documentErrorMessage(cause) });
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [bytes]);

  if (state.status === "loading") {
    return (
      <div className="grid h-full place-items-center text-[12px] text-content/45">
        Reading spreadsheet…
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <DocumentMessage title="Couldn’t read this spreadsheet" error>
        {state.message}
      </DocumentMessage>
    );
  }
  const names = state.book.SheetNames;
  if (names.length === 0) {
    return <DocumentMessage title="This workbook has no sheets" />;
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      <SheetGridView
        book={state.book}
        name={names[Math.min(active, names.length - 1)]}
      />
      {names.length > 1 ? (
        <div
          role="tablist"
          className="flex h-8 shrink-0 items-center gap-1 overflow-x-auto border-t border-stroke px-2 text-[11px]"
        >
          {names.map((name, index) => (
            <button
              key={name}
              type="button"
              role="tab"
              aria-selected={index === active}
              onClick={() => setActive(index)}
              className={`h-6 shrink-0 rounded px-2 ${
                index === active
                  ? "bg-content/15 text-content"
                  : "text-content/55 hover:bg-content/10 hover:text-content"
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SheetGridView({ book, name }: { book: WorkBook; name: string }) {
  const grid = useMemo(() => sheetGrid(book, name), [book, name]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(0);
  const empty = grid.columns.length === 0 || grid.rows.length === 0;
  const { zoom, reset } = useAnchoredZoom(scrollRef, "sheet", {
    min: MIN_ZOOM,
    max: MAX_ZOOM,
    active: !empty,
  });
  // The grid is virtualized by row height, so zoom scales the row height, the
  // column widths and the font together rather than transforming the container.
  const rowHeight = Math.round(ROW_HEIGHT * zoom);
  const headerHeight = Math.round(HEADER_HEIGHT * zoom);
  const rowHeaderWidth = Math.round(ROW_HEADER_WIDTH * zoom);
  const columnWidth = Math.round(COLUMN_WIDTH * zoom);
  const cellStyle = {
    width: columnWidth,
    lineHeight: `${rowHeight}px`,
    paddingInline: CELL_PADDING * zoom,
  };

  // The anchored scroll lands in a layout effect; sync the windowing state
  // with it so the first painted frame already shows the right rows.
  useLayoutEffect(() => {
    if (scrollRef.current) setScrollTop(scrollRef.current.scrollTop);
  }, [zoom]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTo({ top: 0, left: 0 });
    setScrollTop(0);
    const observer = new ResizeObserver(() =>
      setViewport(element.clientHeight),
    );
    observer.observe(element);
    setViewport(element.clientHeight);
    return () => observer.disconnect();
  }, [name]);

  if (empty) {
    return <DocumentMessage title="This sheet is empty" />;
  }

  const first = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN);
  const last = Math.min(
    grid.rows.length,
    Math.ceil((scrollTop + viewport) / rowHeight) + OVERSCAN,
  );
  const width = rowHeaderWidth + grid.columns.length * columnWidth;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {grid.truncated ? (
        <div className="shrink-0 border-b border-stroke bg-content/[0.04] px-3 py-1 text-[11px] text-content/60">
          Showing the first {formatInteger(grid.rows.length)} of{" "}
          {formatInteger(grid.totalRows)} rows and{" "}
          {formatInteger(grid.columns.length)} of{" "}
          {formatInteger(grid.totalColumns)} columns.
        </div>
      ) : null}
      <div
        ref={scrollRef}
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
        className="min-h-0 flex-1 overflow-auto overscroll-contain select-text"
        style={{ fontSize: FONT_SIZE * zoom }}
      >
        <div
          className="relative"
          style={{
            width,
            height: headerHeight + grid.rows.length * rowHeight,
          }}
        >
          <div
            className="sticky top-0 z-20 flex border-b border-stroke bg-background-base text-content/55"
            style={{ height: headerHeight, width, lineHeight: `${rowHeight}px` }}
          >
            <div
              className="sticky left-0 z-10 shrink-0 border-r border-stroke bg-background-base"
              style={{ width: rowHeaderWidth }}
            />
            {grid.columns.map((label) => (
              <div
                key={label}
                className="shrink-0 border-r border-stroke text-center"
                style={{ width: columnWidth }}
              >
                {label}
              </div>
            ))}
          </div>
          {grid.rows.slice(first, last).map((row, offset) => {
            const index = first + offset;
            return (
              <div
                key={index}
                className="absolute left-0 flex border-b border-stroke/60"
                style={{
                  top: headerHeight + index * rowHeight,
                  height: rowHeight,
                  width,
                }}
              >
                <div
                  className="sticky left-0 z-10 shrink-0 border-r border-stroke bg-background-base text-right text-content/55 tabular-nums"
                  style={{
                    width: rowHeaderWidth,
                    lineHeight: `${rowHeight}px`,
                    paddingRight: CELL_PADDING * zoom,
                  }}
                >
                  {index + 1}
                </div>
                {row.map((cell, column) => (
                  <div
                    key={column}
                    title={cell}
                    className="shrink-0 truncate border-r border-stroke/60 text-content"
                    style={cellStyle}
                  >
                    {cell}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
      <ZoomBadge zoom={zoom} onReset={reset} />
    </div>
  );
}

/** Formatted cell text (what Excel displays), anchored at A1. */
function sheetGrid(book: WorkBook, name: string): SheetGrid {
  const sheet = book.Sheets[name];
  const parsed = sheet["!ref"] ? utils.decode_range(sheet["!ref"]) : null;
  if (!parsed) return buildSheetGrid([]);
  // `!fullref` is the sheet's real extent when `sheetRows` cut the parse short.
  const full = sheet["!fullref"]
    ? utils.decode_range(sheet["!fullref"])
    : parsed;
  sheet["!ref"] = utils.encode_range({ s: { r: 0, c: 0 }, e: parsed.e });
  const cells = utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: false,
    defval: "",
  });
  return buildSheetGrid(cells, full.e.r + 1, full.e.c + 1);
}
