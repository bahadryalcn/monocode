import { pathKey } from "../../../shared/lib/paths";
import { parseRemotePath } from "../../connections/model/remoteProjects";
import {
  loadProjectGroupAssignments,
  saveProjectGroupAssignments,
} from "../../projects/model/projectGroups";
import {
  isLocalProject,
  isRemoteProjectPath,
  knownProjectPaths,
  loadArchivedProjects,
  loadPinnedProjects,
  loadProjectRailOrder,
  loadRecents,
  looksLikeProject,
  normalizeProjectPath,
  notifyProjectPathsChanged,
  savePinnedProjects,
  saveProjectRailOrder,
} from "../../projects/model/recents";
import { autoAddedProjectIdFor, dismissedProjectIds } from "./syncAutoAdded";
import { localMachineId } from "./syncMachineId";
import { hasPulled, knownRecordValue, queueLocalChange } from "./syncPeerState";
import type {
  SyncProjectPathValue,
  SyncProjectValue,
  SyncRailLayoutValue,
  SyncRecord,
} from "./syncProtocol";

const PROJECT_ID_KEY = "monocode.sync.localProjectIds.v2";
const REMOTE_PATHS_KEY = "monocode.sync.remoteProjectPaths";
const MANUAL_LINKS_KEY = "monocode.sync.manualLinks";
const HOST_ENVIRONMENT_KEY = "monocode.sync.localHostEnvironmentId";
const RAIL_LAYOUT_ID = "rail";

/** Records which host serves this machine's filesystem, so another desktop
 * connected to that host can open this machine's projects remotely. The last
 * known value is kept while the local host is briefly unreachable. */
export function setLocalHostEnvironmentId(environmentId: string): void {
  try {
    if (localStorage.getItem(HOST_ENVIRONMENT_KEY) !== environmentId)
      localStorage.setItem(HOST_ENVIRONMENT_KEY, environmentId);
  } catch {
    // ignored; paths are pushed without a host until it can be stored
  }
}

function localHostEnvironmentId(): string | undefined {
  try {
    return localStorage.getItem(HOST_ENVIRONMENT_KEY) || undefined;
  } catch {
    return undefined;
  }
}

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
 * unrelated projects with the same folder name get merged). A `remote://`
 * rail project is named by its folder on the host, so it is the same project
 * as that folder on the machine where it is local. */
export function projectIdForPath(path: string): string | undefined {
  const linked = loadManualLinks()[pathKey(path)];
  if (linked) return linked;
  let folder = path;
  if (isRemoteProjectPath(path)) {
    const added = autoAddedProjectIdFor(path);
    if (added) return added;
    const hostPath = parseRemotePath(path)?.hostPath;
    if (!hostPath) return undefined;
    folder = hostPath;
  }
  const name = normalizeProjectPath(folder).split("/").pop()?.trim().toLowerCase();
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
  /** `hostEnvironmentId` is the host serving that machine's files, when it said so. */
  otherPaths: { machineId: string; path: string; hostEnvironmentId?: string }[];
};

/** Synced projects another machine has (not archived there) that are not on
 * this machine's rail or in its archive, neither as a local folder nor as a
 * remote project, and that the user has not removed after sync added them. */
export function remoteOnlyProjects(): RemoteOnlyProject[] {
  const local = railProjectIds();
  const dismissed = dismissedProjectIds();
  const ownEnvironmentId = localHostEnvironmentId();
  const out: RemoteOnlyProject[] = [];
  for (const [projectId, machines] of Object.entries(loadRemoteProjectPaths())) {
    if (local.has(projectId) || dismissed.has(projectId) || !machines || typeof machines !== "object") continue;
    const otherPaths = dedupeProjectPaths(
      Object.entries(machines)
        .filter(([, entry]) => entry && !entry.archived && typeof entry.path === "string")
        // A folder on this machine's own host is adopted as a local project instead.
        .filter(([, entry]) => !ownEnvironmentId || entry.hostEnvironmentId !== ownEnvironmentId)
        .map(([machineId, entry]) => ({
          machineId,
          path: entry.path,
          ...(entry.hostEnvironmentId ? { hostEnvironmentId: entry.hostEnvironmentId } : {}),
        })),
    );
    if (otherPaths.length === 0) continue;
    out.push({ projectId, name: projectId.replace(/^name:/, ""), otherPaths });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function railProjectIds(): Set<string> {
  const ids = new Set<string>();
  for (const item of [...loadRecents(), ...loadArchivedProjects()]) {
    if (!looksLikeProject(item.path)) continue;
    const id = projectIdForPath(item.path);
    if (id) ids.add(id);
  }
  return ids;
}

const ENV_MACHINE_PREFIX = "env:";

/** The `machineId` of a projectPath record a desktop pushes for a folder on
 * a connected host, on behalf of the machine that host runs on. */
export function envMachineId(environmentId: string): string {
  return `${ENV_MACHINE_PREFIX}${environmentId}`;
}

export function isEnvMachineId(machineId: string): boolean {
  return machineId.startsWith(ENV_MACHINE_PREFIX);
}

/** One entry per folder: a record the owning machine pushed and one another
 * desktop pushed on its host's behalf describe the same folder when host and
 * path match. The owning machine's entry is the one kept. */
export function dedupeProjectPaths<T extends { machineId: string; path: string; hostEnvironmentId?: string }>(
  entries: readonly T[],
): T[] {
  const byFolder = new Map<string, T>();
  for (const entry of entries) {
    const key = entry.hostEnvironmentId
      ? `host\n${entry.hostEnvironmentId}\n${pathKey(entry.path)}`
      : `machine\n${entry.machineId}`;
    const kept = byFolder.get(key);
    if (!kept || (isEnvMachineId(kept.machineId) && !isEnvMachineId(entry.machineId))) byFolder.set(key, entry);
  }
  return [...byFolder.values()];
}

/** Synced projects whose folder is on this machine (their record names this
 * machine's own host) but that are not on its rail or in its archive: another
 * desktop opened the folder remotely. Excludes ones the user removed after
 * sync added them, and ones archived where they were announced. */
export function locallyAdoptableProjects(): { projectId: string; path: string }[] {
  const ownEnvironmentId = localHostEnvironmentId();
  if (!ownEnvironmentId) return [];
  const local = railProjectIds();
  const dismissed = dismissedProjectIds();
  const out: { projectId: string; path: string }[] = [];
  for (const [projectId, machines] of Object.entries(loadRemoteProjectPaths())) {
    if (local.has(projectId) || dismissed.has(projectId) || !machines || typeof machines !== "object") continue;
    const own = Object.values(machines).filter(
      (entry) => entry && typeof entry.path === "string" && entry.hostEnvironmentId === ownEnvironmentId,
    );
    if (own.length === 0 || own.some((entry) => entry.archived)) continue;
    out.push({ projectId, path: own[0].path });
  }
  return out;
}

/** This machine's full pathKey→projectId map, for callers (Task 8's
 * assignment capture) that need to turn a `projectGroupAssignments` key
 * into the sync id for that same project. Covers local folders and
 * `remote://` rail projects; a local folder wins an id both could have. */
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
  const raw = knownRecordValue(machineId, "railLayout", RAIL_LAYOUT_ID) as Partial<SyncRailLayoutValue> | null | undefined;
  const strings = (list: unknown): string[] =>
    Array.isArray(list) ? list.filter((item): item is string => typeof item === "string") : [];
  return { order: strings(raw?.order), pinned: strings(raw?.pinned) };
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

type RemoteProjectPaths = Record<
  string,
  Record<string, { path: string; archived: boolean; hostEnvironmentId?: string }>
>;

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

const railOwnedKey = (machineId: string) => `monocode.sync.railOwned:${machineId}`;

/** Ids whose rail slot this machine has already taken over from the peer. */
function loadRailOwned(machineId: string): Set<string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(railOwnedKey(machineId)) ?? "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

function saveRailOwned(machineId: string, ids: ReadonlySet<string>): void {
  try {
    localStorage.setItem(railOwnedKey(machineId), JSON.stringify([...ids]));
  } catch {
    // ignored; the ids are adopted again next capture, which is idempotent
  }
}

function idsToPaths(ids: readonly string[]): string[] {
  return ids.flatMap((id) => {
    const path = localPathForProjectId(id);
    return path ? [path] : [];
  });
}

function applyRailOrder(order: readonly string[]): void {
  const synced = idsToPaths(order);
  const included = new Set(synced.map(pathKey));
  saveProjectRailOrder([...synced, ...loadProjectRailOrder().filter((path) => !included.has(pathKey(path)))]);
}

/** A project whose id moved to another rail path (a remote project replaced
 * by a local folder, or back) keeps its group, so the next assignment capture
 * does not read the move as the user taking it out of the group. */
function carryAssignments(previous: Record<string, string>, next: Record<string, string>): void {
  const previousKeyById = new Map(Object.entries(previous).map(([key, id]) => [id, key]));
  const moved = Object.entries(next).flatMap(([key, id]) => {
    const oldKey = previousKeyById.get(id);
    return oldKey && oldKey !== key ? [[oldKey, key] as const] : [];
  });
  if (moved.length === 0) return;
  const assignments = loadProjectGroupAssignments();
  let changed = false;
  for (const [oldKey, key] of moved) {
    if (!assignments[oldKey] || assignments[key]) continue;
    assignments[key] = assignments[oldKey];
    changed = true;
  }
  if (changed) saveProjectGroupAssignments(assignments);
}

/** Whether the machine a host runs on has itself said it holds this folder. */
function ownerAnnounced(projectId: string, environmentId: string, hostPath: string): boolean {
  const machines = loadRemoteProjectPaths()[projectId];
  if (!machines || typeof machines !== "object") return false;
  return Object.entries(machines).some(
    ([machineId, entry]) =>
      !isEnvMachineId(machineId) &&
      entry?.hostEnvironmentId === environmentId &&
      typeof entry.path === "string" &&
      pathKey(entry.path) === pathKey(hostPath),
  );
}

/** Queues this machine's local-path projects and current rail layout (as
 * project ids) for the given peer. A `remote://` rail project gets an id (so
 * its group and rail slot sync) and a projectPath record keyed by its host,
 * so the machine that host runs on learns of a folder it never opened itself.
 * Safe to call often: queueLocalChange drops any op whose value already
 * matches what the host has. */
export function captureLocalProjectChanges(machineId: string): void {
  const railPaths = [
    ...loadRecents().map((item) => item.path),
    ...loadArchivedProjects().map((item) => item.path),
  ];
  const archived = new Set(loadArchivedProjects().map((item) => pathKey(item.path)));
  const hostEnvironmentId = localHostEnvironmentId();
  const owners: Record<string, string> = {};
  const claimed = new Set<string>();
  for (const path of railPaths.filter(isLocalProject)) {
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
      ...(hostEnvironmentId ? { hostEnvironmentId } : {}),
    };
    queueLocalChange(machineId, "projectPath", `${projectId}:${localMachineId()}`, pathValue);
  }
  for (const path of railPaths) {
    if (!isRemoteProjectPath(path) || !looksLikeProject(path)) continue;
    const key = pathKey(path);
    if (key in owners) continue;
    const projectId = projectIdForPath(path);
    if (!projectId || claimed.has(projectId)) continue;
    claimed.add(projectId);
    owners[key] = projectId;
    const remote = parseRemotePath(path);
    if (!remote || remote.environmentId === hostEnvironmentId) continue;
    if (ownerAnnounced(projectId, remote.environmentId, remote.hostPath)) continue;
    const projectValue: SyncProjectValue = { id: projectId, createdAt: 0 };
    queueLocalChange(machineId, "project", projectId, projectValue);
    const pathValue: SyncProjectPathValue = {
      projectId,
      machineId: envMachineId(remote.environmentId),
      hostEnvironmentId: remote.environmentId,
      path: remote.hostPath,
      archived: archived.has(key),
    };
    queueLocalChange(machineId, "projectPath", `${projectId}:${envMachineId(remote.environmentId)}`, pathValue);
  }
  carryAssignments(loadProjectIds(), owners);
  saveProjectIds(owners);
  // An empty or smaller local layout must not replace a host layout this machine has not read yet.
  if (!hasPulled(machineId)) return;
  const host = lastHostLayout(machineId);
  // A project that just appeared here takes the slot and pin the host already
  // has for it; only later edits made on this machine count as local changes.
  const railOwned = loadRailOwned(machineId);
  const inHost = new Set([...host.order, ...host.pinned]);
  const adopted = new Set([...claimed].filter((id) => !railOwned.has(id) && inHost.has(id)));
  const owned = adopted.size > 0 ? new Set([...claimed].filter((id) => !adopted.has(id))) : claimed;
  const layout = mergeRailLayout(
    host,
    pathsToIds(loadProjectRailOrder()),
    pathsToIds(loadPinnedProjects()),
    owned,
  );
  if (adopted.size > 0) {
    applyRailOrder(layout.order);
    const pins = loadPinnedProjects();
    const pinnedKeys = new Set(pins.map(pathKey));
    const newPins = idsToPaths(layout.pinned.filter((id) => adopted.has(id))).filter(
      (path) => !pinnedKeys.has(pathKey(path)),
    );
    if (newPins.length > 0) savePinnedProjects([...pins, ...newPins]);
  }
  if (claimed.size !== railOwned.size || [...claimed].some((id) => !railOwned.has(id))) {
    saveRailOwned(machineId, claimed);
  }
  queueLocalChange(machineId, "railLayout", RAIL_LAYOUT_ID, layout);
}

function announcedHere(value: SyncProjectPathValue): boolean {
  if (typeof value.path !== "string") return false;
  const wanted = pathKey(value.path);
  return [...loadRecents(), ...loadArchivedProjects()].some((item) => {
    const remote = parseRemotePath(item.path);
    return !!remote && remote.environmentId === value.hostEnvironmentId && pathKey(remote.hostPath) === wanted;
  });
}

/** Applies incoming project/projectPath/railLayout records. Our own path
 * echoed back is a no-op: this machine already has that recents entry. A
 * path from another machine is remembered so the rail can offer the project:
 * opened remotely when its host is connected here, otherwise as a
 * placeholder to link a local folder to. */
export function applyRemoteProjectRecords(machineId: string, records: readonly SyncRecord[]): void {
  const remotePaths = loadRemoteProjectPaths();
  let remotePathsChanged = false;
  for (const record of records) {
    if (record.table === "projectPath") {
      const value = record.value as SyncProjectPathValue | null;
      if (!value) continue;
      if (value.machineId === localMachineId()) continue;
      // What this desktop announced for a remote project on its own rail.
      if (isEnvMachineId(value.machineId) && announcedHere(value)) continue;
      remotePaths[value.projectId] = {
        ...remotePaths[value.projectId],
        [value.machineId]: {
          path: value.path,
          archived: value.archived,
          ...(typeof value.hostEnvironmentId === "string" && value.hostEnvironmentId
            ? { hostEnvironmentId: value.hostEnvironmentId }
            : {}),
        },
      };
      remotePathsChanged = true;
    } else if (record.table === "railLayout") {
      const value = record.value as SyncRailLayoutValue | null;
      if (!value) continue;
      applyRailOrder(value.order);
      // A remote project sync has no id for keeps its pin: no layout covers it.
      const ids = loadProjectIds();
      const keptPins = loadPinnedProjects().filter((path) => !isLocalProject(path) && !ids[pathKey(path)]);
      savePinnedProjects([...idsToPaths(value.pinned), ...keptPins]);
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
