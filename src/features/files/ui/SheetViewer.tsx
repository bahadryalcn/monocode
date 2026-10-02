import { useEffect, useMemo, useRef, useState } from "react";
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

const ROW_HEIGHT = 24;
const HEADER_HEIGHT = 24;
const ROW_HEADER_WIDTH = 56;
const COLUMN_WIDTH = 120;
const OVERSCAN = 10;

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

  if (grid.columns.length === 0 || grid.rows.length === 0) {
    return <DocumentMessage title="This sheet is empty" />;
  }

  const first = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const last = Math.min(
    grid.rows.length,
    Math.ceil((scrollTop + viewport) / ROW_HEIGHT) + OVERSCAN,
  );
  const width = ROW_HEADER_WIDTH + grid.columns.length * COLUMN_WIDTH;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
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
        className="min-h-0 flex-1 overflow-auto overscroll-contain text-[12px] select-text"
      >
        <div
          className="relative"
          style={{
            width,
            height: HEADER_HEIGHT + grid.rows.length * ROW_HEIGHT,
          }}
        >
          <div
            className="sticky top-0 z-20 flex border-b border-stroke bg-background-base text-content/55"
            style={{ height: HEADER_HEIGHT, width }}
          >
            <div
              className="sticky left-0 z-10 shrink-0 border-r border-stroke bg-background-base"
              style={{ width: ROW_HEADER_WIDTH }}
            />
            {grid.columns.map((label) => (
              <div
                key={label}
                className="shrink-0 border-r border-stroke text-center leading-6"
                style={{ width: COLUMN_WIDTH }}
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
                  top: HEADER_HEIGHT + index * ROW_HEIGHT,
                  height: ROW_HEIGHT,
                  width,
                }}
              >
                <div
                  className="sticky left-0 z-10 shrink-0 border-r border-stroke bg-background-base pr-2 text-right leading-6 text-content/55 tabular-nums"
                  style={{ width: ROW_HEADER_WIDTH }}
                >
                  {index + 1}
                </div>
                {row.map((cell, column) => (
                  <div
                    key={column}
                    title={cell}
                    className="shrink-0 truncate border-r border-stroke/60 px-2 leading-6 text-content"
                    style={{ width: COLUMN_WIDTH }}
                  >
                    {cell}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
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
