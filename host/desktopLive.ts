import { randomUUID } from "node:crypto";
import type { Block, Session } from "../src/features/sessions/model/session";
import type { HostCommand } from "../src/features/connections/model/protocol";

/** Past this without a heartbeat, the desktop app is gone (closed or crashed)
 * and none of its sessions is running. */
export const DESKTOP_BEAT_STALE_MS = 20_000;
const MAX_PENDING_BLOCKS = 50;
const MAX_COMMANDS = 100;

export type DesktopCommand = {
  id: string;
  sessionId: string;
  type: "cancel" | "approve" | "answer";
  requestId?: number;
  decision?: "allow" | "deny";
  reply?: unknown;
};

type LiveSession = {
  clientId: string;
  busy: boolean;
  pending: Block[];
  patch: Partial<Session>;
  /** When `pending`/`patch` last changed: part of the watchers' revision. */
  changedAt: number;
  fingerprint: string;
};

/**
 * What the desktop app on this machine reports about its running sessions,
 * and the commands watchers on other computers left for it. The desktop
 * calls in (`sessions.desktopLive`); the host can't reach it otherwise.
 */
export class DesktopLive {
  private clients = new Map<string, number>();
  private sessions = new Map<string, LiveSession>();
  private commands: DesktopCommand[] = [];

  private lastChange = 0;

  constructor(private readonly now: () => number = Date.now) {}

  /** Strictly increasing, so two changes in one millisecond still differ. */
  private changeStamp(): number {
    this.lastChange = Math.max(this.now(), this.lastChange + 1);
    return this.lastChange;
  }

  beat(input: unknown): { commands: DesktopCommand[] } {
    const value =
      input && typeof input === "object" && !Array.isArray(input)
        ? (input as Record<string, unknown>)
        : {};
    if (!Array.isArray(value.sessions))
      throw new Error("Invalid desktop sessions");
    const clientId =
      typeof value.clientId === "string" && value.clientId
        ? value.clientId
        : "legacy";
    const acked = new Set(
      Array.isArray(value.acked) ? value.acked.map(String) : [],
    );
    const next = new Map(this.sessions);
    const reported = new Set<string>();
    for (const raw of value.sessions) {
      if (!raw || typeof raw !== "object") continue;
      const entry = raw as Record<string, unknown>;
      if (typeof entry.id !== "string" || !entry.id) continue;
      const owner = this.sessions.get(entry.id);
      // Another live window owns this turn. An idle copy of its tab cannot
      // take over command delivery; a crashed owner can be replaced.
      if (
        owner &&
        owner.clientId !== clientId &&
        (owner.busy || owner.fingerprint !== "[[],{}]") &&
        this.clientAlive(owner.clientId)
      )
        continue;
      reported.add(entry.id);
      const pending = Array.isArray(entry.pending)
        ? (entry.pending as Block[])
            .filter((block) => block && typeof block.id === "string")
            .slice(0, MAX_PENDING_BLOCKS)
        : [];
      const patch =
        entry.patch &&
        typeof entry.patch === "object" &&
        !Array.isArray(entry.patch)
          ? livePatch(entry.patch as Partial<Session>)
          : {};
      const fingerprint = JSON.stringify([pending, patch]);
      const previous = this.sessions.get(entry.id);
      next.set(entry.id, {
        clientId,
        busy: entry.busy === true,
        pending,
        patch,
        fingerprint,
        changedAt:
          previous && previous.fingerprint === fingerprint
            ? previous.changedAt
            : this.changeStamp(),
      });
    }
    // A session that just went idle changed too: its prompt is gone.
    for (const [id, previous] of this.sessions)
      if (
        previous.clientId === clientId &&
        !reported.has(id) &&
        (previous.busy || previous.fingerprint !== "[[],{}]")
      )
        next.set(id, {
          clientId,
          busy: false,
          pending: [],
          patch: {},
          fingerprint: "[[],{}]",
          changedAt: this.changeStamp(),
        });
    this.sessions = next;
    // ACKs are scoped to the owner too, including retries sent by old clients.
    this.commands = this.commands.filter(
      (command) =>
        !acked.has(command.id) ||
        this.sessions.get(command.sessionId)?.clientId !== clientId,
    );
    this.clients.set(clientId, this.now());
    for (const [id, beatAt] of this.clients) {
      if (this.now() - beatAt <= DESKTOP_BEAT_STALE_MS) continue;
      this.clients.delete(id);
      for (const [sessionId, session] of this.sessions)
        if (session.clientId === id) this.sessions.delete(sessionId);
    }
    return {
      commands: this.commands.filter(
        (command) =>
          this.sessions.get(command.sessionId)?.clientId === clientId,
      ),
    };
  }

  private clientAlive(clientId: string): boolean {
    const beatAt = this.clients.get(clientId);
    return beatAt !== undefined && this.now() - beatAt <= DESKTOP_BEAT_STALE_MS;
  }

  /** Whether the desktop reports itself alive; undefined if it never has
   * (an older app: fall back to what its database says). */
  alive(): boolean | undefined {
    if (this.clients.size === 0) return undefined;
    return [...this.clients.keys()].some((id) => this.clientAlive(id));
  }

  /** Running per the heartbeat; `stored` is the database's in-flight mark,
   * only trusted from an app that doesn't send heartbeats. */
  running(id: string, stored: boolean): boolean {
    const alive = this.alive();
    if (alive === undefined) return stored;
    const session = this.sessions.get(id);
    return alive && !!session?.busy && this.clientAlive(session.clientId);
  }

  /** Live prompts laid over a stored session, and when they last changed. */
  overlay(
    id: string,
  ):
    | { pending: Block[]; patch: Partial<Session>; changedAt: number }
    | undefined {
    const session = this.sessions.get(id);
    return session && this.clientAlive(session.clientId) ? session : undefined;
  }

  /** Leaves a watcher's stop, approval or answer for the desktop to run. */
  enqueue(
    command: Extract<HostCommand, { type: "cancel" | "approve" | "answer" }>,
  ): void {
    if (this.commands.length >= MAX_COMMANDS)
      throw new Error(
        "Too many commands waiting for the MonoCode app on that computer",
      );
    this.commands.push({
      id: randomUUID(),
      sessionId: command.sessionId,
      type: command.type,
      ...(command.type === "approve"
        ? { requestId: command.requestId, decision: command.decision }
        : {}),
      ...(command.type === "answer"
        ? { requestId: command.requestId, reply: command.reply }
        : {}),
    });
  }
}

/** Only presentation fields: identity and transcript stay the stored copy's. */
function livePatch(patch: Partial<Session>): Partial<Session> {
  const {
    id: _id,
    cwd: _cwd,
    harness: _harness,
    blocks: _blocks,
    providerSessionId: _provider,
    worktreeCwd: _worktree,
    ...rest
  } = patch;
  return rest;
}

/** The stored session with the desktop's live prompts merged in. */
export function withOverlay(
  session: Session,
  overlay: { pending: Block[]; patch: Partial<Session> } | undefined,
): Session {
  if (
    !overlay ||
    (!overlay.pending.length && !Object.keys(overlay.patch).length)
  )
    return session;
  const pending = new Map(overlay.pending.map((block) => [block.id, block]));
  const blocks = session.blocks.map((block) => {
    const live = pending.get(block.id);
    if (!live) return block;
    pending.delete(block.id);
    return live;
  });
  return {
    ...session,
    ...overlay.patch,
    blocks: [...blocks, ...pending.values()],
  };
}
