import { useEffect, useState } from "react";
import { listDir, type FsEntry } from "../../../platform/tauri/fs";
import { displayPath, parentPath } from "../../../shared/lib/paths";
import { Modal } from "../../../shared/ui/Modal";
import { ArrowUp, FolderOpen } from "../../../shared/ui/icons";
import { FileTypeIcon } from "./FileTypeIcon";
import type { OpenFileFn } from "../../search/model/search";

/** Browse folders belonging to another machine inside the connected workspace. */
export function ChatFolderBrowser({
  path,
  onOpenFile,
  onClose,
}: {
  path: string;
  onOpenFile?: OpenFileFn;
  onClose: () => void;
}) {
  const [directory, setDirectory] = useState(path);
  const [entries, setEntries] = useState<FsEntry[] | null>(null);
  const [error, setError] = useState<string>();
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
      title="Folder on connected machine"
      onClose={onClose}
      size="md"
      fitViewport
    >
      <div className="flex min-w-0 items-center gap-2 border-b border-stroke pb-2">
        <button
          type="button"
          aria-label="Parent folder"
          title="Parent folder"
          className="grid size-7 shrink-0 place-items-center rounded hover:bg-content/10"
          onClick={() => setDirectory(parentPath(directory))}
        >
          <ArrowUp className="size-4" />
        </button>
        <span className="min-w-0 break-all font-mono text-xs text-content/70">
          {directory}
        </span>
      </div>
      {error ? (
        <p role="alert" className="py-3 text-sm text-red-400">
          {error}
        </p>
      ) : !entries ? (
        <p role="status" className="py-3 text-sm text-content/60">
          Loading folder…
        </p>
      ) : entries.length === 0 ? (
        <p className="py-3 text-sm text-content/60">This folder is empty.</p>
      ) : (
        <ul
          aria-label="Folder contents"
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
