import type { Block, Session } from "../../sessions/model/session";
import type { UserQuestionReply } from "../../sessions/model/userQuestion";

export const DESKTOP_LIVE_CAPABILITY = "sessions.desktopLive";
export const DESKTOP_LIVE_MS = 1_500;
/** While nothing is busy or waiting and nothing is left to acknowledge, an
 * empty heartbeat is repeated this rarely. It must stay well under the host's
 * 20 s stale threshold (DESKTOP_BEAT_STALE_MS), and a remote Stop/Approve/Answer
 * only exists for a busy or waiting session, so it never waits on this. */
export const DESKTOP_LIVE_IDLE_MS = 5_000;

export function supportsDesktopLive(capabilities: string[] | undefined): boolean {
  return !!capabilities?.includes(DESKTOP_LIVE_CAPABILITY);
}

export type DesktopLiveSession = {
  id: string;
  busy: boolean;
  pending?: Block[];
  patch?: Partial<Session>;
};

export type DesktopLivePayload = {
  clientId?: string;
  sessions: DesktopLiveSession[];
  acked?: string[];
};

export type DesktopLiveCommand = {
  id: string;
  sessionId: string;
  type: "cancel" | "approve" | "answer";
  requestId?: number;
  decision?: "allow" | "deny";
  reply?: UserQuestionReply;
};

export type DesktopLiveHandlers = {
  stop: (sessionId: string) => void;
  approve: (sessionId: string, requestId: number, decision: "allow" | "deny") => void;
  answer: (sessionId: string, requestId: number, reply: UserQuestionReply) => void;
};

/** Drops functions/undefined so the value survives the JSON bridge. */
function jsonSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function undecidedApprovals(session: Session): Block[] {
  return session.blocks.filter((block) => block.approval && !block.approval.decided);
}

/** The heartbeat entry per session object (null: nothing to report). A session
 * keeps its identity while unchanged, so only changed ones are scanned again. */
const entryBySession = new WeakMap<Session, DesktopLiveSession | null>();
let lastSessions: readonly Session[] | undefined;
let lastEntries: DesktopLiveSession[] = [];

function desktopLiveEntry(session: Session): DesktopLiveSession | null {
  if (session.worktreeRemoved) return null;
  const approvals = undecidedApprovals(session);
  const question = session.pendingQuestion;
  const busy = !!session.busy;
  if (!busy && approvals.length === 0 && !question) return null;
  const entry: DesktopLiveSession = { id: session.id, busy };
  if (approvals.length > 0) entry.pending = jsonSafe(approvals);
  if (question) entry.patch = jsonSafe({ pendingQuestion: question });
  return entry;
}

/** Every busy session, or one waiting on an approval/question. The pending
 * approval blocks and the live question prompt are what persistence drops. */
export function buildDesktopLiveSessions(sessions: readonly Session[]): DesktopLiveSession[] {
  if (sessions === lastSessions) return lastEntries;
  const out: DesktopLiveSession[] = [];
  for (const session of sessions) {
    let entry = entryBySession.get(session);
    if (entry === undefined) {
      entry = desktopLiveEntry(session);
      entryBySession.set(session, entry);
    }
    if (entry) out.push(entry);
  }
  lastSessions = sessions;
  lastEntries = out;
  return out;
}

/** Runs a watcher's command through the local UI handlers. Stale commands
 * (nothing busy/pending anymore, or another request id) are dropped. */
export function applyDesktopLiveCommand(
  command: DesktopLiveCommand,
  sessions: readonly Session[],
  handlers: DesktopLiveHandlers,
): boolean {
  const session = sessions.find((candidate) => candidate.id === command.sessionId);
  if (!session || session.worktreeRemoved) return false;
  const id = command.requestId;
  if (command.type === "cancel") {
    if (!session.busy) return false;
    handlers.stop(session.id);
    return true;
  }
  if (id === undefined || id === null || !Number.isFinite(Number(id))) return false;
  const requestId = Number(id);
  if (command.type === "approve") {
    if (command.decision !== "allow" && command.decision !== "deny") return false;
    const pending = undecidedApprovals(session).some(
      (block) => String(block.approval?.requestId) === String(requestId),
    );
    if (!pending) return false;
    handlers.approve(session.id, requestId, command.decision);
    return true;
  }
  if (command.type === "answer") {
    if (!command.reply) return false;
    if (String(session.pendingQuestion?.requestId) !== String(requestId)) return false;
    handlers.answer(session.id, requestId, command.reply);
    return true;
  }
  return false;
}

/** When the last heartbeat was sent and whether it reported nothing. */
export type DesktopLiveBeat = { idleAt?: number };

/** One exchange with the host: report live sessions plus what was handled
 * since last time, then execute the commands it returns. `unacked` keeps ids
 * until a call succeeds; `handled` dedupes re-sent commands. With a `beat`,
 * an empty heartbeat is not repeated before DESKTOP_LIVE_IDLE_MS. */
export async function runDesktopLiveTick(deps: {
  beat?: DesktopLiveBeat;
  now?: () => number;
  clientId?: string;
  request: (payload: DesktopLivePayload) => Promise<{ commands?: DesktopLiveCommand[] } | undefined>;
  sessions: () => readonly Session[];
  handlers: DesktopLiveHandlers;
  unacked: Set<string>;
  handled: Set<string>;
}): Promise<void> {
  const acked = [...deps.unacked];
  const now = deps.now ?? Date.now;
  const live = buildDesktopLiveSessions(deps.sessions());
  const idle = live.length === 0 && acked.length === 0;
  // Anything busy, waiting or unacknowledged goes out on every tick, so a
  // session that starts running is reported within one DESKTOP_LIVE_MS.
  if (
    idle &&
    deps.beat?.idleAt !== undefined &&
    now() - deps.beat.idleAt < DESKTOP_LIVE_IDLE_MS
  )
    return;
  const payload: DesktopLivePayload = {
    ...(deps.clientId ? { clientId: deps.clientId } : {}),
    sessions: live,
    ...(acked.length > 0 ? { acked } : {}),
  };
  const result = await deps.request(payload);
  if (deps.beat) deps.beat.idleAt = idle ? now() : undefined;
  for (const id of acked) deps.unacked.delete(id);
  const commands = Array.isArray(result?.commands) ? result.commands : [];
  for (const command of commands) {
    if (!command || typeof command.id !== "string") continue;
    // Older hosts return all windows' commands. Never acknowledge a session
    // this window doesn't have, or it will disappear before its owner sees it.
    if (!deps.sessions().some((session) => session.id === command.sessionId))
      continue;
    if (deps.handled.has(command.id)) {
      deps.unacked.add(command.id);
      continue;
    }
    try {
      applyDesktopLiveCommand(command, deps.sessions(), deps.handlers);
    } catch (error) {
      console.error(error);
      continue; // Keep the command pending if its handler failed.
    }
    deps.handled.add(command.id);
    // Bound the dedupe set; insertion order makes the oldest go first.
    if (deps.handled.size > 500) {
      const oldest = deps.handled.values().next().value;
      if (oldest !== undefined) deps.handled.delete(oldest);
    }
    deps.unacked.add(command.id);
  }
}
