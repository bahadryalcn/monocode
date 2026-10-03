import type { Session } from "../../sessions/model/session";
import type { HostSession } from "./protocol";
import { canonicalJson } from "../../sync/model/canonicalJson";

/** A host session adopted from this machine's desktop app (`sessions.adopted`). */
export type AdoptedEntry = {
  id: string;
  projectId: string;
  revision: number;
  updatedAt: number;
  status: "idle" | "running" | "interrupted";
};

export const ADOPTED_CAPABILITY = "sessions.desktop";
/** Fired with the project folder when a session started on this machine's
 * host from another computer is first saved here. */
export const ADOPTED_SESSION_ADDED = "monocode:adopted-session-added";

/** The desktop copy of a session the host started: the project folder as the
 * session's place, and the host's working copy as its worktree when different. */
export function desktopCopyOf(
  host: HostSession,
  projectCwd: string,
  same: (a: string, b: string) => boolean,
): Session {
  const remote = host.session;
  const workCwd = remote.worktreeCwd || remote.cwd;
  const { busy: _busy, pendingQuestion: _question, ...rest } = remote;
  return {
    ...rest,
    cwd: projectCwd,
    worktreeCwd: workCwd && !same(workCwd, projectCwd) ? workCwd : undefined,
    title: remote.title || "Session",
    continuingElsewhere: host.status === "running" || undefined,
  };
}
export const ADOPTED_RUNNING_REASON =
  "This session is continuing from another computer. Wait for it to finish.";
export const ADOPTED_CONFLICT_MESSAGE =
  "This conversation changed here and on the host. Your local copy was kept. Open the host conversation in Connections to compare the changes.";
export const ADOPTED_POLL_VISIBLE_MS = 5_000;
export const ADOPTED_POLL_HIDDEN_MS = 20_000;

export function supportsAdoptedSessions(
  capabilities: string[] | undefined,
): boolean {
  return !!capabilities?.includes(ADOPTED_CAPABILITY);
}

/** Entries worth fetching: a loaded, idle local copy whose host revision moved. */
export function planAdoptedFetches(
  entries: readonly AdoptedEntry[],
  local: readonly Session[],
  mirrored: ReadonlyMap<string, number>,
): AdoptedEntry[] {
  const byId = new Map(local.map((session) => [session.id, session]));
  return entries.filter((entry) => {
    const session = byId.get(entry.id);
    return (
      !!session && !session.busy && mirrored.get(entry.id) !== entry.revision
    );
  });
}

/** The host copy's transcript laid over the local session. Identity (id, cwd,
 * worktree, harness, account) stays local. A shared baseline permits a host
 * reset/rewind; first contact only permits an identical local prefix. */
function transcript(session: Session): string {
  return canonicalJson(
    session.blocks.map((block) => ({
      ...block,
      attachments: block.attachments?.map(
        ({ data: _data, previewUrl: _preview, ...file }) => file,
      ),
    })),
  );
}

export function mergeAdoptedSession(
  local: Session,
  host: HostSession,
  base?: Session,
): Session | undefined {
  const remote = host.session;
  if (transcript(local) !== transcript(remote)) {
    if (base) {
      // The host may legitimately reset/rewind. Only accept it if the local
      // transcript hasn't changed since our last successful merge.
      if (transcript(local) !== transcript(base)) return undefined;
    } else {
      // On first contact there is no shared ancestor. An identical prefix is
      // safe; block count alone doesn't prove the local text is unchanged.
      if (
        remote.blocks.length < local.blocks.length ||
        transcript(local) !==
          transcript({
            ...remote,
            blocks: remote.blocks.slice(0, local.blocks.length),
          })
      )
        return undefined;
    }
  }
  const fromHost = <K extends keyof Session>(key: K): Session[K] =>
    base && canonicalJson(local[key]) !== canonicalJson(base[key])
      ? local[key]
      : remote[key];
  return {
    ...local,
    blocks: remote.blocks,
    title: fromHost("title") || local.title,
    model: fromHost("model") || local.model,
    modelSettings: fromHost("modelSettings") ?? local.modelSettings,
    runtimeMode: fromHost("runtimeMode") ?? local.runtimeMode,
    ...(remote.providerSessionId
      ? { providerSessionId: remote.providerSessionId }
      : {}),
    ...(remote.context ? { context: remote.context } : {}),
    continuingElsewhere: host.status === "running" || undefined,
    adoptedSyncConflict: undefined,
  };
}

export type AdoptedMirrorDeps = {
  list: () => Promise<AdoptedEntry[]>;
  load: (sessionId: string) => Promise<HostSession>;
  local: () => readonly Session[];
  /** Replaces the local session; `previous` is the copy it was merged from. */
  apply: (merged: Session, previous: Session) => void;
  mirrored: Map<string, number>;
  /** The stored copy of a session no tab has loaded. */
  stored?: (sessionId: string) => Promise<Session | null>;
  /** Writes a merged copy of a session no tab has loaded. */
  save?: (merged: Session) => Promise<void>;
  /** A session this desktop has never had: one started on the host from
   * another computer. Saves a copy when its project is on this desktop. */
  adopt?: (entry: AdoptedEntry) => Promise<void | boolean>;
  conflict?: (local: Session) => void;
};

/** Sessions known to have a stored copy, per mirror, so a running one is not
 * read from storage again on every pass. */
const storedHere = new WeakMap<Map<string, number>, Set<string>>();
const baselines = new WeakMap<Map<string, number>, Map<string, Session>>();

/** One mirror pass. Returns the ids the host is still running, so the caller
 * can hold local sending for them. */
export async function mirrorAdoptedSessions(
  deps: AdoptedMirrorDeps,
): Promise<Set<string>> {
  const entries = await deps.list();
  let base = baselines.get(deps.mirrored);
  if (!base) baselines.set(deps.mirrored, (base = new Map()));
  const liveIds = new Set(entries.map((entry) => entry.id));
  for (const id of base.keys()) if (!liveIds.has(id)) base.delete(id);
  const running = new Set(
    entries.filter((entry) => entry.status === "running").map((e) => e.id),
  );
  for (const entry of planAdoptedFetches(
    entries,
    deps.local(),
    deps.mirrored,
  )) {
    try {
      const before = deps.local().find((session) => session.id === entry.id);
      const host = await deps.load(entry.id);
      // A local turn may have started while the snapshot was in flight.
      const current = deps.local().find((session) => session.id === entry.id);
      if (!current || current.busy) continue;
      if (before && transcript(before) !== transcript(current)) {
        deps.conflict?.(current);
        continue;
      }
      const merged = mergeAdoptedSession(current, host, base.get(entry.id));
      if (!merged) {
        deps.conflict?.(current);
        continue;
      }
      deps.apply(merged, current);
      base.set(entry.id, merged);
      deps.mirrored.set(entry.id, host.revision);
    } catch {
      // Retried on the next pass.
    }
  }
  // Closed sessions are caught up in storage, so history shows the host copy
  // and opening one later starts from it.
  if (deps.stored && deps.save) {
    const loaded = new Set(deps.local().map((session) => session.id));
    let present = storedHere.get(deps.mirrored);
    if (!present) storedHere.set(deps.mirrored, (present = new Set()));
    for (const entry of entries) {
      if (
        loaded.has(entry.id) ||
        deps.mirrored.get(entry.id) === entry.revision
      )
        continue;
      // A running session already stored here waits for its turn to end.
      if (entry.status === "running" && present.has(entry.id)) continue;
      try {
        const stored = await deps.stored(entry.id);
        if (stored) present.add(entry.id);
        if (!stored) {
          // New to this desktop: listed at once, even mid-turn, so the work
          // started elsewhere shows up here while it runs.
          if (!deps.adopt || (await deps.adopt(entry)) === false) continue;
          deps.mirrored.set(entry.id, entry.revision);
          continue;
        }
        // A copy the host is still writing is caught up once the turn ends.
        if (entry.status === "running") continue;
        if (!deps.local().some((session) => session.id === entry.id)) {
          const host = await deps.load(entry.id);
          // Storage can change while a remote snapshot is in flight too.
          const current = await deps.stored(entry.id);
          if (
            !current ||
            transcript(current) !== transcript(stored) ||
            deps.local().some((session) => session.id === entry.id)
          )
            continue;
          const merged = mergeAdoptedSession(current, host, base.get(entry.id));
          if (!merged) {
            deps.conflict?.(current);
            continue;
          }
          await deps.save({ ...merged, continuingElsewhere: undefined });
          base.set(entry.id, merged);
          deps.mirrored.set(entry.id, host.revision);
          continue;
        }
        deps.mirrored.set(entry.id, entry.revision);
      } catch {
        // Retried on the next pass.
      }
    }
  }
  // Sessions already mirrored at this revision still need the hold flag.
  return running;
}
