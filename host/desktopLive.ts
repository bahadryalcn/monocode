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
  private beatAt: number | undefined;
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
    if (!Array.isArray(value.sessions)) throw new Error("Invalid desktop sessions");
    const acked = new Set(
      Array.isArray(value.acked) ? value.acked.map(String) : [],
    );
    const next = new Map<string, LiveSession>();
    for (const raw of value.sessions) {
      if (!raw || typeof raw !== "object") continue;
      const entry = raw as Record<string, unknown>;
      if (typeof entry.id !== "string" || !entry.id) continue;
      const pending = Array.isArray(entry.pending)
        ? (entry.pending as Block[])
            .filter((block) => block && typeof block.id === "string")
            .slice(0, MAX_PENDING_BLOCKS)
        : [];
      const patch =
        entry.patch && typeof entry.patch === "object" && !Array.isArray(entry.patch)
          ? livePatch(entry.patch as Partial<Session>)
          : {};
      const fingerprint = JSON.stringify([pending, patch]);
      const previous = this.sessions.get(entry.id);
      next.set(entry.id, {
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
      if (!next.has(id) && previous.fingerprint !== "[[],{}]")
        next.set(id, {
          busy: false,
          pending: [],
          patch: {},
          fingerprint: "[[],{}]",
          changedAt: this.changeStamp(),
        });
    this.sessions = next;
    this.beatAt = this.now();
    this.commands = this.commands.filter((command) => !acked.has(command.id));
    return { commands: this.commands };
  }

  /** Whether the desktop reports itself alive; undefined if it never has
   * (an older app: fall back to what its database says). */
  alive(): boolean | undefined {
    if (this.beatAt === undefined) return undefined;
    return this.now() - this.beatAt <= DESKTOP_BEAT_STALE_MS;
  }

  /** Running per the heartbeat; `stored` is the database's in-flight mark,
   * only trusted from an app that doesn't send heartbeats. */
  running(id: string, stored: boolean): boolean {
    const alive = this.alive();
    if (alive === undefined) return stored;
    return alive && !!this.sessions.get(id)?.busy;
  }

  /** Live prompts laid over a stored session, and when they last changed. */
  overlay(id: string): { pending: Block[]; patch: Partial<Session>; changedAt: number } | undefined {
    if (!this.alive()) return undefined;
    return this.sessions.get(id);
  }

  /** Leaves a watcher's stop, approval or answer for the desktop to run. */
  enqueue(command: Extract<HostCommand, { type: "cancel" | "approve" | "answer" }>): void {
    if (this.commands.length >= MAX_COMMANDS)
      throw new Error("Too many commands waiting for the MonoCode app on that computer");
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
  if (!overlay || (!overlay.pending.length && !Object.keys(overlay.patch).length))
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
