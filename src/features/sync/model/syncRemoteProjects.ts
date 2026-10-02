import { pathKey } from "../../../shared/lib/paths";
import { openRemoteProject } from "../../connections/model/remoteProjects";
import {
  loadArchivedProjects,
  loadRecents,
  notifyProjectPathsChanged,
  rememberImportedProjects,
} from "../../projects/model/recents";
import { markAutoAdded, persistDismissed } from "./syncAutoAdded";
import { remoteOnlyProjects, type RemoteOnlyProject } from "./syncProjects";

/** A machine saved on this desktop whose host can open folders for it. */
export type RemoteOpenTarget = {
  environmentId: string;
  name: string;
  /** `userInitiated` requests may bring a dropped connection back up. */
  request: (method: string, params: unknown, userInitiated: boolean) => Promise<unknown>;
};

let openTargets: readonly RemoteOpenTarget[] = [];

/** Replaces the machines synced projects may be opened on; announces a change
 * so the rail re-reads which placeholders can be opened remotely. */
export function setRemoteOpenTargets(targets: readonly RemoteOpenTarget[]): void {
  const signature = (list: readonly RemoteOpenTarget[]) =>
    list.map((target) => `${target.environmentId}\n${target.name}`).join("\n\n");
  const changed = signature(targets) !== signature(openTargets);
  openTargets = targets;
  if (changed) notifyProjectPathsChanged();
}

export type RemoteOpenMatch = { target: RemoteOpenTarget; path: string };

/** The connected machine that holds a project this desktop lacks, if any. */
export function remoteOpenMatch(
  project: RemoteOnlyProject,
  targets: readonly RemoteOpenTarget[] = openTargets,
): RemoteOpenMatch | undefined {
  for (const other of project.otherPaths) {
    if (!other.hostEnvironmentId) continue;
    const target = targets.find((entry) => entry.environmentId === other.hostEnvironmentId);
    if (target) return { target, path: other.path };
  }
  return undefined;
}

/** Tooltip for a project that is only on another machine. */
export function remoteOnlyProjectHint(project: RemoteOnlyProject, match: RemoteOpenMatch | undefined): string {
  if (match) return `${match.path} on ${match.target.name}. Click to open it there.`;
  return `${project.otherPaths.map((other) => other.path).join(", ")} (another machine, not connected here). Click to link a folder.`;
}

const RETRY_BASE_MS = 60_000;
const RETRY_MAX_MS = 30 * 60_000;

/** How long to leave a project alone after its nth consecutive failed open. */
export function autoAddRetryDelayMs(failures: number): number {
  return Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.max(0, failures - 1));
}

const retries = new Map<string, { failures: number; nextAt: number }>();

const addedListeners = new Set<() => void>();

/** Fires after sync put a remote project on the rail (recents changed in storage). */
export function subscribeSyncedProjectsAdded(listener: () => void): () => void {
  addedListeners.add(listener);
  return () => void addedListeners.delete(listener);
}

function onRail(key: string): boolean {
  const wanted = pathKey(key);
  return [...loadRecents(), ...loadArchivedProjects()].some((item) => pathKey(item.path) === wanted);
}

async function addRemotely(projectId: string, match: RemoteOpenMatch, userInitiated: boolean): Promise<string> {
  const remote = await openRemoteProject(
    (method, params) => match.target.request(method, params, userInitiated),
    match.target.environmentId,
    match.path,
  );
  // Appended, not opened: a background add must not reshuffle the rail or steal focus.
  rememberImportedProjects([{ path: remote.key, lastUsedAt: Date.now() }]);
  if (!onRail(remote.key)) throw new Error("The project rail is full");
  markAutoAdded(projectId, remote.key);
  retries.delete(projectId);
  return remote.key;
}

function announce(): void {
  notifyProjectPathsChanged();
  for (const listener of [...addedListeners]) listener();
}

/** Puts every synced project that is only on a connected machine on the rail
 * as a remote project. Each project is added at most once: one the user later
 * removes is remembered as dismissed. A machine that cannot be reached is
 * retried on later calls, with a growing delay. Returns the added rail keys. */
export async function autoAddRemoteProjects(now: number = Date.now()): Promise<string[]> {
  persistDismissed();
  if (openTargets.length === 0) return [];
  const added: string[] = [];
  const failedTargets = new Set<string>();
  for (const project of remoteOnlyProjects()) {
    const match = remoteOpenMatch(project);
    if (!match) continue;
    const retry = retries.get(project.projectId);
    if (retry && now < retry.nextAt) continue;
    const fail = () => {
      const failures = (retry?.failures ?? 0) + 1;
      retries.set(project.projectId, { failures, nextAt: now + autoAddRetryDelayMs(failures) });
    };
    // An unreachable machine fails every project on it: ask it once per call
    // and back the rest off with it.
    if (failedTargets.has(match.target.environmentId)) {
      fail();
      continue;
    }
    try {
      added.push(await addRemotely(project.projectId, match, false));
    } catch {
      fail();
      failedTargets.add(match.target.environmentId);
    }
  }
  if (added.length > 0) announce();
  return added;
}

export type OpenSyncedProjectResult =
  | { status: "opened"; key: string }
  | { status: "failed"; error: unknown }
  | { status: "unavailable" };

/** The user clicked a project that is only on another machine: open it on
 * that machine when it is connected here. `unavailable` means no connected
 * machine has it, so the caller should offer to link a local folder. */
export async function openSyncedProjectRemotely(projectId: string): Promise<OpenSyncedProjectResult> {
  const project = remoteOnlyProjects().find((entry) => entry.projectId === projectId);
  const match = project ? remoteOpenMatch(project) : undefined;
  if (!match) return { status: "unavailable" };
  try {
    const key = await addRemotely(projectId, match, true);
    announce();
    return { status: "opened", key };
  } catch (error) {
    return { status: "failed", error };
  }
}
