import { pathKey } from "../../../shared/lib/paths";
import {
  loadProjectGroupAssignments,
  projectGroupIdForPath,
} from "./projectGroups";
import {
  isLocalProject,
  loadRecents,
  normalizeProjectPath,
  notifyProjectPathsChanged,
} from "./recents";

const KEY = "monocode.projectAdditionalDirs";

function loadAll(): Record<string, string[]> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).flatMap(([key, value]) =>
        Array.isArray(value)
          ? [[key, value.filter((dir): dir is string => typeof dir === "string" && !!dir)]]
          : [],
      ),
    );
  } catch {
    return {};
  }
}

function saveAll(all: Record<string, string[]>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
    notifyProjectPathsChanged();
  } catch {
    /* storage unavailable */
  }
}

/**
 * Folders an agent working in this project may also read and edit, beyond the
 * project folder itself. Set per project, so every session in it shares them.
 */
export function loadAdditionalDirs(project: string): string[] {
  const own = pathKey(normalizeProjectPath(project));
  return (loadAll()[own] ?? []).filter((dir) => pathKey(dir) !== own);
}

export function saveAdditionalDirs(project: string, dirs: readonly string[]): void {
  const all = loadAll();
  const own = pathKey(normalizeProjectPath(project));
  const seen = new Set<string>([own]);
  const next = dirs.map(normalizeProjectPath).filter((dir) => {
    const key = pathKey(dir);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (next.length > 0) all[own] = next;
  else delete all[own];
  saveAll(all);
}

export function removeAdditionalDirs(project: string): void {
  saveAdditionalDirs(project, []);
}

export function rebaseAdditionalDirs(from: string, to: string): void {
  const all = loadAll();
  const oldKey = pathKey(normalizeProjectPath(from));
  const newKey = pathKey(normalizeProjectPath(to));
  if (oldKey === newKey || !(oldKey in all)) return;
  if (!(newKey in all)) all[newKey] = all[oldKey];
  delete all[oldKey];
  saveAll(all);
}

/** The other local projects in this project's rail group: what the picker offers. */
export function additionalDirCandidates(project: string): string[] {
  const assignments = loadProjectGroupAssignments();
  const groupId = projectGroupIdForPath(project, assignments);
  if (!groupId) return [];
  const own = pathKey(normalizeProjectPath(project));
  return loadRecents()
    .map((recent) => recent.path)
    .filter(
      (path) =>
        pathKey(path) !== own &&
        isLocalProject(path) &&
        projectGroupIdForPath(path, assignments) === groupId,
    );
}
