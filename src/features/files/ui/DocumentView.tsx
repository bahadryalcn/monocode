import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { ExternalLink } from "../../../shared/ui/icons";
import { parseRemotePath } from "../../connections/model/remoteProjects";
import {
  basename,
  openPathWithDefaultApp,
  readBinaryFile,
} from "../../../platform/tauri/fs";
import { displayPath } from "../../../shared/lib/paths";
import {
  documentErrorMessage,
  documentKind,
  documentSizeProblem,
  type DocumentKind,
} from "../model/documentViewer";
import { DocumentMessage } from "./DocumentMessage";
import { formatFileSize } from "../model/filePreview";
import { watchFile } from "../model/fileWatch";

// The parsers are big; each loads on first use so none reach the main bundle.
const PdfViewer = lazy(() => import("./PdfViewer"));
const DocxViewer = lazy(() => import("./DocxViewer"));
const SheetViewer = lazy(() => import("./SheetViewer"));

type Props = { path: string; cwd: string };

type LoadState =
  | { status: "loading" }
  | { status: "ready"; bytes: Uint8Array }
  | { status: "error"; message: string };

/**
 * Read-only surface for PDF, Word and Excel files. Reads the bytes the same way
 * the image viewer does, then hands them to a lazily loaded format viewer.
 */
export function DocumentView({ path, cwd }: Props) {
  const kind = documentKind(path);
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((value) => value + 1), []);
  const name = basename(path);

  useEffect(() => {
    // Legacy .doc has nothing to parse; don't read it.
    if (!kind || kind === "doc") return;
    let cancelled = false;
    setState({ status: "loading" });
    readBinaryFile(path).then(
      (bytes) => {
        if (cancelled) return;
        const problem = documentSizeProblem(bytes.byteLength);
        setState(
          problem
            ? { status: "error", message: problem }
            : { status: "ready", bytes },
        );
      },
      (cause: unknown) => {
        if (!cancelled) {
          setState({ status: "error", message: documentErrorMessage(cause) });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [path, kind, reloadKey]);

  useEffect(() => {
    let timer = 0;
    const stop = watchFile(path, () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(reload, 50);
    });
    return () => {
      window.clearTimeout(timer);
      stop();
    };
  }, [path, reload]);

  const remote = !!parseRemotePath(path);
  const detail = (
    <p className="mt-1 truncate font-mono text-[11px] text-content/35">
      {displayPath(path, cwd)}
    </p>
  );

  let body: ReactNode;
  if (kind === "doc") {
    body = (
      <DocumentMessage title={`${name} can’t be previewed`}>
        Legacy .doc files aren’t supported. Convert it to .docx, or open it in
        the default app.
        {detail}
      </DocumentMessage>
    );
  } else if (state.status === "error") {
    body = (
      <DocumentMessage title={`Couldn’t open ${name}`} error>
        {state.message}
        {detail}
        <button
          type="button"
          onClick={reload}
          className="mt-3 h-7 rounded-md bg-content/10 px-2.5 text-[12px] text-content hover:bg-content/15"
        >
          Retry
        </button>
      </DocumentMessage>
    );
  } else if (state.status === "loading") {
    body = <Loading name={name} />;
  } else {
    body = (
      <Suspense fallback={<Loading name={name} />}>
        <FormatViewer kind={kind as DocumentKind} bytes={state.bytes} />
      </Suspense>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1">{body}</div>
      <footer className="flex h-8 shrink-0 items-center gap-3 border-t border-stroke px-3 text-[11px] text-content/50">
        <span className="truncate">{name}</span>
        {state.status === "ready" ? (
          <span className="tabular-nums">
            {formatFileSize(state.bytes.byteLength)}
          </span>
        ) : null}
        <span className="flex-1" />
        {remote ? null : (
          <button
            type="button"
            title="Open in default app"
            onClick={() => void openPathWithDefaultApp(path).catch(() => {})}
            className="flex h-5 items-center gap-1.5 rounded px-1.5 hover:bg-content/10 hover:text-content"
          >
            <ExternalLink className="size-3" strokeWidth={1.75} />
            Open in default app
          </button>
        )}
      </footer>
    </div>
  );
}

function FormatViewer({
  kind,
  bytes,
}: {
  kind: DocumentKind;
  bytes: Uint8Array;
}) {
  if (kind === "pdf") return <PdfViewer bytes={bytes} />;
  if (kind === "docx") return <DocxViewer bytes={bytes} />;
  return <SheetViewer bytes={bytes} />;
}

function Loading({ name }: { name: string }) {
  return (
    <div className="grid h-full place-items-center text-[12px] text-content/45">
      Opening {name}…
    </div>
  );
}
