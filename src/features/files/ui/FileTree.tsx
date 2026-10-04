import {
  ChevronDown,
  ChevronRight,
  FilePlus,
  FolderPlus,
  FoldVertical,
  Search,
} from "../../../shared/ui/icons";
import {
  createContext,
  memo,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  leafName,
  validateFileName,
  wellFormedFileName,
  type NameIssue,
} from "../model/fileName";
import { useLockOverscroll } from "../../../shared/hooks/useLockOverscroll";
import {
  loadShowExcludedFiles,
  subscribeShowExcludedFiles,
} from "../../settings/model/appearance";
import {
  createParentOf,
  dirsTouchedByCreate,
  dirsTouchedByMove,
  forgetDir,
  listCachedDir,
  loadExpanded,
  loadSelected,
  notifyDirsChanged,
  peekDir,
  refreshDir,
  saveExpanded,
  saveSelected,
  announceDirListings,
  subscribeDirListings,
  subscribeDirsChanged,
  TREE_WINDOW_CHUNK,
  windowEntries,
} from "../model/fileTree";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { REMOTE_PATH_PREFIX } from "../../../shared/lib/remotePaths";
import {
  GIT_ACTIONS,
  useRemoteSupports,
} from "../../connections/model/remoteCapabilities";
import {
  remotePollDue,
  useRemoteLoadFailure,
} from "../../connections/model/remoteHealth";
import { RemoteLoadError } from "../../connections/ui/RemoteLoadError";
import { dragPointToClient } from "../../../shared/lib/dragPoint";
import {
  basename,
  clipboardFilePaths,
  copyPath,
  createPath,
  deletePath,
  movePath,
  renamePath,
  revealPath,
  type FsEntry,
} from "../../../platform/tauri/fs";
import { displayPath, parentPath, rebasePath } from "../../../shared/lib/paths";
import { requestGitFileInspect } from "../../source-control/ui/GitFileInspector";
import { IS_MAC, IS_WIN, MOD, SHIFT } from "../../../platform/tauri/platform";
import type { OpenFileFn } from "../../search/model/search";
import type { GitStatusMap } from "../../source-control/hooks/useGitFileStatuses";
import {
  emitExplorerFilePointerDrag,
  setGrabbing,
  suppressTextSelection,
} from "../../../shared/lib/drag";
import { ExplorerMenu, type ExplorerMenuItem } from "./ExplorerMenu";
import { FileTypeIcon } from "./FileTypeIcon";

const GIT_STATUS_COLOR: Record<string, string> = {
  modified: "text-amber-400",
  added: "text-emerald-400",
  untracked: "text-emerald-400",
  deleted: "text-red-400",
};

type Props = {
  cwd: string;
  /** Display identity for the root when it differs from the physical folder. */
  rootLabel?: string;
  onOpenFile: OpenFileFn;
  onOpenTerminal?: (cwd: string) => void;
  onFileMoved?: (from: string, to: string) => void;
  onFileDeleted?: (path: string) => void;
  onSearch?: () => void;
  gitStatuses?: GitStatusMap;
};

type Creating = { id: number; parent: string; isDir: boolean };
type Clip = { mode: "copy" | "cut"; path: string; isDir: boolean };
type MenuTarget = { path: string; isDir: boolean; isRoot: boolean };
type MenuState = { x: number; y: number; target: MenuTarget };

const REVEAL_LABEL = IS_MAC
  ? "Reveal in Finder"
  : IS_WIN
    ? "Reveal in File Explorer"
    : "Open Containing Folder";

// Changing state: only TreeChildren reads it and hands each TreeNode
// primitive per-node props, so a node re-renders only when its own values change.
type TreeStateValue = {
  expanded: Set<string>;
  selectedPath: string | null;
  creating: Creating | null;
  renaming: string | null;
  cutPath: string | null;
  dragOverPath: string | null;
  showExcludedFiles: boolean;
  gitStatuses?: GitStatusMap;
};

// Referentially stable wrappers that call the latest handlers.
type TreeActions = {
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
  onFilePointerDown: (
    path: string,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
  consumeFileClick: () => boolean;
  onOpenFile: OpenFileFn;
  onCreateCommit: (id: number, raw: string) => Promise<void>;
  onCreateCancel: (id: number) => void;
  onRenameCommit: (path: string, raw: string) => Promise<void>;
  onRenameCancel: () => void;
  onItemContextMenu: (
    entry: { path: string; isDir: boolean },
    e: ReactMouseEvent,
  ) => void;
};

const TreeStateCtx = createContext<TreeStateValue | null>(null);
const TreeActionsCtx = createContext<TreeActions | null>(null);

function useTreeState(): TreeStateValue {
  const ctx = useContext(TreeStateCtx);
  if (!ctx) throw new Error("TreeStateCtx missing");
  return ctx;
}

function useTreeActions(): TreeActions {
  const ctx = useContext(TreeActionsCtx);
  if (!ctx) throw new Error("TreeActionsCtx missing");
  return ctx;
}

function isDirAt(cwd: string, path: string): boolean {
  if (path === cwd) return true;
  return (
    peekDir(parentPath(path))?.find((entry) => entry.path === path)?.isDir ??
    peekDir(path) != null
  );
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const el = document.createElement("textarea");
    el.value = text;
    el.style.position = "fixed";
    el.style.left = "-9999px";
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    el.remove();
  }
}

/** Non-Latin layouts put the local letter in `key`, so fall back to the physical key. */
function shortcutLetter(e: ReactKeyboardEvent): string {
  const key = e.key.toLowerCase();
  if (/^[a-z]$/.test(key)) return key;
  return /^Key[A-Z]$/.test(e.code) ? e.code.slice(3).toLowerCase() : key;
}

function explorerItems(
  target: MenuTarget,
  clip: Clip | null,
  canOpenTerminal: boolean,
  canInspectGit: boolean,
): ExplorerMenuItem[] {
  const pasteParent = target.isDir ? target.path : parentPath(target.path);
  const pasteBlocked =
    !!clip?.isDir &&
    (pasteParent === clip.path || pasteParent.startsWith(`${clip.path}/`));
  return [
    { kind: "item", id: "new-file", label: "New File" },
    { kind: "item", id: "new-folder", label: "New Folder" },
    { kind: "sep" },
    {
      kind: "item",
      id: "cut",
      label: "Cut",
      shortcut: `${MOD}X`,
      disabled: target.isRoot,
    },
    {
      kind: "item",
      id: "copy",
      label: "Copy",
      shortcut: `${MOD}C`,
      disabled: target.isRoot,
    },
    {
      kind: "item",
      id: "paste",
      label: "Paste",
      shortcut: `${MOD}V`,
      disabled: pasteBlocked,
    },
    {
      kind: "item",
      id: "duplicate",
      label: "Duplicate",
      disabled: target.isRoot,
    },
    { kind: "sep" },
    {
      kind: "item",
      id: "copy-path",
      label: "Copy Path",
      shortcut: `${MOD}${SHIFT}C`,
    },
    { kind: "item", id: "copy-relative-path", label: "Copy Relative Path" },
    { kind: "sep" },
    {
      kind: "item",
      id: "rename",
      label: "Rename",
      shortcut: "F2",
      disabled: target.isRoot,
    },
    {
      kind: "item",
      id: "delete",
      label: "Delete",
      shortcut: "⌫",
      disabled: target.isRoot,
      danger: true,
    },
    { kind: "sep" },
    ...(canInspectGit && !target.isDir
      ? [
          { kind: "item" as const, id: "git-history", label: "File History" },
          { kind: "item" as const, id: "git-blame", label: "Blame" },
          { kind: "sep" as const },
        ]
      : []),
    ...(canOpenTerminal
      ? [
          {
            kind: "item" as const,
            id: "open-terminal",
            label: "Open in Terminal",
          },
        ]
      : []),
    { kind: "item", id: "reveal", label: REVEAL_LABEL },
  ];
}

// Chat updates rerender the sidebar even when Files is hidden. Keep its tree
// intact unless file-tree props, local state, or subscriptions actually change.
export const FileTree = memo(function FileTree({
  cwd,
  rootLabel,
  onOpenFile,
  onOpenTerminal,
  onFileMoved,
  onFileDeleted,
  onSearch,
  gitStatuses,
}: Props) {
  const [expanded, setExpanded] = useState(() => loadExpanded(cwd));
  const [selectedPath, setSelectedPath] = useState(() => loadSelected(cwd));
  const [children, setChildren] = useState<FsEntry[] | null>(() =>
    peekDir(cwd),
  );
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState<Creating | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [clip, setClip] = useState<Clip | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [dragOverPath, setDragOverPath] = useState<string | null>(null);
  const [opError, setOpError] = useState<string | null>(null);
  // Re-runs the root listing effect only when the root's own listing changes.
  const rootListing = useSyncExternalStore(
    subscribeDirListings,
    () => peekDir(cwd),
    () => peekDir(cwd),
  );
  const showExcludedFiles = useSyncExternalStore(
    subscribeShowExcludedFiles,
    loadShowExcludedFiles,
    loadShowExcludedFiles,
  );
  const creatingRef = useRef(creating);
  creatingRef.current = creating;
  const fileDragCleanup = useRef<(() => void) | null>(null);
  const suppressFileClickUntil = useRef(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const lockOverscroll = useLockOverscroll<HTMLDivElement>();
  const name = rootLabel?.trim() || basename(cwd);
  const rootOpen = expanded.has(cwd);
  // File History and Blame need this computer or a host with `git.actions`.
  const canInspectGit = useRemoteSupports(cwd, GIT_ACTIONS) === true;
  const connectionFailure = useRemoteLoadFailure(cwd, "files");

  const toggle = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      saveExpanded(cwd, next);
      return next;
    });
  };

  const onSelect = (path: string) => {
    setSelectedPath(path);
    saveSelected(cwd, path);
  };

  const onFilePointerDown = (
    path: string,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (event.button !== 0 || fileDragCleanup.current) return;
    const handle = event.currentTarget;
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startY = event.clientY;
    let lastX = startX;
    let lastY = startY;
    let active = false;
    let restoreSelection: (() => void) | undefined;
    let preview: HTMLDivElement | null = null;

    const movePreview = () => {
      if (!preview) return;
      const edge = 8;
      const grabX = 12;
      const grabY = 13;
      const width = preview.offsetWidth;
      const height = preview.offsetHeight;
      const x = Math.min(
        Math.max(edge, lastX - grabX),
        Math.max(edge, window.innerWidth - width - edge),
      );
      const y = Math.min(
        Math.max(edge, lastY - grabY),
        Math.max(edge, window.innerHeight - height - edge),
      );
      preview.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(
        y,
      )}px, 0)`;
    };

    const createPreview = () => {
      preview = document.createElement("div");
      preview.setAttribute("aria-hidden", "true");
      preview.classList.add("explorer-file-drag-preview");

      // Keep the useful identity of the row without dragging its full-width
      // layout, indentation spacer, selection state, or button behavior.
      const icon = handle.children.item(1)?.cloneNode(true);
      const label = handle.children.item(2)?.cloneNode(true);
      if (icon) preview.append(icon);
      if (label) preview.append(label);

      document.body.append(preview);
      movePreview();
    };

    const release = () => {
      delete handle.dataset.explorerDragging;
      preview?.remove();
      preview = null;
      document.documentElement.classList.remove("is-explorer-file-dragging");
      if (restoreSelection) {
        restoreSelection();
        restoreSelection = undefined;
        setGrabbing(false);
      }
      try {
        if (handle.hasPointerCapture(pointerId))
          handle.releasePointerCapture(pointerId);
      } catch {
        /* already released */
      }
    };

    const reset = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onCancel);
      release();
      if (active) emitExplorerFilePointerDrag({ type: "end", path });
      fileDragCleanup.current = null;
    };

    const activate = () => {
      active = true;
      onSelect(path);
      restoreSelection = suppressTextSelection();
      setGrabbing(true);
      createPreview();
      document.documentElement.classList.add("is-explorer-file-dragging");
      handle.dataset.explorerDragging = "true";
      try {
        handle.setPointerCapture(pointerId);
      } catch {
        /* window listeners still track the gesture */
      }
    };

    function onMove(moveEvent: PointerEvent) {
      if (moveEvent.pointerId !== pointerId) return;
      lastX = moveEvent.clientX;
      lastY = moveEvent.clientY;
      if (!active) {
        if (Math.hypot(lastX - startX, lastY - startY) < 5) return;
        activate();
      }
      moveEvent.preventDefault();
      movePreview();
      emitExplorerFilePointerDrag({ type: "move", path, x: lastX, y: lastY });
    }

    function finish(commit: boolean, upEvent?: PointerEvent) {
      if (commit && upEvent) onMove(upEvent);
      if (active) {
        suppressFileClickUntil.current = performance.now() + 400;
        if (commit) {
          emitExplorerFilePointerDrag({
            type: "drop",
            path,
            x: lastX,
            y: lastY,
          });
        }
      }
      reset();
    }

    function onUp(upEvent: PointerEvent) {
      if (upEvent.pointerId === pointerId) finish(true, upEvent);
    }
    function onCancel() {
      finish(false);
    }
    function onKey(keyEvent: KeyboardEvent) {
      if (keyEvent.key !== "Escape") return;
      keyEvent.preventDefault();
      finish(false);
    }

    fileDragCleanup.current = onCancel;
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", onCancel);
  };

  const consumeFileClick = () =>
    performance.now() < suppressFileClickUntil.current;

  useEffect(() => () => fileDragCleanup.current?.(), []);

  const expandDirs = (dirs: string[]) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const dir of dirs) next.add(dir);
      saveExpanded(cwd, next);
      return next;
    });
  };

  const refreshTouched = async (touched: string[], forget: string[] = []) => {
    for (const path of forget) forgetDir(path);
    await Promise.all([...new Set(touched)].map((path) => refreshDir(path)));
    announceDirListings();
  };

  const remapTreePaths = (from: string, to: string) => {
    setExpanded((prev) => {
      const next = new Set<string>();
      for (const path of prev) next.add(rebasePath(path, from, to));
      saveExpanded(cwd, next);
      return next;
    });
    setSelectedPath((prev) => {
      const next = prev ? rebasePath(prev, from, to) : prev;
      saveSelected(cwd, next);
      return next;
    });
    setClip((cur) =>
      cur && (cur.path === from || cur.path.startsWith(`${from}/`))
        ? { ...cur, path: rebasePath(cur.path, from, to) }
        : cur,
    );
  };

  const startCreate = (
    isDir: boolean,
    atPath: string | null = selectedPath,
  ) => {
    const parent = createParentOf(cwd, atPath);
    setRenaming(null);
    expandDirs([cwd, parent]);
    setCreating({ id: Date.now(), parent, isDir });
  };

  const startRename = (path: string) => {
    if (path === cwd) return;
    setCreating(null);
    setMenu(null);
    onSelect(path);
    setRenaming(path);
  };

  const onCreateCancel = (id: number) => {
    setCreating((cur) => (cur?.id === id ? null : cur));
  };

  const onCreateCommit = async (id: number, raw: string) => {
    const session = creatingRef.current;
    if (!session || session.id !== id) return;
    const asFolder = session.isDir || /[/\\]$/.test(raw);
    const fileName = wellFormedFileName(raw);
    const created = await createPath(session.parent, fileName, asFolder);
    const touched = dirsTouchedByCreate(session.parent, fileName);
    await refreshTouched(touched);
    setCreating((cur) => (cur?.id === id ? null : cur));
    expandDirs(touched);
    setSelectedPath(created);
    saveSelected(cwd, created);
    if (!asFolder) onOpenFile(created, undefined, { exact: true });
  };

  const onRenameCancel = () => setRenaming(null);

  const onRenameCommit = async (path: string, raw: string) => {
    const fileName = wellFormedFileName(raw);
    if (!fileName || (fileName === basename(path) && !/[/\\]/.test(raw))) {
      setRenaming(null);
      return;
    }
    const next = await renamePath(path, fileName);
    const wasDir = isDirAt(cwd, path);
    const parent = parentPath(path);
    await refreshTouched(
      [...dirsTouchedByCreate(parent, fileName), parent],
      wasDir ? [path] : [],
    );
    setRenaming(null);
    expandDirs(dirsTouchedByCreate(parent, fileName));
    remapTreePaths(path, next);
    onFileMoved?.(path, next);
  };

  const removeEntry = async (path: string) => {
    if (path === cwd) return;
    const isDir = isDirAt(cwd, path);
    const label = basename(path);
    const ok = window.confirm(
      isDir
        ? `Delete folder “${label}” and everything inside it?`
        : `Delete “${label}”?`,
    );
    if (!ok) return;
    await deletePath(path);
    await refreshTouched([parentPath(path)], isDir ? [path] : []);
    setSelectedPath((prev) => {
      if (!prev || prev === path || prev.startsWith(`${path}/`)) {
        const parent = parentPath(path);
        saveSelected(cwd, parent);
        return parent;
      }
      return prev;
    });
    setClip((cur) =>
      cur && (cur.path === path || cur.path.startsWith(`${path}/`))
        ? null
        : cur,
    );
    onFileDeleted?.(path);
  };

  const copyExternalFiles = async (paths: string[], destParent: string) => {
    let created: string | null = null;
    try {
      for (const from of paths) created = await copyPath(from, destParent);
    } finally {
      if (created) {
        await refreshTouched([destParent]);
        expandDirs([destParent]);
        setSelectedPath(created);
        saveSelected(cwd, created);
      }
    }
  };

  const pasteAt = async (targetPath: string) => {
    const destParent = createParentOf(cwd, targetPath);
    if (!clip) {
      await copyExternalFiles(await clipboardFilePaths(), destParent);
      return;
    }
    if (
      clip.isDir &&
      (destParent === clip.path || destParent.startsWith(`${clip.path}/`))
    ) {
      throw new Error("Cannot paste a folder into itself.");
    }
    const from = clip.path;
    const mode = clip.mode;
    const isDir = clip.isDir;
    const created =
      mode === "cut"
        ? await movePath(from, destParent)
        : await copyPath(from, destParent);
    if (mode === "cut") {
      await refreshTouched(
        dirsTouchedByMove(from, created),
        isDir ? [from] : [],
      );
      remapTreePaths(from, created);
      onFileMoved?.(from, created);
      setClip(null);
    } else {
      await refreshTouched([destParent]);
    }
    expandDirs([destParent]);
    setSelectedPath(created);
    saveSelected(cwd, created);
  };

  const duplicateAt = async (path: string) => {
    if (path === cwd) return;
    const destParent = parentPath(path);
    const created = await copyPath(path, destParent);
    await refreshTouched([destParent]);
    setSelectedPath(created);
    saveSelected(cwd, created);
  };

  const run = async (work: () => Promise<void>) => {
    setOpError(null);
    try {
      await work();
    } catch (err: unknown) {
      setOpError(err instanceof Error ? err.message : String(err));
    }
  };

  const dropFiles = (paths: string[], targetPath: string) =>
    run(() => copyExternalFiles(paths, createParentOf(cwd, targetPath)));
  const dropFilesRef = useRef(dropFiles);
  dropFilesRef.current = dropFiles;

  const openMenu = (target: MenuTarget, x: number, y: number) => {
    setCreating(null);
    setRenaming(null);
    onSelect(target.path);
    setMenu({ x, y, target });
  };

  const runAction = async (id: string, target: MenuTarget) => {
    switch (id) {
      case "new-file":
        startCreate(false, target.path);
        return;
      case "new-folder":
        startCreate(true, target.path);
        return;
      case "cut":
        if (target.isRoot) return;
        setClip({ mode: "cut", path: target.path, isDir: target.isDir });
        return;
      case "copy":
        if (target.isRoot) return;
        setClip({ mode: "copy", path: target.path, isDir: target.isDir });
        return;
      case "paste":
        await run(() => pasteAt(target.path));
        return;
      case "duplicate":
        await run(() => duplicateAt(target.path));
        return;
      case "copy-path":
        await copyText(target.path);
        return;
      case "copy-relative-path":
        await copyText(displayPath(target.path, cwd));
        return;
      case "rename":
        startRename(target.path);
        return;
      case "delete":
        await run(() => removeEntry(target.path));
        return;
      case "reveal":
        await run(() => revealPath(target.path));
        return;
      case "git-history":
      case "git-blame":
        requestGitFileInspect({
          kind: id === "git-history" ? "history" : "blame",
          cwd,
          relative: displayPath(target.path, cwd),
        });
        return;
      case "open-terminal":
        onOpenTerminal?.(target.isDir ? target.path : parentPath(target.path));
        return;
    }
  };

  const onItemContextMenu = (
    entry: { path: string; isDir: boolean },
    e: ReactMouseEvent,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    openMenu(
      { path: entry.path, isDir: entry.isDir, isRoot: false },
      e.clientX,
      e.clientY,
    );
  };

  const onBackgroundMenu = (e: ReactMouseEvent) => {
    if ((e.target as HTMLElement).closest("input")) return;
    e.preventDefault();
    openMenu({ path: cwd, isDir: true, isRoot: true }, e.clientX, e.clientY);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("input")) return;
    if (
      (e.target as HTMLElement).closest("button") &&
      !(e.target as HTMLElement).closest(
        "[role='treeitem'], [data-explorer-root]",
      )
    ) {
      return;
    }
    const path = selectedPath ?? cwd;
    const isRoot = path === cwd;
    const isDir = isDirAt(cwd, path);
    const mod = e.metaKey || e.ctrlKey;
    const key = shortcutLetter(e);
    if (mod && !e.altKey && e.shiftKey && key === "c") {
      e.preventDefault();
      void copyText(path);
      return;
    }
    if (mod && !e.altKey && !e.shiftKey && key === "c") {
      if (isRoot) return;
      e.preventDefault();
      setClip({ mode: "copy", path, isDir });
      return;
    }
    if (mod && !e.altKey && !e.shiftKey && key === "x") {
      if (isRoot) return;
      e.preventDefault();
      setClip({ mode: "cut", path, isDir });
      return;
    }
    if (mod && !e.altKey && !e.shiftKey && key === "v") {
      e.preventDefault();
      void run(() => pasteAt(path));
      return;
    }
    if (e.key === "F2") {
      e.preventDefault();
      startRename(path);
      return;
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      void run(() => removeEntry(path));
      return;
    }
    if (e.key === "Escape" && clip?.mode === "cut") {
      e.preventDefault();
      setClip(null);
    }
  };

  useEffect(() => {
    if (!menu) return;
    const onScroll = () => setMenu(null);
    const scrollParent = rootRef.current?.closest(".overflow-y-auto") ?? window;
    scrollParent.addEventListener("scroll", onScroll, true);
    return () => scrollParent.removeEventListener("scroll", onScroll, true);
  }, [menu]);

  useEffect(() => {
    const treePathAt = (x: number, y: number): string | null => {
      const root = rootRef.current;
      if (!root) return null;
      const point = dragPointToClient(x, y);
      const el = document.elementFromPoint(point.x, point.y);
      if (!el || !root.contains(el)) return null;
      return el.closest<HTMLElement>("[role='treeitem']")?.title ?? cwd;
    };

    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type === "leave") {
          setDragOverPath(null);
          return;
        }
        const { x, y } = event.payload.position;
        const target = treePathAt(x, y);
        if (event.payload.type !== "drop") {
          setDragOverPath(target ? createParentOf(cwd, target) : null);
          return;
        }
        setDragOverPath(null);
        if (target) void dropFilesRef.current(event.payload.paths, target);
      })
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [cwd]);

  useEffect(() => {
    const unsub = subscribeDirsChanged(() => undefined, cwd);
    const onResume = () => {
      if (!document.hidden) notifyDirsChanged(cwd, true);
    };
    window.addEventListener("focus", onResume);
    document.addEventListener("visibilitychange", onResume);
    return () => {
      unsub();
      window.removeEventListener("focus", onResume);
      document.removeEventListener("visibilitychange", onResume);
    };
  }, [cwd]);

  useEffect(() => {
    if (!cwd.startsWith(REMOTE_PATH_PREFIX)) return;
    const timer = window.setInterval(() => {
      if (!document.hidden && remotePollDue(cwd)) notifyDirsChanged(cwd, true);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [cwd]);

  useEffect(() => {
    const hit = peekDir(cwd);
    if (hit) {
      setChildren(hit);
      setError(null);
      return;
    }
    let cancelled = false;
    setChildren(null);
    setError(null);
    void listCachedDir(cwd)
      .then((entries) => {
        if (!cancelled) setChildren(entries);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setChildren([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [cwd, rootListing]);

  const latestActions = useRef<TreeActions>(null as unknown as TreeActions);
  latestActions.current = {
    onToggle: toggle,
    onSelect,
    onFilePointerDown,
    consumeFileClick,
    onOpenFile,
    onCreateCommit,
    onCreateCancel,
    onRenameCommit,
    onRenameCancel,
    onItemContextMenu,
  };
  const actions = useMemo<TreeActions>(
    () => ({
      onToggle: (path) => latestActions.current.onToggle(path),
      onSelect: (path) => latestActions.current.onSelect(path),
      onFilePointerDown: (path, event) =>
        latestActions.current.onFilePointerDown(path, event),
      consumeFileClick: () => latestActions.current.consumeFileClick(),
      onOpenFile: (...args) => latestActions.current.onOpenFile(...args),
      onCreateCommit: (id, raw) => latestActions.current.onCreateCommit(id, raw),
      onCreateCancel: (id) => latestActions.current.onCreateCancel(id),
      onRenameCommit: (path, raw) =>
        latestActions.current.onRenameCommit(path, raw),
      onRenameCancel: () => latestActions.current.onRenameCancel(),
      onItemContextMenu: (entry, e) =>
        latestActions.current.onItemContextMenu(entry, e),
    }),
    [],
  );
  const cutPath = clip?.mode === "cut" ? clip.path : null;
  const treeState = useMemo<TreeStateValue>(
    () => ({
      expanded,
      selectedPath,
      creating,
      renaming,
      cutPath,
      dragOverPath,
      showExcludedFiles,
      gitStatuses,
    }),
    [
      expanded,
      selectedPath,
      creating,
      renaming,
      cutPath,
      dragOverPath,
      showExcludedFiles,
      gitStatuses,
    ],
  );

  return (
    <TreeActionsCtx.Provider value={actions}>
    <TreeStateCtx.Provider value={treeState}>
      <div
        ref={rootRef}
        tabIndex={-1}
        className="flex h-full min-h-0 flex-col outline-none"
        onKeyDown={onKeyDown}
        onContextMenu={onBackgroundMenu}
      >
        <div
          className="flex h-9 shrink-0 items-center gap-px overflow-visible border-b border-stroke px-2"
          onContextMenu={(e) => e.stopPropagation()}
        >
          <HeaderIcon label="New File" onClick={() => startCreate(false)}>
            <FilePlus className="size-3.5" strokeWidth={1.75} />
          </HeaderIcon>
          <HeaderIcon label="New Folder" onClick={() => startCreate(true)}>
            <FolderPlus className="size-3.5" strokeWidth={1.75} />
          </HeaderIcon>
          <HeaderIcon
            label="Collapse All"
            onClick={() => {
              setCreating(null);
              setRenaming(null);
              const next = new Set([cwd]);
              saveExpanded(cwd, next);
              setExpanded(next);
            }}
          >
            <FoldVertical className="size-3.5" strokeWidth={1.75} />
          </HeaderIcon>
          {onSearch ? (
            <HeaderIcon
              label={`Search in files (${MOD}Shift+F)`}
              onClick={onSearch}
            >
              <Search className="size-3.5" strokeWidth={1.75} />
            </HeaderIcon>
          ) : null}
        </div>
        <div className="flex h-8 shrink-0 items-center">
          <button
            type="button"
            data-explorer-root
            aria-expanded={rootOpen}
            title={cwd}
            onClick={() => {
              onSelect(cwd);
              toggle(cwd);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              openMenu(
                { path: cwd, isDir: true, isRoot: true },
                e.clientX,
                e.clientY,
              );
            }}
            className={`flex min-w-0 flex-1 items-center gap-1 h-full pl-2 text-left ${
              dragOverPath === cwd ? "bg-selection" : ""
            }`}
          >
            <span className="grid size-4 shrink-0 place-items-center text-content/50">
              {rootOpen ? (
                <ChevronDown className="size-3.5" strokeWidth={1.75} />
              ) : (
                <ChevronRight className="size-3.5" strokeWidth={1.75} />
              )}
            </span>
            <span className="min-w-0 truncate text-[11px] font-semibold tracking-[0.08em] text-content/50 uppercase">
              {name}
            </span>
          </button>
        </div>
        <div
          ref={lockOverscroll}
          className="min-h-0 flex-1 overflow-y-auto overscroll-none"
        >
          {opError ? (
            <p className="px-3 py-1 text-[12px] leading-4 text-red-400">
              {opError}
            </p>
          ) : null}
          {connectionFailure ? (
            <RemoteLoadError
              cwd={cwd}
              failure={connectionFailure}
              stale={!!children?.length}
            />
          ) : null}
          {rootOpen ? (
            <div
              role="tree"
              aria-label={`${name} files`}
              className={connectionFailure ? "opacity-60" : undefined}
            >
              <TreeChildren
                parent={cwd}
                depth={0}
                entries={children}
                loading={children === null && !error && !connectionFailure}
                error={connectionFailure ? null : error}
              />
            </div>
          ) : null}
        </div>
      </div>
      {menu ? (
        <ExplorerMenu
          x={menu.x}
          y={menu.y}
          items={explorerItems(
            menu.target,
            clip,
            !!onOpenTerminal,
            canInspectGit,
          )}
          onPick={(id) => {
            const target = menu.target;
            setMenu(null);
            void runAction(id, target);
          }}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </TreeStateCtx.Provider>
    </TreeActionsCtx.Provider>
  );
});

function HeaderIcon({
  label,
  onClick,
  active = false,
  children,
}: {
  label: string;
  onClick?: () => void;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active || undefined}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`flex h-6 min-w-0 flex-1 items-center justify-center self-center rounded-md ${
        active
          ? "bg-selection text-content"
          : "text-content/50 hover:bg-content/5 hover:text-content"
      }`}
    >
      {children}
    </button>
  );
}

function TreeChildren({
  parent,
  depth,
  entries,
  loading,
  error,
}: {
  parent: string;
  depth: number;
  entries: FsEntry[] | null;
  loading: boolean;
  error: string | null;
}) {
  const ctx = useTreeState();
  const actions = useTreeActions();
  const creating = ctx.creating;
  const show = creating?.parent === parent;
  const row =
    show && creating ? (
      <NameRow
        key={creating.id}
        depth={depth}
        isDir={creating.isDir}
        siblings={(entries ?? []).map((entry) => entry.name)}
        onCommit={(raw) => actions.onCreateCommit(creating.id, raw)}
        onCancel={() => actions.onCreateCancel(creating.id)}
      />
    ) : null;
  const [limit, setLimit] = useState(TREE_WINDOW_CHUNK);
  const visible = ctx.showExcludedFiles
    ? entries
    : entries?.filter((e) => !e.ignored);
  // Big folders render a first chunk (folders first, as below); selection,
  // rename and drag targets stay mounted even past the cut.
  const { shown, hidden } = windowEntries(
    [
      ...(visible?.filter((e) => e.isDir) ?? []),
      ...(visible?.filter((e) => !e.isDir) ?? []),
    ],
    limit,
    [ctx.selectedPath, ctx.renaming, ctx.dragOverPath],
  );
  const folders = shown.filter((e) => e.isDir);
  const files = shown.filter((e) => !e.isDir);
  const pad = { paddingLeft: 28 + depth * 12 };
  const renderNode = (child: FsEntry) => {
    const open = ctx.expanded.has(child.path);
    return (
      <TreeNode
        key={child.path}
        entry={child}
        depth={depth}
        open={open}
        selected={ctx.selectedPath === child.path}
        editing={ctx.renaming === child.path}
        cut={ctx.cutPath === child.path}
        dragOver={ctx.dragOverPath === child.path}
        gitStatus={
          child.isDir
            ? ctx.gitStatuses?.dirs.get(child.path)
            : ctx.gitStatuses?.files.get(child.path)
        }
      />
    );
  };

  return (
    <>
      {error ? (
        <p className="truncate pr-2 text-[12px] text-content/50" style={pad}>
          {error}
        </p>
      ) : null}
      {show && ctx.creating?.isDir ? row : null}
      {loading && !error ? (
        <p className="pr-2 text-[12px] text-content/50" style={pad}>
          …
        </p>
      ) : null}
      {folders.map(renderNode)}
      {show && ctx.creating && !ctx.creating.isDir ? row : null}
      {files.map(renderNode)}
      {hidden > 0 ? (
        <p className="flex gap-3 pr-2 text-[12px] text-content/50" style={pad}>
          <button
            type="button"
            className="hover:text-content"
            onClick={() => setLimit((n) => n + TREE_WINDOW_CHUNK)}
          >
            Show {Math.min(TREE_WINDOW_CHUNK, hidden)} more…
          </button>
          {hidden > TREE_WINDOW_CHUNK ? (
            <button
              type="button"
              className="hover:text-content"
              onClick={() => setLimit(Number.POSITIVE_INFINITY)}
            >
              Show all {hidden}
            </button>
          ) : null}
        </p>
      ) : null}
    </>
  );
}

const TreeNode = memo(function TreeNode({
  entry,
  depth,
  open,
  selected,
  editing,
  cut,
  dragOver,
  gitStatus,
}: {
  entry: FsEntry;
  depth: number;
  open: boolean;
  selected: boolean;
  editing: boolean;
  cut: boolean;
  dragOver: boolean;
  gitStatus: string | undefined;
}) {
  const {
    onToggle,
    onSelect,
    onFilePointerDown,
    consumeFileClick,
    onOpenFile,
    onRenameCommit,
    onRenameCancel,
    onItemContextMenu,
  } = useTreeActions();
  const [loaded, setLoaded] = useState<FsEntry[] | null>(() =>
    entry.isDir ? peekDir(entry.path) : null,
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  // Only an open folder watches the cache, and only for its own listing: a
  // change elsewhere leaves this snapshot's identity (and this node) alone.
  const watching = entry.isDir && open;
  const cached = useSyncExternalStore(
    subscribeDirListings,
    () => (watching ? peekDir(entry.path) : null),
    () => (watching ? peekDir(entry.path) : null),
  );
  const children = cached ?? loaded;
  const error = cached ? null : loadError;
  const gitColor = gitStatus ? GIT_STATUS_COLOR[gitStatus] : undefined;

  useEffect(() => {
    if (!entry.isDir || !open || cached) return;
    let cancelled = false;
    void listCachedDir(entry.path)
      .then((entries) => {
        if (!cancelled) {
          setLoaded(entries);
          setLoadError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : String(err));
          setLoaded([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [entry.isDir, entry.path, open, cached]);

  const onClick = () => {
    if (consumeFileClick()) return;
    onSelect(entry.path);
    if (entry.isDir) onToggle(entry.path);
    else onOpenFile(entry.path, undefined, { exact: true });
  };

  return (
    <div>
      {editing ? (
        <NameRow
          depth={depth}
          isDir={entry.isDir}
          initial={entry.name}
          selectStem={!entry.isDir}
          siblings={(peekDir(parentPath(entry.path)) ?? [])
            .map((child) => child.name)
            .filter((name) => name !== entry.name)}
          onCommit={(raw) => onRenameCommit(entry.path, raw)}
          onCancel={onRenameCancel}
        />
      ) : (
        <button
          type="button"
          role="treeitem"
          title={entry.path}
          aria-expanded={entry.isDir ? open : undefined}
          onClick={onClick}
          onDoubleClick={() => {
            if (!entry.isDir) {
              onOpenFile(entry.path, undefined, { exact: true, pin: true });
            }
          }}
          onPointerDown={(event) => {
            if (!entry.isDir) onFilePointerDown(entry.path, event);
          }}
          onContextMenu={(e) => onItemContextMenu(entry, e)}
          style={{ paddingLeft: 8 + depth * 12 }}
          className={`flex h-7.5 w-full cursor-default items-center gap-1 pr-2 text-left text-[14px] leading-none data-[explorer-dragging]:opacity-50 ${
            selected
              ? "bg-selection text-content"
              : "text-content hover:bg-content/5"
          } ${cut ? "opacity-50" : ""} ${dragOver ? "bg-selection" : ""}`}
        >
          <span className="grid size-4 shrink-0 place-items-center text-content/50">
            {entry.isDir ? (
              open ? (
                <ChevronDown className="size-3.5" strokeWidth={1.75} />
              ) : (
                <ChevronRight className="size-3.5" strokeWidth={1.75} />
              )
            ) : null}
          </span>
          <span className="shrink-0">
            <FileTypeIcon name={entry.name} isDir={entry.isDir} isOpen={open} />
          </span>
          <span
            className={`min-w-0 truncate ${
              entry.ignored ? "italic text-content/50" : (gitColor ?? "")
            }`}
          >
            {entry.name}
          </span>
        </button>
      )}
      {entry.isDir && open ? (
        <TreeChildren
          parent={entry.path}
          depth={depth + 1}
          entries={children}
          loading={children === null && !error}
          error={error}
        />
      ) : null}
    </div>
  );
});

export function NameRow({
  depth,
  isDir,
  initial = "",
  selectStem = false,
  siblings,
  onCommit,
  onCancel,
}: {
  depth: number;
  isDir: boolean;
  initial?: string;
  selectStem?: boolean;
  siblings: string[];
  onCommit: (raw: string) => Promise<void>;
  onCancel: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const finished = useRef(false);
  const [value, setValue] = useState(initial);
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const issue = validateFileName(value, siblings);
  const leaf = leafName(value);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.scrollIntoView({ block: "nearest" });
    if (!selectStem) return;
    const dot = initial.lastIndexOf(".");
    if (dot > 0) input.setSelectionRange(0, dot);
    else input.select();
  }, [initial, selectStem]);

  const finish = (success: boolean) => {
    if (finished.current) return;
    if (success) {
      const current = validateFileName(value, siblings);
      if (current && current.severity === "error") {
        setAttempted(true);
        return;
      }
      finished.current = true;
      setBusy(true);
      setSubmitError(null);
      void onCommit(value).catch((err: unknown) => {
        finished.current = false;
        setBusy(false);
        setSubmitError(err instanceof Error ? err.message : String(err));
      });
      return;
    }
    finished.current = true;
    onCancel();
  };

  const showIssue =
    submitError ||
    (issue &&
      (issue.severity === "warning" ||
        (issue.kind !== "empty" && value.length > 0) ||
        (issue.kind === "empty" && attempted)));

  return (
    <div>
      <div
        style={{ paddingLeft: 8 + depth * 12 }}
        className="flex h-7.5 w-full items-center gap-1 bg-content/10 pr-2"
      >
        <span className="grid size-4 shrink-0 place-items-center text-content/50">
          {isDir ? (
            <ChevronRight className="size-3.5" strokeWidth={1.75} />
          ) : null}
        </span>
        <span className="shrink-0">
          <FileTypeIcon name={leaf} isDir={isDir} />
        </span>
        <input
          ref={inputRef}
          value={value}
          disabled={busy}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          aria-label="Type file name. Press Enter to confirm or Escape to cancel."
          onChange={(e) => {
            setValue(e.target.value);
            setSubmitError(null);
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === "Enter") {
              e.preventDefault();
              e.stopPropagation();
              finish(true);
            } else if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              finish(false);
            }
          }}
          onBlur={() => finish(issue === null || issue.severity !== "error")}
          className="h-5 min-w-0 flex-1 rounded-sm bg-content/10 px-1 text-[14px] leading-none text-content outline-none ring-1 ring-accent"
        />
      </div>
      {showIssue ? (
        <NameIssueView depth={depth} issue={issue} fallback={submitError} />
      ) : null}
    </div>
  );
}

function NameIssueView({
  depth,
  issue,
  fallback,
}: {
  depth: number;
  issue: NameIssue | null;
  fallback: string | null;
}) {
  let body: ReactNode = null;
  if (fallback) {
    body = fallback;
  } else if (issue) {
    switch (issue.kind) {
      case "empty":
        body = "A file or folder name must be provided.";
        break;
      case "slash":
        body = "A file or folder name cannot start with a slash.";
        break;
      case "exists":
        body = (
          <>
            A file or folder <span className="font-semibold">{issue.name}</span>{" "}
            already exists at this location. Please choose a different name.
          </>
        );
        break;
      case "invalid":
        body = (
          <>
            The name <span className="font-semibold">{issue.name}</span> is not
            valid as a file or folder name. Please choose a different name.
          </>
        );
        break;
      case "whitespace":
        body =
          "Leading or trailing whitespace detected in file or folder name.";
        break;
    }
  }
  if (!body) return null;
  const error = Boolean(fallback) || !issue || issue.severity === "error";
  return (
    <p
      className={`pr-2 pb-1 text-[12px] leading-4 ${
        error ? "text-red-400" : "text-amber-400"
      }`}
      style={{ paddingLeft: 28 + depth * 12 }}
    >
      {body}
    </p>
  );
}
