import { describe, expect, it } from "vitest";
import { DesktopLive, DESKTOP_BEAT_STALE_MS } from "./desktopLive";

describe("desktop window ownership", () => {
  it("keeps other windows alive and routes cancel, approve and answer to their owner", () => {
    const live = new DesktopLive();
    live.beat({ clientId: "A", sessions: [{ id: "a", busy: true }] });
    live.beat({ clientId: "B", sessions: [{ id: "b", busy: true }] });
    expect(live.running("a", false)).toBe(true);
    expect(live.running("b", false)).toBe(true);
    live.enqueue({ type: "cancel", sessionId: "a" });
    live.enqueue({
      type: "approve",
      sessionId: "a",
      requestId: 1,
      decision: "allow",
    });
    live.enqueue({
      type: "answer",
      sessionId: "a",
      requestId: 2,
      reply: { kind: "skipped" },
    });
    const a = live.beat({ clientId: "A", sessions: [{ id: "a", busy: true }] });
    expect(a.commands).toHaveLength(3);
    const acked = a.commands.map((command) => command.id);
    expect(
      live.beat({ clientId: "B", sessions: [{ id: "b", busy: true }], acked })
        .commands,
    ).toEqual([]);
    expect(
      live.beat({ clientId: "A", sessions: [{ id: "a", busy: true }] })
        .commands,
    ).toHaveLength(3);
    expect(live.beat({ clientId: "A", sessions: [], acked }).commands).toEqual(
      [],
    );
    expect(live.running("a", false)).toBe(false);
    expect(live.running("b", false)).toBe(true);
  });

  it("expires only the vanished owner and permits a replacement window", () => {
    let now = 0;
    const live = new DesktopLive(() => now);
    live.beat({ clientId: "A", sessions: [{ id: "a", busy: true }] });
    now = DESKTOP_BEAT_STALE_MS - 1;
    live.beat({ clientId: "B", sessions: [{ id: "b", busy: true }] });
    now += 2;
    expect(live.running("a", true)).toBe(false);
    expect(live.running("b", true)).toBe(true);
    live.beat({
      clientId: "B",
      sessions: [
        { id: "a", busy: true },
        { id: "b", busy: true },
      ],
    });
    expect(live.running("a", false)).toBe(true);
  });

  it("does not let an idle duplicate tab steal a live owner's prompts", () => {
    const live = new DesktopLive();
    live.beat({ clientId: "A", sessions: [{ id: "a", busy: true }] });
    live.enqueue({ type: "cancel", sessionId: "a" });
    expect(
      live.beat({ clientId: "B", sessions: [{ id: "a", busy: false }] })
        .commands,
    ).toEqual([]);
    expect(live.running("a", false)).toBe(true);
  });
});
