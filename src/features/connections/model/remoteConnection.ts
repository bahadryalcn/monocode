import { classifyRemoteError, remoteErrorText } from "./remoteFailure";

/** What this computer last learned about one remote machine, from the outcome
 * of every request any view made to it. */
export type RemoteConnectionStatus =
  /** The machine answered its latest request. */
  | "connected"
  /** Not known yet, or a reconnect is under way. */
  | "connecting"
  /** The machine or its SSH tunnel did not answer. */
  | "unreachable"
  /** SSH needs a password, passphrase or host-key decision a background attempt cannot give. */
  | "needs-auth"
  /** The host answered, but is too old for something the app asked. */
  | "outdated-host";

export type RemoteConnectionState = {
  status: RemoteConnectionStatus;
  /** Why the machine is not connected, in words fit for the user. */
  error?: string;
  /** When the machine last answered, in this session of the app. */
  lastSeen?: number;
};

export const INITIAL_CONNECTION: RemoteConnectionState = { status: "connecting" };

export type RemoteConnectionEvent =
  | { type: "ok"; at: number }
  | { type: "failure"; error: unknown; at: number }
  /** A reconnect worked, or Update Host finished: forget any problem. */
  | { type: "recovered"; at: number };

/** SSH stderr and messages from `remote_ssh.rs` that a saved key could not
 * satisfy, so only the user can fix it. */
const NEEDS_AUTH =
  /Permission denied|Host key verification failed|reconnect to authenticate|passphrase|authentication failed|no more authentication methods|Too many authentication failures/i;

/** Takes anything secret or machine-sized out of an error before it is shown:
 * bearer tokens, key=value credentials and whole `ssh …` command lines. */
export function sanitizeConnectionError(text: string): string {
  const cleaned = text
    .replace(/Bearer\s+[\w.~+/=-]+/gi, "Bearer …")
    .replace(/\b(token|password|passphrase|secret)\s*[=:]\s*\S+/gi, "$1 …")
    .replace(/\bssh(?:\.exe)?\s+-\S.*/gi, "")
    .replace(/\s*Open Settings → Connections and reconnect[^.]*\.?/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > 200 ? `${cleaned.slice(0, 197)}…` : cleaned;
}

/** A short reason for a status, for banners and tooltips. */
export function connectionReason(status: RemoteConnectionStatus, raw: string): string {
  if (status === "needs-auth")
    return "SSH needs your password, passphrase or approval of the host key.";
  if (status === "outdated-host") return "MonoCode Host on the machine needs an update.";
  if (/Machine is unreachable/i.test(raw)) return "The machine did not answer. It may be off, asleep or offline.";
  if (/no longer connected|isn.t connected on this computer|Connect this project.s machine/i.test(raw))
    return "This machine is not connected on this computer.";
  if (/SSH connection failed/i.test(raw)) {
    const detail = sanitizeConnectionError(raw.replace(/^.*?SSH connection failed:\s*/i, ""));
    return detail ? `SSH could not connect: ${detail}` : "SSH could not connect.";
  }
  return sanitizeConnectionError(raw) || "The machine did not answer.";
}

/** Which status a failed request means. `connected` when the machine itself
 * answered, even if with an error of its own. */
export function connectionOutcome(error: unknown): {
  status: RemoteConnectionStatus;
  error?: string;
} {
  const failure = classifyRemoteError(error);
  if (failure.kind === "outdated")
    return { status: "outdated-host", error: connectionReason("outdated-host", failure.message) };
  if (failure.kind !== "unreachable") return { status: "connected" };
  const status = NEEDS_AUTH.test(remoteErrorText(error)) ? "needs-auth" : "unreachable";
  return { status, error: connectionReason(status, failure.message) };
}

/** The state after one event. Returns the same object when nothing changed. */
export function reduceConnection(
  state: RemoteConnectionState,
  event: RemoteConnectionEvent,
): RemoteConnectionState {
  switch (event.type) {
    case "recovered":
      return { status: "connected", lastSeen: event.at };
    case "ok":
      // An old host keeps answering what it knows, so only a reconnect or an
      // update clears that notice.
      if (state.status === "outdated-host") return state;
      return { status: "connected", lastSeen: event.at };
    case "failure": {
      const outcome = connectionOutcome(event.error);
      if (outcome.status === "connected") return reduceConnection(state, { type: "ok", at: event.at });
      if (state.status === outcome.status && state.error === outcome.error) return state;
      return { status: outcome.status, error: outcome.error, lastSeen: state.lastSeen };
    }
  }
}

/** Delays between background reconnect attempts after a drop, then every minute. */
export const AUTO_RETRY_DELAYS = [2_000, 5_000, 15_000, 30_000, 60_000];
/** Background attempts stop once the window has been hidden this long. */
export const HIDDEN_RETRY_LIMIT_MS = 10 * 60_000;

/** The wait before background attempt number `attempt` (0 is the first). */
export function autoRetryDelay(attempt: number): number {
  return AUTO_RETRY_DELAYS[Math.min(Math.max(attempt, 0), AUTO_RETRY_DELAYS.length - 1)];
}

/** Whether to try again without asking the user: only a machine that did not
 * answer, never one that needs a password, and not for a window nobody looks at. */
export function shouldAutoRetry(
  status: RemoteConnectionStatus,
  hiddenSince: number | undefined,
  now: number,
): boolean {
  if (status !== "unreachable") return false;
  return hiddenSince === undefined || now - hiddenSince <= HIDDEN_RETRY_LIMIT_MS;
}

/** Whether a message cannot reach the machine right now. */
export const blocksSending = (status: RemoteConnectionStatus) =>
  status === "unreachable" || status === "needs-auth";

/** How a project row marks its machine: a dot colour and a tooltip. `down`
 * rows can be clicked to reconnect. */
export function connectionIndicator(
  state: RemoteConnectionState,
  reconnecting: boolean,
): { tone: "connected" | "connecting" | "down"; label: string } {
  if (reconnecting) return { tone: "connecting", label: "Reconnecting" };
  switch (state.status) {
    case "connected":
      return { tone: "connected", label: "Connected" };
    case "outdated-host":
      return { tone: "connected", label: `Connected. ${state.error ?? ""}`.trim() };
    case "connecting":
      return { tone: "connecting", label: "Connecting" };
    default:
      return { tone: "down", label: `Not connected. ${state.error ?? ""}`.trim() };
  }
}

export type ReconnectOutcome = { ok: true } | { ok: false; error: string };

/** Sends a message through a connection that may have dropped. A message
 * never leaves the composer for good unless `send` accepts it: when
 * reconnecting fails, nothing is sent and the reason comes back for display.
 * `ready` resolves once the view has caught up with the machine again. */
export async function sendAfterReconnect(options: {
  status: RemoteConnectionStatus;
  reconnect: () => Promise<ReconnectOutcome>;
  ready: () => Promise<boolean>;
  send: () => boolean;
}): Promise<{ sent: boolean; failure?: "reconnect" | "offline"; error?: string }> {
  if (blocksSending(options.status)) {
    const result = await options.reconnect();
    if (!result.ok) return { sent: false, failure: "reconnect", error: result.error };
  }
  if (!(await options.ready()))
    return { sent: false, failure: "offline", error: "The machine is still not answering." };
  return { sent: options.send() };
}
