import { t, useLocale } from "../../../shared/i18n";
import { useEffect, useRef, useState } from "react";
import {
  listDir,
  openPathWithDefaultApp,
  type FsEntry,
} from "../../../platform/tauri/fs";
import { IS_MAC, IS_WIN } from "../../../platform/tauri/platform";
import {
  explorerMappingFor,
  localExplorerPath,
  saveExplorerMapping,
} from "../../../shared/lib/remoteExplorerPaths";
import {
  displayPath,
  parentPath,
  isEqualOrInside,
} from "../../../shared/lib/paths";
import { Modal } from "../../../shared/ui/Modal";
import { ArrowUp, FolderOpen } from "../../../shared/ui/icons";
import { FileTypeIcon } from "./FileTypeIcon";
import type { OpenFileFn } from "../../search/model/search";

/** Browse folders belonging to another machine inside the connected workspace. */
export function ChatFolderBrowser({
  path,
  onOpenFile,
  onClose,
  revealOnOpen = false,
}: {
  path: string;
  onOpenFile?: OpenFileFn;
  onClose: () => void;
  revealOnOpen?: boolean;
}) {
  useLocale();
  const [directory, setDirectory] = useState(path);
  const [entries, setEntries] = useState<FsEntry[] | null>(null);
  const [error, setError] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [editingMapping, setEditingMapping] = useState(false);
  const [remoteRoot, setRemoteRoot] = useState(path);
  const [localRoot, setLocalRoot] = useState("");
  const revealRequested = useRef(false);
  const revealLabel = IS_MAC
    ? "Reveal in Finder"
    : IS_WIN
      ? "Reveal in File Explorer"
      : "Open in File Manager";
  const parent = /^remote:\/\/[^/]+\/$/.test(directory)
    ? directory
    : parentPath(directory);

  function configureMapping() {
    const mapping = explorerMappingFor(directory);
    setRemoteRoot(mapping?.remoteRoot ?? directory);
    setLocalRoot(mapping?.localRoot ?? "");
    setEditingMapping(true);
    setActionError(undefined);
  }

  async function revealDirectory() {
    const localPath = localExplorerPath(directory);
    if (!localPath) {
      configureMapping();
      return;
    }
    setBusy(true);
    setActionError(undefined);
    try {
      // Open the folder itself, rather than selecting it in its parent.
      await openPathWithDefaultApp(localPath);
    } catch (reason) {
      setActionError(String(reason));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (revealOnOpen && !revealRequested.current) {
      revealRequested.current = true;
      void revealDirectory();
    }
    // Only the initial request should open the OS file manager automatically.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    let cancelled = false;
    setEntries(null);
    setError(undefined);
    void listDir(directory).then(
      (items) => {
        if (!cancelled) setEntries(items);
      },
      (reason) => {
        if (!cancelled) setError(String(reason));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [directory]);

  return (
    <Modal
      title={t("Folder on connected machine")}
      onClose={onClose}
      size="md"
      fitViewport
    >
      <div className="flex min-w-0 items-center gap-2 border-b border-stroke pb-2">
        <button
          type="button"
          aria-label={t("Parent folder")}
          title={t("Parent folder")}
          className="grid size-7 shrink-0 place-items-center rounded hover:bg-content/10"
          disabled={parent === directory}
          onClick={() => setDirectory(parent)}
        >
          <ArrowUp className="size-4" />
        </button>
        <span className="min-w-0 break-all font-mono text-xs text-content/70">
          {directory}
        </span>
      </div>
      <div className="flex flex-wrap gap-2 py-2">
        <button
          type="button"
          disabled={busy}
          className="rounded px-2 py-1 text-sm hover:bg-content/10 disabled:opacity-50"
          onClick={() => void revealDirectory()}
        >
          {revealLabel}
        </button>
        <button
          type="button"
          className="rounded px-2 py-1 text-sm text-content/60 hover:bg-content/10"
          onClick={configureMapping}
        >{t("Shared folder settings")}</button>
      </div>
      {editingMapping ? (
        <form
          className="grid gap-2 border-b border-stroke pb-3 text-sm"
          onSubmit={(event) => {
            event.preventDefault();
            try {
              if (!isEqualOrInside(directory, remoteRoot))
                throw new Error(
                  "The connected folder must contain the folder currently being browsed.",
                );
              saveExplorerMapping(remoteRoot, localRoot);
              setEditingMapping(false);
              void revealDirectory();
            } catch (reason) {
              setActionError(String(reason));
            }
          }}
        >
          <p>{t("Enter the shared folder path you can open on this computer. This mapping also applies to its files and subfolders.")}</p>
          <label className="grid gap-1">{t("Folder on connected machine")}<input
              className="rounded border border-stroke bg-transparent px-2 py-1 font-mono"
              value={remoteRoot}
              onChange={(event) => setRemoteRoot(event.target.value)}
              required
            />
          </label>
          <label className="grid gap-1">{t("Same folder on this computer")}<input
              className="rounded border border-stroke bg-transparent px-2 py-1 font-mono"
              placeholder={
                IS_WIN
                  ? t("\\\\MacBook\\share\\projects")
                  : "/Volumes/share/projects"
              }
              value={localRoot}
              onChange={(event) => setLocalRoot(event.target.value)}
              required
            />
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              className="rounded px-2 py-1 hover:bg-content/10"
            >{t("Save and open")}</button>
            <button type="button" onClick={() => setEditingMapping(false)}>{t("Cancel")}</button>
          </div>
        </form>
      ) : null}
      {actionError ? (
        <p role="alert" className="py-2 text-sm text-red-400">{t("Could not open the shared folder: ")}{actionError}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="py-3 text-sm text-red-400">
          {error}
        </p>
      ) : !entries ? (
        <p role="status" className="py-3 text-sm text-content/60">{t("Loading folder…")}</p>
      ) : entries.length === 0 ? (
        <p className="py-3 text-sm text-content/60">{t("This folder is empty.")}</p>
      ) : (
        <ul
          aria-label={t("Folder contents")}
          className="max-h-80 overflow-auto py-2"
        >
          {[...entries]
            .sort(
              (a, b) =>
                Number(b.isDir) - Number(a.isDir) ||
                a.name.localeCompare(b.name),
            )
            .map((entry) => (
              <li key={entry.path}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-content/10"
                  onClick={() => {
                    if (entry.isDir) setDirectory(entry.path);
                    else {
                      onOpenFile?.(entry.path, undefined, { exact: true });
                      onClose();
                    }
                  }}
                >
                  {entry.isDir ? (
                    <FolderOpen className="size-4 shrink-0" />
                  ) : (
                    <FileTypeIcon name={entry.name} isDir={false} size={16} />
                  )}
                  <span
                    className="min-w-0 truncate text-sm"
                    title={displayPath(entry.path, directory)}
                  >
                    {entry.name}
                  </span>
                </button>
              </li>
            ))}
        </ul>
      )}
    </Modal>
  );
}
