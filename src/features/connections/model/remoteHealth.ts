import { useSyncExternalStore } from "react";
import {
  classifyRemoteError,
  isConnectionFailure,
  unreachablePollDelay,
  type RemoteFailure,
} from "./remoteFailure";
import { parseRemotePath } from "./remoteProjects";

/** What the views of a remote project last learned about its machine. Each view
 * reports the outcome of its loads under its own `source` ("changes", "graph",
 * "files"…); this module keeps the latest failure per source for display, and
 * tells pollers to back off while the machine is unreachable. Local paths are
 * never recorded. */

const failures = new Map<string, RemoteFailure>();
/** Machines whose last requests failed to connect, and when. */
const unreachable = new Map<string, { count: number; at: number }>();
const changeListeners = new Set<() => void>();
const recoveredListeners = new Set<() => void>();

const environmentOf = (cwd: string) => parseRemotePath(cwd)?.environmentId;
const keyFor = (environmentId: string, source: string) => `${environmentId}\n${source}`;
const emit = () => changeListeners.forEach((listener) => listener());

/** Records one load: `error` undefined means it succeeded. */
export function reportRemoteLoad(cwd: string, source: string, error?: unknown): void {
  const environmentId = environmentOf(cwd);
  if (!environmentId) return;
  const key = keyFor(environmentId, source);
  if (error === undefined) {
    const wasUnreachable = unreachable.delete(environmentId);
    const changed = failures.delete(key);
    if (wasUnreachable) return recover(environmentId);
    if (changed) emit();
    return;
  }
  const failure = classifyRemoteError(error);
  const previous = failures.get(key);
  const changed = previous?.kind !== failure.kind || previous.message !== failure.message;
  // Keep the stored object when nothing changed, so readers see a stable value.
  if (changed) failures.set(key, failure);
  if (failure.kind === "unreachable") {
    unreachable.set(environmentId, {
      count: (unreachable.get(environmentId)?.count ?? 0) + 1,
      at: Date.now(),
    });
  } else if (unreachable.delete(environmentId)) {
    return recover(environmentId); // the machine answered, with an error of its own
  }
  if (changed) emit();
}

/** `reportRemoteLoad` for views that show their own errors: only a failure to
 * reach the machine (or an outdated host) is recorded; any other error means
 * the machine answered. */
export function reportRemoteConnection(cwd: string, source: string, error?: unknown): void {
  reportRemoteLoad(
    cwd,
    source,
    error !== undefined && isConnectionFailure(classifyRemoteError(error)) ? error : undefined,
  );
}

/** The machine answered again: drop what we showed about it being down and let
 * every view reload now. Also called after a reconnect. */
export function notifyRemoteRecovered(): void {
  unreachable.clear();
  for (const [key, failure] of [...failures])
    if (failure.kind === "unreachable") failures.delete(key);
  emit();
  recoveredListeners.forEach((listener) => listener());
}

function recover(environmentId: string): void {
  for (const [key, failure] of [...failures])
    if (key.startsWith(`${environmentId}\n`) && failure.kind === "unreachable")
      failures.delete(key);
  emit();
  recoveredListeners.forEach((listener) => listener());
}

/** Whether a background poll of this project should run now. Always true
 * unless its machine is unreachable, when polls are slowed to every 15-30
 * seconds. Loads the user triggers themselves skip this check. */
export function remotePollDue(cwd: string): boolean {
  const environmentId = environmentOf(cwd);
  const state = environmentId ? unreachable.get(environmentId) : undefined;
  return !state || Date.now() - state.at >= unreachablePollDelay(state.count);
}

export function subscribeRemoteRecovered(listener: () => void): () => void {
  recoveredListeners.add(listener);
  return () => recoveredListeners.delete(listener);
}

function subscribeChanges(listener: () => void): () => void {
  changeListeners.add(listener);
  return () => changeListeners.delete(listener);
}

/** The latest failure of one view's loads for a remote project, if any. */
export function useRemoteLoadFailure(cwd: string, source: string): RemoteFailure | undefined {
  const environmentId = environmentOf(cwd);
  const read = () => (environmentId ? failures.get(keyFor(environmentId, source)) : undefined);
  return useSyncExternalStore(subscribeChanges, read, read);
}

/** For tests: forget everything. */
export function resetRemoteHealth(): void {
  failures.clear();
  unreachable.clear();
}
