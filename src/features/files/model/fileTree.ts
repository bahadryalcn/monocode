import { listDir, type FsEntry } from "../../../platform/tauri/fs";
import {
  classifyRemoteError,
  isConnectionFailure,
} from "../../connections/model/remoteFailure";
import { reportRemoteConnection } from "../../connections/model/remoteHealth";
import { isRemoteProjectPath } from "../../projects/model/recents";
import { pathSegments } from "./fileName";
import { joinPath, parentPath } from "../../../shared/lib/paths";

const expandedByProject = new Map<string, Set<string>>();
const selectedByProject = new Map<string, string | null>();
const dirs = new Map<string, FsEntry[]>();
const listeners = new Set<
  (roots?: readonly string[], listingsChanged?: readonly string[]) => void
>();
const activeRoots = new Map<string, number>();
const pendingRoots = new Set<string>();
let refreshAll = false;
let contentChange = false;
const dirReads = new Map<string, Promise<FsEntry[]>>();

const REFRESH_MS = 150;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let refreshing = false;
let refreshAgain = false;

export function loadExpanded(cwd: string): Set<string> {
  const saved = expandedByProject.get(cwd);
  return saved ? new Set(saved) : new Set([cwd]);
}

export function saveExpanded(cwd: string, expanded: Set<string>) {
  expandedByProject.set(cwd, new Set(expanded));
}

export function loadSelected(cwd: string): string | null {
  return selectedByProject.get(cwd) ?? null;
}

export function saveSelected(cwd: string, path: string | null) {
  selectedByProject.set(cwd, path);
}

/** Cached `listDir` — same path stays instant when the tree remounts. */
export function peekDir(path: string): FsEntry[] | null {
  return dirs.get(path) ?? null;
}

export function listCachedDir(path: string): Promise<FsEntry[]> {
  const hit = dirs.get(path);
  if (hit) return Promise.resolve(hit);
  const pending = dirReads.get(path);
  if (pending) return pending;
  const read = listDir(path)
    .then(
    (entries) => {
      dirs.set(path, entries);
      reportRemoteConnection(path, "files");
      return entries;
    },
    (error: unknown) => {
      reportRemoteConnection(path, "files", error);
      throw error;
    },
    )
    .finally(() => {
      if (dirReads.get(path) === read) dirReads.delete(path);
    });
  dirReads.set(path, read);
  return read;
}

/** A folder on a machine that cannot be reached keeps showing what it last held. */
const keepsLastListing = (path: string, error: unknown) =>
  isRemoteProjectPath(path) && isConnectionFailure(classifyRemoteError(error));

export function refreshDir(path: string): Promise<FsEntry[]> {
  const previous = dirs.get(path);
  dirs.delete(path);
  return listCachedDir(path).catch((error: unknown) => {
    if (previous && keepsLastListing(path, error)) dirs.set(path, previous);
    throw error;
  });
}

export function forgetDir(path: string) {
  for (const key of [...dirs.keys()]) {
    if (key === path || key.startsWith(`${path}/`)) dirs.delete(key);
  }
}

export function dirBelongsToRoot(path: string, root: string): boolean {
  const normalize = (value: string) =>
    value.replace(/\\/g, "/").replace(/\/+$/, "");
  const base = normalize(root);
  const name = normalize(path);
  return name === base || name.startsWith(`${base}/`);
}

/** Only current roots are polled; old machine/project caches stay passive. */
export async function refreshCachedDirs(
  roots?: readonly string[],
): Promise<string[]> {
  const paths = [...dirs.keys()].filter(
    (path) => !roots || roots.some((root) => dirBelongsToRoot(path, root)),
  );
  const changed: string[] = [];
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, paths.length) }, async () => {
      while (cursor < paths.length) {
        const path = paths[cursor++];
        const previous = JSON.stringify(dirs.get(path));
        try {
          const next = await refreshDir(path);
          if (JSON.stringify(next) !== previous) changed.push(path);
        } catch (error) {
          if (!keepsLastListing(path, error)) {
            forgetDir(path);
            changed.push(path);
          }
        }
      }
    }),
  );
  return changed;
}

export function subscribeDirsChanged(
  listener: (
    roots?: readonly string[],
    listingsChanged?: readonly string[],
  ) => void,
  root?: string,
): () => void {
  const notify = (
    paths?: readonly string[],
    listingsChanged?: readonly string[],
  ) => {
    if (!root || !paths || paths.some((path) => dirBelongsToRoot(path, root)))
      listener(paths, listingsChanged);
  };
  listeners.add(notify);
  if (root) activeRoots.set(root, (activeRoots.get(root) ?? 0) + 1);
  return () => {
    listeners.delete(notify);
    if (root) {
      const count = (activeRoots.get(root) ?? 1) - 1;
      if (count) activeRoots.set(root, count);
      else activeRoots.delete(root);
    }
  };
}

/** Reload the explorer cache after an agent/shell write (debounced). */
export function notifyDirsChanged(root?: string, pollOnly = false) {
  if (typeof document !== "undefined" && document.hidden) return;
  if (root) pendingRoots.add(root);
  else refreshAll = true;
  if (!pollOnly) contentChange = true;
  scheduleRefresh();
}

function scheduleRefresh() {
  if (refreshTimer != null) return;
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    void runRefresh();
  }, REFRESH_MS);
}

async function runRefresh() {
  if (refreshing) {
    refreshAgain = true;
    return;
  }
  refreshing = true;
  try {
    const roots = refreshAll ? [...activeRoots.keys()] : [...pendingRoots];
    const unscoped = refreshAll && roots.length === 0;
    const content = contentChange;
    refreshAll = false;
    contentChange = false;
    pendingRoots.clear();
    const changed = await refreshCachedDirs(unscoped ? undefined : roots);
    if (changed.length || unscoped || content)
      for (const listener of listeners)
        listener(
          unscoped ? undefined : content ? roots : changed,
          unscoped ? undefined : changed,
        );
  } finally {
    refreshing = false;
    if (refreshAgain) {
      refreshAgain = false;
      scheduleRefresh();
    }
  }
}

/** Folder to create into, given the explorer selection. */
export function createParentOf(cwd: string, selectedPath: string | null): string {
  if (!selectedPath || selectedPath === cwd) return cwd;
  const parent = parentPath(selectedPath);
  const entry = peekDir(parent)?.find((e) => e.path === selectedPath);
  if (entry?.isDir) return selectedPath;
  if (entry && !entry.isDir) return parent;
  if (peekDir(selectedPath)) return selectedPath;
  return parent;
}

/** Directories whose children change when creating `name` under `parent`. */
export function dirsTouchedByCreate(parent: string, name: string): string[] {
  const segments = pathSegments(name);
  const out = [parent];
  let cur = parent;
  for (let i = 0; i < segments.length - 1; i++) {
    cur = joinPath(cur, segments[i]);
    out.push(cur);
  }
  return out;
}

export function dirsTouchedByMove(from: string, to: string): string[] {
  const fromParent = parentPath(from);
  const toParent = parentPath(to);
  return fromParent === toParent ? [fromParent] : [fromParent, toParent];
}
