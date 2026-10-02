import { isPreparingHandoff } from "./handoff";
import type { FollowUpBehavior } from "../../settings/model/settings";
import { hasMissingAttachment } from "./queuePersistence";
import type { QueuedMessage, Session, TurnIntent } from "./session";

export function queuedHead(session: Session): QueuedMessage | undefined {
  return session.queuedMessages?.[0];
}

/** Hold auto-dispatch only while the item about to send is being edited. */
export function isEditingQueuedHead(session: Session): boolean {
  const head = queuedHead(session);
  return Boolean(head && session.editingQueuedMessageId === head.id);
}

export function dequeueQueuedMessage(
  session: Session,
  messageId: string,
): Session {
  const queuedMessages = (session.queuedMessages ?? []).filter(
    (message) => message.id !== messageId,
  );
  return {
    ...session,
    queuedMessages: queuedMessages.length > 0 ? queuedMessages : undefined,
    queueStatus: queuedMessages.length > 0 ? session.queueStatus : undefined,
    editingQueuedMessageId:
      session.editingQueuedMessageId === messageId
        ? undefined
        : session.editingQueuedMessageId,
  };
}

/**
 * A queued row was sent: take it out, and let a queue restored after a restart
 * go back to draining, since the user has just chosen to send from it.
 */
export function sentQueuedMessage(session: Session, messageId: string): Session {
  const next = dequeueQueuedMessage(session, messageId);
  return next.queueStatus === "restored"
    ? { ...next, queueStatus: "active" }
    : next;
}

/**
 * True when the idle session can send its queued head as a new turn.
 * Busy / paused / resuming / restored / usage-limited / preparing-handoff /
 * editing-the-head / a head whose attachment is gone all wait.
 */
export function canDispatchQueuedHead(session: Session): boolean {
  if (session.busy) return false;
  if (session.usageLimit) return false;
  if (
    session.queueStatus === "paused" ||
    session.queueStatus === "resuming" ||
    session.queueStatus === "restored"
  ) {
    return false;
  }
  const head = queuedHead(session);
  if (!head) return false;
  if (hasMissingAttachment(head)) return false;
  if (isEditingQueuedHead(session)) return false;
  if (isPreparingHandoff(session)) return false;
  return true;
}

/** Resolve a queued row for auto-dispatch (head, idle) or an explicit Steer. */
export function queuedMessageForSubmit(
  session: Session,
  messageId: string,
  mode: "dispatch" | "steer",
): QueuedMessage | undefined {
  const message = session.queuedMessages?.find(
    (entry) => entry.id === messageId,
  );
  if (!message || hasMissingAttachment(message)) return undefined;
  if (mode === "steer") return message;
  if (queuedHead(session)?.id !== messageId) return undefined;
  if (!canDispatchQueuedHead(session)) return undefined;
  return message;
}

export type FollowUpRoute = "dispatch" | "queue" | "steer";

/**
 * Where a message sent from the composer goes. Idle sessions dispatch. While a
 * turn is open the message is queued when the app must (a worktree is still
 * preparing; plan, orchestrate and /operator start their own turn), steered
 * when only background tasks keep the turn open (they may never end, so a
 * queued message would be parked behind them), and otherwise follows
 * `requested` (an explicit per-send choice) or the global `setting`.
 *
 * An explicit "queue" beats the background-task steer unless the agent has
 * truly yielded (`backgroundOnly`), because with the agent still working the
 * queued message is sent when that turn ends.
 */
export function resolveFollowUpRoute(input: {
  busy: boolean;
  worktreePreparing?: boolean;
  intent: TurnIntent;
  operatorCommand: boolean;
  backgroundTaskCount: number;
  backgroundOnly: boolean;
  requested?: FollowUpBehavior;
  setting: FollowUpBehavior;
}): FollowUpRoute {
  if (!input.busy) return "dispatch";
  if (
    input.worktreePreparing ||
    input.intent === "plan" ||
    input.intent === "orchestrate" ||
    input.operatorCommand
  ) {
    return "queue";
  }
  if (input.requested === "queue" && !input.backgroundOnly) return "queue";
  if (input.backgroundTaskCount > 0) return "steer";
  return input.requested ?? input.setting;
}
