import type { Session } from "../../sessions/model/session";
import type { HostSession } from "./protocol";

/** A host session adopted from this machine's desktop app (`sessions.adopted`). */
export type AdoptedEntry = {
  id: string;
  projectId: string;
  revision: number;
  updatedAt: number;
  status: "idle" | "running" | "interrupted";
};

export const ADOPTED_CAPABILITY = "sessions.desktop";
export const ADOPTED_RUNNING_REASON =
  "This session is continuing from another computer. Wait for it to finish.";
export const ADOPTED_POLL_VISIBLE_MS = 5_000;
export const ADOPTED_POLL_HIDDEN_MS = 20_000;

export function supportsAdoptedSessions(capabilities: string[] | undefined): boolean {
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
    return !!session && !session.busy && mirrored.get(entry.id) !== entry.revision;
  });
}

/** The host copy's transcript laid over the local session. Identity (id, cwd,
 * worktree, harness, account) stays local. Undefined when the host copy has
 * fewer blocks than the local one: the host pulls newer desktop turns back
 * itself, and replacing would drop them. */
export function mergeAdoptedSession(local: Session, host: HostSession): Session | undefined {
  const remote = host.session;
  if (remote.blocks.length < local.blocks.length) return undefined;
  return {
    ...local,
    blocks: remote.blocks,
    title: remote.title || local.title,
    model: remote.model || local.model,
    modelSettings: remote.modelSettings ?? local.modelSettings,
    runtimeMode: remote.runtimeMode ?? local.runtimeMode,
    ...(remote.providerSessionId ? { providerSessionId: remote.providerSessionId } : {}),
    ...(remote.context ? { context: remote.context } : {}),
    continuingElsewhere: host.status === "running" || undefined,
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
};

/** One mirror pass. Returns the ids the host is still running, so the caller
 * can hold local sending for them. */
export async function mirrorAdoptedSessions(deps: AdoptedMirrorDeps): Promise<Set<string>> {
  const entries = await deps.list();
  const running = new Set(entries.filter((entry) => entry.status === "running").map((e) => e.id));
  for (const entry of planAdoptedFetches(entries, deps.local(), deps.mirrored)) {
    try {
      const host = await deps.load(entry.id);
      // A local turn may have started while the snapshot was in flight.
      const current = deps.local().find((session) => session.id === entry.id);
      if (!current || current.busy) continue;
      const merged = mergeAdoptedSession(current, host);
      if (merged) deps.apply(merged, current);
      deps.mirrored.set(entry.id, entry.revision);
    } catch {
      // Retried on the next pass.
    }
  }
  // Closed sessions are caught up in storage, so history shows the host copy
  // and opening one later starts from it.
  if (deps.stored && deps.save) {
    const loaded = new Set(deps.local().map((session) => session.id));
    for (const entry of entries) {
      if (
        loaded.has(entry.id) ||
        entry.status === "running" ||
        deps.mirrored.get(entry.id) === entry.revision
      )
        continue;
      try {
        const stored = await deps.stored(entry.id);
        if (stored && !deps.local().some((session) => session.id === entry.id)) {
          const merged = mergeAdoptedSession(stored, await deps.load(entry.id));
          if (merged) await deps.save({ ...merged, continuingElsewhere: undefined });
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
