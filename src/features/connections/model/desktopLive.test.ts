import { describe, expect, it, vi } from "vitest";
import type { Block, Session } from "../../sessions/model/session";
import {
  applyDesktopLiveCommand,
  buildDesktopLiveSessions,
  runDesktopLiveTick,
  supportsDesktopLive,
  type DesktopLiveCommand,
} from "./desktopLive";

const approvalBlock = (requestId: number, decided?: "allow"): Block =>
  ({
    id: `b${requestId}`,
    role: "tool",
    approval: { requestId, decided },
  }) as unknown as Block;

const session = (over: Partial<Session> & { id: string }): Session =>
  ({ blocks: [], busy: false, ...over }) as unknown as Session;

const question = {
  requestId: 7,
  questions: [],
} as unknown as Session["pendingQuestion"];

describe("buildDesktopLiveSessions", () => {
  it("selects busy sessions and ones needing input, skipping idle", () => {
    const out = buildDesktopLiveSessions([
      session({ id: "idle" }),
      session({ id: "busy", busy: true }),
      session({
        id: "appr",
        blocks: [approvalBlock(3), approvalBlock(4, "allow")],
      }),
      session({ id: "q", pendingQuestion: question }),
      session({ id: "gone", busy: true, worktreeRemoved: true } as never),
    ]);
    expect(out.map((s) => s.id)).toEqual(["busy", "appr", "q"]);
    expect(out[0]).toEqual({ id: "busy", busy: true });
    expect(out[1].busy).toBe(false);
    expect(out[1].pending?.map((b) => b.approval?.requestId)).toEqual([3]);
    expect(out[2].patch).toEqual({ pendingQuestion: question });
  });

  it("strips non-JSON values", () => {
    const block = {
      ...approvalBlock(1),
      fn: () => 1,
      nope: undefined,
    } as unknown as Block;
    const [entry] = buildDesktopLiveSessions([
      session({ id: "a", blocks: [block] }),
    ]);
    expect(entry.pending?.[0]).not.toHaveProperty("fn");
    expect(entry.pending?.[0]).not.toHaveProperty("nope");
  });
});

describe("applyDesktopLiveCommand", () => {
  const handlers = () => ({ stop: vi.fn(), approve: vi.fn(), answer: vi.fn() });
  const sessions = [
    session({
      id: "s",
      busy: true,
      blocks: [approvalBlock(3)],
      pendingQuestion: question,
    }),
    session({ id: "idle" }),
  ];

  it("maps cancel, approve and answer to the local handlers", () => {
    const h = handlers();
    expect(
      applyDesktopLiveCommand(
        { id: "1", sessionId: "s", type: "cancel" },
        sessions,
        h,
      ),
    ).toBe(true);
    expect(h.stop).toHaveBeenCalledWith("s");
    expect(
      applyDesktopLiveCommand(
        {
          id: "2",
          sessionId: "s",
          type: "approve",
          requestId: 3,
          decision: "deny",
        },
        sessions,
        h,
      ),
    ).toBe(true);
    expect(h.approve).toHaveBeenCalledWith("s", 3, "deny");
    const reply = { kind: "skipped" } as const;
    applyDesktopLiveCommand(
      { id: "3", sessionId: "s", type: "answer", requestId: 7, reply },
      sessions,
      h,
    );
    expect(h.answer).toHaveBeenCalledWith("s", 7, reply);
  });

  it("drops stale commands", () => {
    const h = handlers();
    expect(
      applyDesktopLiveCommand(
        { id: "1", sessionId: "idle", type: "cancel" },
        sessions,
        h,
      ),
    ).toBe(false);
    expect(
      applyDesktopLiveCommand(
        { id: "2", sessionId: "none", type: "cancel" },
        sessions,
        h,
      ),
    ).toBe(false);
    expect(
      applyDesktopLiveCommand(
        {
          id: "3",
          sessionId: "s",
          type: "approve",
          requestId: 99,
          decision: "allow",
        },
        sessions,
        h,
      ),
    ).toBe(false);
    expect(
      applyDesktopLiveCommand(
        {
          id: "4",
          sessionId: "s",
          type: "answer",
          requestId: 8,
          reply: { kind: "skipped" },
        },
        sessions,
        h,
      ),
    ).toBe(false);
    expect(h.stop).not.toHaveBeenCalled();
    expect(h.approve).not.toHaveBeenCalled();
    expect(h.answer).not.toHaveBeenCalled();
  });
});

describe("runDesktopLiveTick", () => {
  it("retries a command whose local handler throws without acknowledging it", async () => {
    const command: DesktopLiveCommand = {
      id: "retry",
      sessionId: "s",
      type: "cancel",
    };
    const stop = vi.fn().mockImplementationOnce(() => {
      throw new Error("not ready");
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const deps = {
      request: vi.fn().mockResolvedValue({ commands: [command] }),
      sessions: () => [session({ id: "s", busy: true })],
      handlers: { stop, approve: vi.fn(), answer: vi.fn() },
      unacked: new Set<string>(),
      handled: new Set<string>(),
      clientId: "window",
    };
    try {
      await runDesktopLiveTick(deps);
      expect(deps.unacked.size).toBe(0);
      expect(deps.handled.size).toBe(0);
      await runDesktopLiveTick(deps);
      expect([...deps.unacked]).toEqual(["retry"]);
      expect(deps.request.mock.calls[0][0].clientId).toBe("window");
    } finally {
      log.mockRestore();
    }
  });
  it("executes once, acks on the next call, and dedupes re-sent commands", async () => {
    const stop = vi.fn();
    const cmd: DesktopLiveCommand = {
      id: "c1",
      sessionId: "s",
      type: "cancel",
    };
    const stale: DesktopLiveCommand = {
      id: "c2",
      sessionId: "gone",
      type: "cancel",
    };
    const request = vi
      .fn()
      .mockResolvedValueOnce({ commands: [cmd, stale] })
      .mockResolvedValueOnce({ commands: [cmd] })
      .mockResolvedValueOnce({ commands: [] });
    const deps = {
      request,
      sessions: () => [session({ id: "s", busy: true })],
      handlers: { stop, approve: vi.fn(), answer: vi.fn() },
      unacked: new Set<string>(),
      handled: new Set<string>(),
    };
    await runDesktopLiveTick(deps);
    expect(request.mock.calls[0][0].acked).toBeUndefined();
    await runDesktopLiveTick(deps);
    expect(request.mock.calls[1][0].acked).toEqual(["c1"]);
    await runDesktopLiveTick(deps);
    expect(request.mock.calls[2][0].acked).toEqual(["c1"]);
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("keeps acks when the request fails", async () => {
    const unacked = new Set(["x"]);
    const request = vi.fn().mockRejectedValue(new Error("down"));
    await expect(
      runDesktopLiveTick({
        request,
        sessions: () => [],
        handlers: { stop: vi.fn(), approve: vi.fn(), answer: vi.fn() },
        unacked,
        handled: new Set(),
      }),
    ).rejects.toThrow();
    expect([...unacked]).toEqual(["x"]);
  });
});

describe("supportsDesktopLive", () => {
  it("checks the capability", () => {
    expect(supportsDesktopLive(["sessions.desktopLive"])).toBe(true);
    expect(supportsDesktopLive(["sessions.desktop"])).toBe(false);
    expect(supportsDesktopLive(undefined)).toBe(false);
  });
});
