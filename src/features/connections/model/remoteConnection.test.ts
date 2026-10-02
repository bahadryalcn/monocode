import { describe, expect, it, vi } from "vitest";
import {
  autoRetryDelay,
  blocksSending,
  connectionIndicator,
  connectionOutcome,
  INITIAL_CONNECTION,
  reduceConnection,
  sanitizeConnectionError,
  sendAfterReconnect,
  shouldAutoRetry,
  type RemoteConnectionState,
} from "./remoteConnection";

const down = "Machine is unreachable. Check the host and SSH tunnel, then reconnect.";
const denied =
  "SSH connection failed: user@host: Permission denied (publickey). Open Settings → Connections and reconnect to check access.";
const timedOut = "SSH timed out. Open Settings → Connections and reconnect to authenticate.";

describe("connectionOutcome", () => {
  it("tells a silent machine from one that needs a sign-in", () => {
    expect(connectionOutcome(down).status).toBe("unreachable");
    expect(connectionOutcome(new Error("SSH connection failed: Connection timed out.")).status).toBe(
      "unreachable",
    );
    expect(connectionOutcome(denied).status).toBe("needs-auth");
    expect(connectionOutcome(timedOut).status).toBe("needs-auth");
    expect(connectionOutcome("SSH connection failed: Host key verification failed.").status).toBe(
      "needs-auth",
    );
  });

  it("reads an old host and a machine that answered with its own error", () => {
    expect(connectionOutcome("Host rejected request: Unsupported workspace command").status).toBe(
      "outdated-host",
    );
    expect(connectionOutcome("Host rejected request: Branch x does not exist")).toEqual({
      status: "connected",
    });
  });

  it("explains the reason briefly and never shows commands or secrets", () => {
    expect(connectionOutcome(down).error).toBe(
      "The machine did not answer. It may be off, asleep or offline.",
    );
    expect(connectionOutcome(denied).error).toMatch(/password, passphrase/);
    const leaky = connectionOutcome(
      "SSH connection failed: ssh -T -o BatchMode=yes -i /home/me/key host. Bearer abc.def-123 token=hunter2",
    ).error!;
    expect(leaky).not.toMatch(/BatchMode|abc\.def|hunter2|ssh -T/);
  });
});

describe("sanitizeConnectionError", () => {
  it("drops the settings hint, collapses whitespace and bounds the length", () => {
    expect(
      sanitizeConnectionError(
        "No route\n to host. Open Settings → Connections and reconnect to check access.",
      ),
    ).toBe("No route to host.");
    expect(sanitizeConnectionError("x".repeat(500)).length).toBe(198);
  });
});

describe("reduceConnection", () => {
  const ok = (at: number) => ({ type: "ok", at }) as const;
  const fail = (error: unknown, at = 0) => ({ type: "failure", error, at }) as const;

  it("moves between connected, unreachable and needs-auth, keeping when it was last seen", () => {
    let state = reduceConnection(INITIAL_CONNECTION, ok(100));
    expect(state).toEqual({ status: "connected", lastSeen: 100 });
    state = reduceConnection(state, fail(down, 200));
    expect(state).toMatchObject({ status: "unreachable", lastSeen: 100 });
    state = reduceConnection(state, fail(denied, 300));
    expect(state).toMatchObject({ status: "needs-auth", lastSeen: 100 });
    state = reduceConnection(state, ok(400));
    expect(state).toEqual({ status: "connected", lastSeen: 400 });
  });

  it("returns the same object for a repeated failure", () => {
    const state = reduceConnection(INITIAL_CONNECTION, fail(down));
    expect(reduceConnection(state, fail(down, 5))).toBe(state);
  });

  it("counts a machine's own error as an answer", () => {
    const state = reduceConnection(INITIAL_CONNECTION, fail(down));
    expect(reduceConnection(state, fail("Host rejected request: nope", 9)).status).toBe("connected");
  });

  it("keeps an outdated host noticed until a reconnect or update", () => {
    let state = reduceConnection(INITIAL_CONNECTION, fail("Unsupported host method"));
    expect(state.status).toBe("outdated-host");
    state = reduceConnection(state, ok(1));
    expect(state.status).toBe("outdated-host");
    expect(reduceConnection(state, { type: "recovered", at: 2 })).toEqual({
      status: "connected",
      lastSeen: 2,
    });
  });
});

describe("automatic retry rule", () => {
  it("backs off 2, 5, 15, 30 seconds and then every minute", () => {
    expect([0, 1, 2, 3, 4, 5, 20].map(autoRetryDelay)).toEqual([
      2_000, 5_000, 15_000, 30_000, 60_000, 60_000, 60_000,
    ]);
  });

  it("only retries a silent machine, never one that needs a password", () => {
    expect(shouldAutoRetry("unreachable", undefined, 0)).toBe(true);
    for (const status of ["needs-auth", "connected", "connecting", "outdated-host"] as const)
      expect(shouldAutoRetry(status, undefined, 0)).toBe(false);
  });

  it("stops after the window has been hidden for ten minutes", () => {
    expect(shouldAutoRetry("unreachable", 0, 10 * 60_000)).toBe(true);
    expect(shouldAutoRetry("unreachable", 0, 10 * 60_000 + 1)).toBe(false);
  });
});

describe("sendAfterReconnect", () => {
  const base = () => ({
    reconnect: vi.fn(async () => ({ ok: true }) as const),
    ready: vi.fn(async () => true),
    send: vi.fn(() => true),
  });

  it("sends at once when the machine is not known to be down", async () => {
    const fakes = base();
    expect(await sendAfterReconnect({ status: "connected", ...fakes })).toEqual({ sent: true });
    expect(fakes.reconnect).not.toHaveBeenCalled();
  });

  it("reconnects first, then sends", async () => {
    const fakes = base();
    expect(await sendAfterReconnect({ status: "unreachable", ...fakes })).toEqual({ sent: true });
    expect(fakes.reconnect.mock.invocationCallOrder[0]).toBeLessThan(
      fakes.send.mock.invocationCallOrder[0],
    );
  });

  it("sends nothing when the reconnect fails, and says why", async () => {
    const fakes = base();
    fakes.reconnect.mockResolvedValue({ ok: false, error: "no answer" } as never);
    expect(await sendAfterReconnect({ status: "needs-auth", ...fakes })).toEqual({
      sent: false,
      failure: "reconnect",
      error: "no answer",
    });
    expect(fakes.send).not.toHaveBeenCalled();
  });

  it("sends nothing when the view never catches up, or declines the message", async () => {
    const fakes = base();
    fakes.ready.mockResolvedValue(false);
    expect((await sendAfterReconnect({ status: "connecting", ...fakes })).failure).toBe("offline");
    expect(fakes.send).not.toHaveBeenCalled();
    const declined = { ...base(), send: vi.fn(() => false) };
    expect(await sendAfterReconnect({ status: "connected", ...declined })).toEqual({ sent: false });
  });
});

describe("indicators", () => {
  const state = (status: RemoteConnectionState["status"], error?: string) => ({ status, error });

  it("marks connected green, connecting amber and a lost machine red", () => {
    expect(connectionIndicator(state("connected"), false).tone).toBe("connected");
    expect(connectionIndicator(state("connecting"), false).tone).toBe("connecting");
    expect(connectionIndicator(state("unreachable", "It is off."), false)).toEqual({
      tone: "down",
      label: "Not connected. It is off.",
    });
    expect(connectionIndicator(state("needs-auth"), true).tone).toBe("connecting");
    expect(connectionIndicator(state("outdated-host", "Needs update."), false).tone).toBe(
      "connected",
    );
  });

  it("blocks sending only when messages cannot get through", () => {
    expect(blocksSending("unreachable")).toBe(true);
    expect(blocksSending("needs-auth")).toBe(true);
    expect(blocksSending("outdated-host")).toBe(false);
    expect(blocksSending("connecting")).toBe(false);
  });
});
