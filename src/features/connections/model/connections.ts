import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import {
  applySessionSync,
  type HostSession,
  type HostSessionSummary,
  type RemoteMachine,
  type SessionSync,
  type SessionSyncChunk,
  type SessionSyncResponse,
} from "./protocol";
import { remoteProjectFor } from "./remoteProjects";
import type { RemoteRailSession } from "./remoteRailSessions";
import { blocksSending } from "./remoteConnection";
import {
  notifyRemoteRecovered,
  readRemoteConnection,
  recordRemoteConnection,
  resetRemoteConnection,
} from "./remoteHealth";
import { loadRemoteAutoReconnect } from "../../settings/model/settings";
import { withRemoteAttachmentPreviews } from "./remoteAttachmentPreviews";
import {
  RemoteSessionLists,
  type SessionListReply,
} from "./remoteSessionLists";
import { remoteBackoffDelay } from "./remotePollingPolicy";
import { startRailPoller } from "./remoteRailPoller";
import { startPerformanceSpan } from "../../../shared/lib/performanceTrace";

const CHANGE = "monocode:remote-machines";
export const REMOTE_HISTORY_CHANGE = "monocode:remote-history";
export const REMOTE_HISTORY_UPDATED = "monocode:remote-history-updated";
export const refreshRemoteProjectSessions = () =>
  window.dispatchEvent(new Event(REMOTE_HISTORY_CHANGE));
let cachedMachines: RemoteMachine[] = [];
let machinesLoaded = false;
export const OPEN_CONNECTIONS_EVENT = "monocode:open-connections";
export const OPEN_REMOTE_PROJECT_EVENT = "monocode:open-remote-project";
export const refreshRemoteMachines = () =>
  window.dispatchEvent(new Event(CHANGE));
const RECONNECT = "monocode:reconnect-machine";
let reconnectRequest: string | undefined;

/** Opens Connections settings and starts reconnecting this machine there, where
 * the SSH password and host-key prompts are answered. */
export function requestMachineReconnect(machineId: string) {
  reconnectRequest = machineId;
  window.dispatchEvent(new Event(RECONNECT));
  window.dispatchEvent(new Event(OPEN_CONNECTIONS_EVENT));
}

/** The machine a view asked to reconnect, once, if it is one of `machines`. */
export function takeReconnectRequest(
  machines: RemoteMachine[],
): RemoteMachine | undefined {
  const machine = machines.find((entry) => entry.id === reconnectRequest);
  if (machine) reconnectRequest = undefined;
  return machine;
}

export function subscribeReconnectRequests(listener: () => void): () => void {
  window.addEventListener(RECONNECT, listener);
  return () => window.removeEventListener(RECONNECT, listener);
}

const EDIT = "monocode:edit-machine";
let editRequest: string | undefined;

/** Opens Connections settings with this machine's definition ready to edit. */
export function requestMachineEdit(machineId: string) {
  editRequest = machineId;
  window.dispatchEvent(new Event(EDIT));
  window.dispatchEvent(new Event(OPEN_CONNECTIONS_EVENT));
}

/** The machine a view asked to edit, once, if it is one of `machines`. */
export function takeEditRequest(
  machines: RemoteMachine[],
): RemoteMachine | undefined {
  const machine = machines.find((entry) => entry.id === editRequest);
  if (machine) editRequest = undefined;
  return machine;
}

export function subscribeEditRequests(listener: () => void): () => void {
  window.addEventListener(EDIT, listener);
  return () => window.removeEventListener(EDIT, listener);
}

const capabilitiesByEnvironment = new Map<string, string[]>();
const capabilityListeners = new Set<() => void>();
const capabilityLookups = new Map<string, Promise<string[] | undefined>>();
const capabilityFetchedAt = new Map<string, number>();
/** An `environment.describe` answer this young is reused; the machine status
 * watcher refreshes it every 15 s anyway. */
export const REMOTE_CAPABILITIES_TTL_MS = 20_000;

/** Forces the next `loadRemoteCapabilities` to ask the machine again, for a
 * machine that was edited, reconnected or removed. The last answer stays
 * readable through `cachedRemoteCapabilities`. */
export function invalidateRemoteCapabilities(environmentId: string) {
  capabilityFetchedAt.delete(environmentId);
}

/** What a machine's host last advertised in `environment.describe`. */
export function cachedRemoteCapabilities(
  environmentId: string,
): string[] | undefined {
  return capabilitiesByEnvironment.get(environmentId);
}

export function subscribeRemoteCapabilities(listener: () => void): () => void {
  capabilityListeners.add(listener);
  return () => capabilityListeners.delete(listener);
}

export function recordRemoteCapabilities(
  environmentId: string,
  advertised: unknown,
) {
  const next = Array.isArray(advertised)
    ? advertised.filter((entry): entry is string => typeof entry === "string")
    : [];
  capabilityFetchedAt.set(environmentId, Date.now());
  const previous = capabilitiesByEnvironment.get(environmentId);
  if (
    previous?.length === next.length &&
    previous.every((entry, i) => entry === next[i])
  )
    return;
  capabilitiesByEnvironment.set(environmentId, next);
  capabilityListeners.forEach((listener) => listener());
}

/** Asks a machine for its capabilities, to learn whether its host is new enough. */
export function loadRemoteCapabilities(
  environmentId: string,
): Promise<string[] | undefined> {
  const fetchedAt = capabilityFetchedAt.get(environmentId);
  if (
    fetchedAt !== undefined &&
    Date.now() - fetchedAt < REMOTE_CAPABILITIES_TTL_MS
  )
    return Promise.resolve(cachedRemoteCapabilities(environmentId));
  const pending = capabilityLookups.get(environmentId);
  if (pending) return pending;
  const lookup = (async () => {
    const machine = await remoteMachineFor(environmentId);
    if (!machine) return undefined;
    const host = await remoteRequest<{ capabilities?: unknown }>(
      machine.id,
      "environment.describe",
    );
    recordRemoteCapabilities(environmentId, host.capabilities);
    return cachedRemoteCapabilities(environmentId);
  })().finally(() => capabilityLookups.delete(environmentId));
  capabilityLookups.set(environmentId, lookup);
  return lookup;
}
const TAB_KEY = "monocode.remote-tabs.v2";
const WORKTREE_KEY = "monocode.remote-pending-worktrees.v1";

export function remotePendingWorktree(shellId: string): string | undefined {
  try {
    const value = JSON.parse(localStorage.getItem(WORKTREE_KEY) ?? "{}")[
      shellId
    ];
    return typeof value === "string" ? value : undefined;
  } catch {
    return undefined;
  }
}

/** The host checkout currently used by a remote tab. */
export function remoteTabCwd(
  project: string,
  shellId?: string,
): string | undefined {
  if (!shellId) return undefined;
  const sessionId = remoteSessionFor(shellId);
  return (
    (sessionId
      ? cachedRemoteSessionSummary(project, sessionId)?.cwd
      : undefined) ?? remotePendingWorktree(shellId)
  );
}

export function rememberRemotePendingWorktree(shellId: string, path?: string) {
  try {
    const all = JSON.parse(localStorage.getItem(WORKTREE_KEY) ?? "{}");
    if (path) all[shellId] = path;
    else delete all[shellId];
    localStorage.setItem(WORKTREE_KEY, JSON.stringify(all));
  } catch {
    /* selection is restored from the host once a session exists */
  }
}

/** The host session a tab in a remote project shows; none for a new session. */
export function remoteSessionFor(shellId: string): string | undefined {
  try {
    const value = JSON.parse(localStorage.getItem(TAB_KEY) ?? "{}")[shellId];
    return typeof value === "string" ? value : undefined;
  } catch {
    return undefined;
  }
}
export function rememberRemoteSession(shellId: string, sessionId?: string) {
  try {
    const all = JSON.parse(localStorage.getItem(TAB_KEY) ?? "{}");
    if (sessionId) all[shellId] = sessionId;
    else delete all[shellId];
    localStorage.setItem(TAB_KEY, JSON.stringify(all));
  } catch {
    /* tab selection is best effort */
  }
  window.dispatchEvent(new Event(REMOTE_HISTORY_CHANGE));
}

export {
  pendingRemoteCommand,
  pendingRemoteFollowup,
  savePendingRemoteCommand,
  clearPendingRemoteCommand,
} from "./remoteOutbox";

/** Whether a request may start a missing SSH tunnel. Always, unless the user
 * turned automatic reconnecting off: then only what the user did (`fresh`, or
 * `userInitiated`) may reconnect a machine already known to be down, and
 * background polls fail fast instead. A machine not known to be down (nothing
 * has failed yet, such as at startup) is still connected on first use. */
export function mayStartTunnel(
  machineId: string,
  fresh: boolean,
  userInitiated: boolean,
): boolean {
  if (fresh || userInitiated || loadRemoteAutoReconnect()) return true;
  const environmentId = cachedMachines.find(
    (entry) => entry.id === machineId,
  )?.environmentId;
  return (
    !environmentId || !blocksSending(readRemoteConnection(environmentId).status)
  );
}

/** `fresh` makes a dropped SSH tunnel be restarted now instead of answering
 * with the error of an attempt that failed moments ago; for a reconnect the
 * user asked for. `userInitiated` marks a request that exists because the user
 * acted (sending, opening a project), as opposed to a background poll. */
export function remoteRequest<T>(
  machineId: string,
  method: string,
  params: unknown = {},
  fresh = false,
  userInitiated = false,
): Promise<T> {
  return invoke<T>("remote_request", {
    machineId,
    method,
    params,
    ...(fresh ? { fresh } : {}),
    ...(mayStartTunnel(machineId, fresh, userInitiated)
      ? {}
      : { allowConnect: false }),
  });
}

/** Reads one sync, assembling it from bounded pieces when the host chunks it. */
async function syncRemoteSession(
  machineId: string,
  sessionId: string,
  revision?: number,
  waitMs = 0,
): Promise<SessionSync> {
  const done = startPerformanceSpan("remote-sync");
  try {
  const response = await remoteRequest<SessionSyncResponse>(
    machineId,
    "sessions.sync",
    { sessionId, revision, waitMs },
  );
  return await assembleSessionSync(machineId, sessionId, response);
  } finally { done(); }
}

async function assembleSessionSync(machineId: string, sessionId: string, response: SessionSyncResponse): Promise<SessionSync> {
  if (response.kind !== "chunked") return response;
  const pieces: string[] = [];
  let offset = 0;
  while (offset < response.length) {
    const { data } = await remoteRequest<SessionSyncChunk>(
      machineId,
      "sessions.syncChunk",
      { sessionId, transfer: response.transfer, offset },
    );
    if (!data) throw new Error("Session transfer ended early");
    pieces.push(data);
    offset += data.length;
  }
  if (offset !== response.length)
    throw new Error("Session transfer has an unexpected length");
  return JSON.parse(pieces.join("")) as SessionSync;
}

/** Fetches only what changed since `known`; falls back to a full snapshot. */
export async function loadRemoteSession(
  machineId: string,
  sessionId: string,
  known?: HostSession,
  options: { waitMs?: number; onPreviews?: (snapshot: HostSession) => void;
    pages?: boolean; onHistory?: (snapshot: HostSession) => void; isCurrent?: () => boolean;
    onHistoryError?: (error: unknown) => void } = {},
): Promise<HostSession> {
  if (known?.historyLoading) return known;
  if (!known && options.pages && options.onHistory) {
    type Page = { sync: SessionSyncResponse; before?: number; totalBlocks: number; revision: number };
    const readPage = async (before?: number, revision?: number) => {
      const page = await remoteRequest<Page>(machineId, "sessions.page", { sessionId, before, revision });
      const value = applySessionSync(undefined, await assembleSessionSync(machineId, sessionId, page.sync));
      return { ...page, value };
    };
    const initial = await readPage();
    const snapshot = { ...initial.value, historyLoading: initial.before !== undefined };
    if (initial.before !== undefined) {
      // Start after the caller can commit the ready tail to React.
      setTimeout(() => { void (async () => {
        let before = initial.before;
        let blocks = initial.value.session.blocks;
        while (before !== undefined && (options.isCurrent?.() ?? true)) {
          const page = await readPage(before, initial.revision);
          if (!(options.isCurrent?.() ?? true)) return;
          if (page.before !== undefined && page.before >= before) throw new Error("History cursor did not advance");
          blocks = [...page.value.session.blocks, ...blocks];
          before = page.before;
        }
        if (!(options.isCurrent?.() ?? true)) return;
        const history = { ...initial.value, historyLoading: false, session: { ...initial.value.session, blocks } };
        options.onHistory!(history);
        if (options.onPreviews) void withRemoteAttachmentPreviews(machineId, history, undefined,
          (params) => remoteRequest(machineId, "attachments.read", params)).then(options.onPreviews).catch(() => {});
      })().catch((error) => options.onHistoryError?.(error)); }, 0);
    }
    if (options.onPreviews) setTimeout(() => {
      if (!(options.isCurrent?.() ?? true)) return;
      void withRemoteAttachmentPreviews(machineId, snapshot, undefined,
        (params) => remoteRequest(machineId, "attachments.read", params)).then(options.onPreviews).catch(() => {});
    }, 0);
    return snapshot;
  }
  const sync = (revision?: number) =>
    syncRemoteSession(machineId, sessionId, revision, revision === undefined ? 0 : options.waitMs);
  const update = await sync(known?.revision);
  let snapshot: HostSession;
  try {
    snapshot = applySessionSync(known, update);
  } catch {
    snapshot = applySessionSync(undefined, await sync());
  }
  if (options.onPreviews) {
    void withRemoteAttachmentPreviews(machineId, snapshot, known, (params) =>
      remoteRequest(machineId, "attachments.read", params),
    ).then(options.onPreviews).catch(() => {});
    return snapshot;
  }
  // Adopted-session and preload consumers receive one complete snapshot and
  // have no callback through which independently downloaded images can arrive.
  return withRemoteAttachmentPreviews(machineId, snapshot, known, (params) =>
    remoteRequest(machineId, "attachments.read", params),
  );
}

/** The connected machine for an environment, from the last machine list read. */
export function knownRemoteMachine(
  environmentId: string,
): RemoteMachine | undefined {
  return cachedMachines.find((entry) => entry.environmentId === environmentId);
}

/** The connected machine for an environment, reading the list when needed. */
export async function remoteMachineFor(
  environmentId: string,
): Promise<RemoteMachine | undefined> {
  const known = knownRemoteMachine(environmentId);
  if (known || machinesLoaded) return known;
  const value = await invoke<RemoteMachine[]>("remote_machines");
  cachedMachines = Array.isArray(value) ? value : [];
  machinesLoaded = true;
  return knownRemoteMachine(environmentId);
}

export async function connectMachine(
  name: string,
  url: string,
  token: string,
): Promise<RemoteMachine> {
  const machine = await invoke<RemoteMachine>("remote_connect", {
    name,
    url,
    token,
  });
  cachedMachines = [
    ...cachedMachines.filter((entry) => entry.id !== machine.id),
    machine,
  ];
  invalidateRemoteCapabilities(machine.environmentId);
  machinesLoaded = true;
  window.dispatchEvent(new Event(CHANGE));
  return machine;
}

/** Saves a machine's new name or SSH address. Its id and environment id stay,
 * so every project on it keeps working. When the way in changed, the desktop
 * closes the old tunnel and the machine's connection status starts over. */
export async function updateMachine(
  machine: RemoteMachine,
  edit: {
    name: string;
    target: string;
    port: number | null;
    alternate?: string | null;
  },
  reconnect: boolean,
): Promise<RemoteMachine> {
  const saved = await invoke<RemoteMachine>("remote_machine_update", {
    machineId: machine.id,
    name: edit.name,
    target: edit.target,
    port: edit.port,
    alternate: edit.alternate ?? null,
  });
  cachedMachines = cachedMachines.map((entry) =>
    entry.id === saved.id ? saved : entry,
  );
  invalidateRemoteCapabilities(saved.environmentId);
  if (reconnect) {
    machineOnline.delete(saved.id);
    resetRemoteConnection(saved.environmentId);
  }
  window.dispatchEvent(new Event(CHANGE));
  return saved;
}

export async function disconnectMachine(machineId: string): Promise<void> {
  await invoke("remote_disconnect", { machineId });
  const environmentId = cachedMachines.find(
    (entry) => entry.id === machineId,
  )?.environmentId;
  if (environmentId) invalidateRemoteCapabilities(environmentId);
  cachedMachines = cachedMachines.filter((entry) => entry.id !== machineId);
  window.dispatchEvent(new Event(CHANGE));
}

export function useRemoteMachines(enabled = true): {
  machines: RemoteMachine[];
  loaded: boolean;
} {
  const [state, setState] = useState<{
    machines: RemoteMachine[];
    loaded: boolean;
  }>({ machines: cachedMachines, loaded: machinesLoaded });
  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    const refresh = () => {
      void invoke<RemoteMachine[]>("remote_machines")
        .then((value) => {
          if (!disposed) {
            cachedMachines = Array.isArray(value) ? value : [];
            machinesLoaded = true;
            setState({
              machines: cachedMachines,
              loaded: true,
            });
          }
        })
        .catch(() => {
          // A temporary connection failure should not blank every remote
          // panel while a fresh machine list is requested.
          if (!disposed) setState({ machines: cachedMachines, loaded: true });
        });
    };
    refresh();
    window.addEventListener(CHANGE, refresh);
    return () => {
      disposed = true;
      window.removeEventListener(CHANGE, refresh);
    };
  }, [enabled]);
  return state;
}

const STATUS = "monocode:remote-machine-status";
const machineOnline = new Map<string, boolean>();
const statusWatchers = new Map<
  string,
  { count: number; timer?: ReturnType<typeof setTimeout> }
>();

/** Records whether a machine answered its latest request, for every view
 * that shows its connection state. `error` is why it did not. */
export function reportRemoteMachineStatus(
  machineId: string,
  online: boolean,
  error?: unknown,
) {
  const environmentId = cachedMachines.find(
    (entry) => entry.id === machineId,
  )?.environmentId;
  if (environmentId)
    recordRemoteConnection(
      environmentId,
      online ? undefined : (error ?? "Machine is unreachable"),
    );
  const wasOffline = machineOnline.get(machineId) === false;
  if (machineOnline.get(machineId) === online) return;
  machineOnline.set(machineId, online);
  window.dispatchEvent(new Event(STATUS));
  // Views that gave up on this machine reload as soon as it answers again.
  if (online && wasOffline) {
    if (environmentId) invalidateRemoteCapabilities(environmentId);
    notifyRemoteRecovered(environmentId);
  }
}

function watchMachineStatus(machineId: string): () => void {
  const existing = statusWatchers.get(machineId);
  if (existing) {
    existing.count++;
  } else {
    const watcher: { count: number; timer?: ReturnType<typeof setTimeout> } = {
      count: 1,
    };
    statusWatchers.set(machineId, watcher);
    let failures = 0;
    const poll = async () => {
      try {
        const host = await remoteRequest<{
          environmentId?: string;
          capabilities?: unknown;
        }>(machineId, "environment.describe");
        if (host?.environmentId)
          recordRemoteCapabilities(host.environmentId, host.capabilities);
        failures = 0;
        reportRemoteMachineStatus(machineId, true);
      } catch (reason) {
        failures = Math.min(4, failures + 1);
        reportRemoteMachineStatus(machineId, false, reason);
      }
      if (statusWatchers.get(machineId) === watcher)
        watcher.timer = setTimeout(
          () => void poll(),
          failures ? remoteBackoffDelay(failures) : 15_000,
        );
    };
    void poll();
  }
  return () => {
    const watcher = statusWatchers.get(machineId);
    if (!watcher || --watcher.count > 0) return;
    clearTimeout(watcher.timer);
    statusWatchers.delete(machineId);
  };
}

/** Whether a machine is reachable; undefined until the first check returns. */
export function useRemoteMachineOnline(
  machineId?: string,
): boolean | undefined {
  const [online, setOnline] = useState(() =>
    machineId ? machineOnline.get(machineId) : undefined,
  );
  useEffect(() => {
    if (!machineId) {
      setOnline(undefined);
      return;
    }
    const update = () => setOnline(machineOnline.get(machineId));
    update();
    window.addEventListener(STATUS, update);
    const unwatch = watchMachineStatus(machineId);
    return () => {
      window.removeEventListener(STATUS, update);
      unwatch();
    };
  }, [machineId]);
  return online;
}

const historyKey = (project: string) => `monocode.remote-history.v2:${project}`;

function cachedSessions(project: string): HostSessionSummary[] {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(historyKey(project)) ?? "[]",
    );
    return Array.isArray(value) ? (value as HostSessionSummary[]) : [];
  } catch {
    return [];
  }
}
export function cachedRemoteSessionSummary(project: string, sessionId: string) {
  return cachedSessions(project).find((session) => session.id === sessionId);
}

/** The last `sessions.list` answer per remote project, so the rail and the
 * open project's sidebar share one request instead of each asking. */
const sharedSessionLists = new RemoteSessionLists(
  (machineId, projectId, known) =>
    remoteRequest<SessionListReply>(machineId, "sessions.list", {
      projectId,
      known,
    }),
);
if (typeof window !== "undefined") {
  window.addEventListener(REMOTE_HISTORY_CHANGE, () =>
    sharedSessionLists.invalidate(),
  );
  window.addEventListener(CHANGE, () => sharedSessionLists.invalidate());
}

export type RemoteProjectSessions = {
  /** Undefined when this machine is not connected on this computer. */
  machine?: RemoteMachine;
  sessions: HostSessionSummary[];
  loaded: boolean;
  /** Whether the list of machines has been read: until then `machine` is
   * undefined because it is not known yet, not because it is missing. */
  machinesLoaded: boolean;
  /** The machine did not answer and no list has arrived yet. */
  failed: boolean;
};

/** Lists a remote project's host sessions, keeping the last list visible
 * while the machine is unreachable. */
export function useRemoteProjectSessions(
  project: string,
  enabled = true,
): RemoteProjectSessions {
  const remote = enabled ? remoteProjectFor(project) : undefined;
  const { machines, loaded: machinesLoaded } = useRemoteMachines(!!remote);
  const machine = remote
    ? machines.find((entry) => entry.environmentId === remote.environmentId)
    : undefined;
  const [sessions, setSessions] = useState<HostSessionSummary[]>(() =>
    remote ? cachedSessions(project) : [],
  );
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (!remote) return;
    const changed = () => setRefresh((value) => value + 1);
    window.addEventListener(REMOTE_HISTORY_CHANGE, changed);
    return () => window.removeEventListener(REMOTE_HISTORY_CHANGE, changed);
  }, [!!remote]);
  useEffect(() => {
    setSessions(remote ? cachedSessions(project) : []);
    setLoaded(false);
    setFailed(false);
    if (!remote || !machine) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    const poll = async () => {
      try {
        const next = await sharedSessionLists.load(
          machine.id,
          remote.projectId,
        );
        if (disposed) return;
        failures = 0;
        setSessions(next);
        setLoaded(true);
        setFailed(false);
        try {
          const serialized = JSON.stringify(next);
          if (localStorage.getItem(historyKey(project)) !== serialized) {
            localStorage.setItem(historyKey(project), serialized);
            window.dispatchEvent(new Event(REMOTE_HISTORY_UPDATED));
          }
        } catch {
          /* the list is refetched next time */
        }
      } catch {
        // Keep the cached list and back off while SSH is unavailable.
        failures = Math.min(4, failures + 1);
        if (!disposed) setFailed(true);
      }
      if (!disposed)
        timer = setTimeout(
          () => void poll(),
          failures ? remoteBackoffDelay(failures) : 3_000,
        );
    };
    void poll();
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [project, remote?.projectId, machine?.id, refresh]);
  return { machine, sessions, loaded, machinesLoaded, failed };
}

/** Lists the host sessions of every remote project on the rail, so one that
 * runs on its machine shows up without its project being opened here. A
 * project whose machine does not answer keeps its last list. */
export function useRemoteRailSessions(
  projects: readonly string[],
): RemoteRailSession[] {
  const key = projects.join("\n");
  const { machines } = useRemoteMachines(projects.length > 0);
  const [sessions, setSessions] = useState<RemoteRailSession[]>([]);
  useEffect(() => {
    const targets = (key ? key.split("\n") : []).flatMap((project) => {
      const remote = remoteProjectFor(project);
      const machine =
        remote &&
        machines.find((entry) => entry.environmentId === remote.environmentId);
      return remote && machine ? [{ project, remote, machine }] : [];
    });
    if (targets.length === 0) {
      setSessions([]);
      return;
    }
    // The cached list may be old: nothing in it counts as running until the host says so.
    const lists = new Map<
      string,
      { list: HostSessionSummary[]; fresh: boolean }
    >(
      targets.map(({ project }) => [
        project,
        {
          list: cachedSessions(project).map((session) => ({
            ...session,
            status: "idle" as const,
            needsInput: false,
          })),
          fresh: false,
        },
      ]),
    );
    let shown = "";
    const publish = () => {
      const next = [...lists].flatMap(([project, { list, fresh }]) =>
        list.map((session) => ({ project, session, fresh })),
      );
      const serialized = JSON.stringify(next);
      if (serialized === shown) return;
      shown = serialized;
      setSessions(next);
    };
    publish();
    // Each target is polled on its own schedule and published as it answers;
    // the open project's sidebar lists it every few seconds already.
    return startRailPoller({
      targets,
      load: ({ machine, remote }) =>
        sharedSessionLists.load(machine.id, remote.projectId),
      onResult: ({ project }, next) => {
        lists.set(project, { list: next, fresh: true });
        const stored = JSON.stringify(next);
        try {
          if (localStorage.getItem(historyKey(project)) !== stored) {
            localStorage.setItem(historyKey(project), stored);
            window.dispatchEvent(new Event(REMOTE_HISTORY_UPDATED));
          }
        } catch {
          /* the list is refetched next time */
        }
        publish();
      },
    });
  }, [key, machines]);
  return sessions;
}
