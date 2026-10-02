import { pathKey } from "../../../shared/lib/paths";
import {
  isLocalProject,
  knownProjectPaths,
  loadArchivedProjects,
  loadPinnedProjects,
  loadProjectRailOrder,
  loadRecents,
  normalizeProjectPath,
  notifyProjectPathsChanged,
  savePinnedProjects,
  saveProjectRailOrder,
} from "../../projects/model/recents";
import { localMachineId } from "./syncMachineId";
import { loadPeerState, queueLocalChange } from "./syncPeerState";
import type {
  SyncProjectPathValue,
  SyncProjectValue,
  SyncRailLayoutValue,
  SyncRecord,
} from "./syncProtocol";

const PROJECT_ID_KEY = "monocode.sync.localProjectIds.v2";
const REMOTE_PATHS_KEY = "monocode.sync.remoteProjectPaths";
const MANUAL_LINKS_KEY = "monocode.sync.manualLinks";
const RAIL_LAYOUT_ID = "rail";

function loadProjectIds(): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(PROJECT_ID_KEY) ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function saveProjectIds(ids: Record<string, string>): void {
  try {
    localStorage.setItem(PROJECT_ID_KEY, JSON.stringify(ids));
  } catch {
    // ignored; a project without a cached id is assigned a fresh one next time
  }
}

/** A project's id is `name:` + its lowercased folder name, so same-named
 * folders on two machines are the same project (known limitation: two
 * unrelated projects with the same folder name get merged). */
function projectIdForPath(path: string): string | undefined {
  const linked = loadManualLinks()[pathKey(path)];
  if (linked) return linked;
  const name = normalizeProjectPath(path).split("/").pop()?.trim().toLowerCase();
  return name ? `name:${name}` : undefined;
}

function loadManualLinks(): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(MANUAL_LINKS_KEY) ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** Makes a local folder this machine's copy of a synced project even when
 * the folder name differs from the project's. */
export function linkLocalPathToProject(path: string, projectId: string): void {
  try {
    localStorage.setItem(
      MANUAL_LINKS_KEY,
      JSON.stringify({ ...loadManualLinks(), [pathKey(path)]: projectId }),
    );
  } catch {
    // ignored; the folder falls back to its name-derived id
  }
}

export type RemoteOnlyProject = {
  projectId: string;
  name: string;
  otherPaths: { machineId: string; path: string }[];
};

/** Synced projects another machine has (not archived there) that have no
 * folder on this machine. */
export function remoteOnlyProjects(): RemoteOnlyProject[] {
  const local = new Set<string>();
  for (const item of [...loadRecents(), ...loadArchivedProjects()]) {
    if (!isLocalProject(item.path)) continue;
    const id = projectIdForPath(item.path);
    if (id) local.add(id);
  }
  const out: RemoteOnlyProject[] = [];
  for (const [projectId, machines] of Object.entries(loadRemoteProjectPaths())) {
    if (local.has(projectId) || !machines || typeof machines !== "object") continue;
    const otherPaths = Object.entries(machines)
      .filter(([, entry]) => entry && !entry.archived && typeof entry.path === "string")
      .map(([machineId, entry]) => ({ machineId, path: entry.path }));
    if (otherPaths.length === 0) continue;
    out.push({ projectId, name: projectId.replace(/^name:/, ""), otherPaths });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** This machine's full pathKey→projectId map, for callers (Task 8's
 * assignment capture) that need to turn a `projectGroupAssignments` key
 * into the sync id for that same project. */
export function localProjectIdsByPath(): Record<string, string> {
  return loadProjectIds();
}

/** The reverse lookup: which local pathKey (if any) this machine has
 * assigned to a given projectId. Used to apply an incoming assignment
 * record, which only carries the projectId. */
export function localPathKeyForProjectId(projectId: string): string | undefined {
  for (const [key, id] of Object.entries(loadProjectIds())) {
    if (id === projectId) return key;
  }
  return undefined;
}

/** The local path (as stored) this machine has for a projectId, if any. */
export function localPathForProjectId(projectId: string): string | undefined {
  const key = localPathKeyForProjectId(projectId);
  if (!key) return undefined;
  return knownProjectPaths().find((path) => pathKey(path) === key);
}

function pathsToIds(paths: readonly string[]): string[] {
  const ids = loadProjectIds();
  return paths.flatMap((path) => {
    const id = ids[pathKey(path)];
    return id ? [id] : [];
  });
}

function lastHostLayout(machineId: string): SyncRailLayoutValue {
  try {
    const parsed: unknown = JSON.parse(loadPeerState(machineId).recordValues["railLayout:rail"] ?? "null");
    const raw = parsed as Partial<SyncRailLayoutValue> | null;
    const strings = (list: unknown): string[] =>
      Array.isArray(list) ? list.filter((item): item is string => typeof item === "string") : [];
    return { order: strings(raw?.order), pinned: strings(raw?.pinned) };
  } catch {
    return { order: [], pinned: [] };
  }
}

/** Merges the local rail order/pins into the last host layout so that, when
 * nothing changed locally, the result equals the host layout exactly. Ids
 * this machine does not own keep their host positions. */
export function mergeRailLayout(
  host: SyncRailLayoutValue,
  localOrderIds: readonly string[],
  localPinnedIds: readonly string[],
  owned: ReadonlySet<string>,
): SyncRailLayoutValue {
  const localOrder = localOrderIds.filter((id, i) => owned.has(id) && localOrderIds.indexOf(id) === i);
  const hostSet = new Set(host.order);
  const localInHost = localOrder.filter((id) => hostSet.has(id));
  const inLocal = new Set(localInHost);
  const queue = [...localInHost];
  const order = host.order.map((id) => (owned.has(id) && inLocal.has(id) ? queue.shift()! : id));
  for (const id of localOrder) if (!hostSet.has(id)) order.push(id);

  const localPinned = new Set(localPinnedIds.filter((id) => owned.has(id)));
  const pinned = host.pinned.filter((id) => !owned.has(id) || localPinned.has(id));
  const pinnedSet = new Set(pinned);
  for (const id of localPinnedIds) {
    if (localPinned.has(id) && !pinnedSet.has(id)) {
      pinned.push(id);
      pinnedSet.add(id);
    }
  }
  return { order, pinned };
}

type RemoteProjectPaths = Record<string, Record<string, { path: string; archived: boolean }>>;

function loadRemoteProjectPaths(): RemoteProjectPaths {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(REMOTE_PATHS_KEY) ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as RemoteProjectPaths) : {};
  } catch {
    return {};
  }
}

function saveRemoteProjectPaths(value: RemoteProjectPaths): void {
  try {
    localStorage.setItem(REMOTE_PATHS_KEY, JSON.stringify(value));
  } catch {
    // ignored; re-learned on the next pull
  }
}

/** Queues this machine's local-path projects and current rail layout (as
 * project ids) for the given peer. Safe to call often: queueLocalChange
 * drops any op whose value already matches what the host has. */
export function captureLocalProjectChanges(machineId: string): void {
  const paths = [
    ...loadRecents().map((item) => item.path),
    ...loadArchivedProjects().map((item) => item.path),
  ].filter(isLocalProject);
  const archived = new Set(loadArchivedProjects().map((item) => pathKey(item.path)));
  const owners: Record<string, string> = {};
  const claimed = new Set<string>();
  for (const path of paths) {
    const key = pathKey(path);
    if (key in owners) continue;
    const projectId = projectIdForPath(path);
    if (!projectId || claimed.has(projectId)) continue;
    claimed.add(projectId);
    owners[key] = projectId;
    const projectValue: SyncProjectValue = { id: projectId, createdAt: 0 };
    queueLocalChange(machineId, "project", projectId, projectValue);
    const pathValue: SyncProjectPathValue = {
      projectId,
      machineId: localMachineId(),
      path,
      archived: archived.has(key),
    };
    queueLocalChange(machineId, "projectPath", `${projectId}:${localMachineId()}`, pathValue);
  }
  saveProjectIds(owners);
  const layout = mergeRailLayout(
    lastHostLayout(machineId),
    pathsToIds(loadProjectRailOrder()),
    pathsToIds(loadPinnedProjects()),
    claimed,
  );
  queueLocalChange(machineId, "railLayout", RAIL_LAYOUT_ID, layout);
}

/** Applies incoming project/projectPath/railLayout records. Our own path
 * echoed back is a no-op: this machine already has that recents entry. A
 * path from another machine is remembered for later (see
 * `docs/superpowers/specs/2026-10-02-project-group-sync-design.md`) rather
 * than shown, since rendering it needs its own rail-UI work. */
export function applyRemoteProjectRecords(machineId: string, records: readonly SyncRecord[]): void {
  const remotePaths = loadRemoteProjectPaths();
  let remotePathsChanged = false;
  for (const record of records) {
    if (record.table === "projectPath") {
      const value = record.value as SyncProjectPathValue | null;
      if (!value) continue;
      if (value.machineId === localMachineId()) continue;
      remotePaths[value.projectId] = {
        ...remotePaths[value.projectId],
        [value.machineId]: { path: value.path, archived: value.archived },
      };
      remotePathsChanged = true;
    } else if (record.table === "railLayout") {
      const value = record.value as SyncRailLayoutValue | null;
      if (!value) continue;
      const toPaths = (ids: readonly string[]) =>
        ids.flatMap((id) => {
          const path = localPathForProjectId(id);
          return path ? [path] : [];
        });
      const remoteOrder = toPaths(value.order);
      const included = new Set(remoteOrder.map(pathKey));
      const localRest = loadProjectRailOrder().filter((path) => !included.has(pathKey(path)));
      saveProjectRailOrder([...remoteOrder, ...localRest]);
      const keptPins = loadPinnedProjects().filter((path) => !isLocalProject(path));
      savePinnedProjects([...toPaths(value.pinned), ...keptPins]);
    }
    // "project" records carry only an id and a creation time, nothing to
    // apply locally beyond the projectPath/railLayout records above.
  }
  if (remotePathsChanged) {
    saveRemoteProjectPaths(remotePaths);
    notifyProjectPathsChanged();
  }
  void machineId;
}
