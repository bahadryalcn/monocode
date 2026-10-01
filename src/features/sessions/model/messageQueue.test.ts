import { describe, expect, it } from "vitest";
import { appendPreparingHandoff } from "./handoff";
import {
  canDispatchQueuedHead,
  dequeueQueuedMessage,
  isEditingQueuedHead,
  queuedHead,
  queuedMessageForSubmit,
  resolveFollowUpRoute,
} from "./messageQueue";
import { newSession, type QueuedMessage, type Session } from "./session";

function queued(id: string, text = id): QueuedMessage {
  return { id, text, attachments: [] };
}

function chat(patch: Partial<Session> = {}): Session {
  return {
    ...newSession("claude", "/tmp/project"),
    queuedMessages: [queued("a", "first"), queued("b", "second")],
    queueStatus: "active",
    ...patch,
  };
}

describe("queuedHead", () => {
  it("returns the first queued follow-up", () => {
    expect(queuedHead(chat())?.id).toBe("a");
    expect(queuedHead(chat({ queuedMessages: undefined }))).toBeUndefined();
  });
});

describe("isEditingQueuedHead", () => {
  it("is true only when the head row is the one being edited", () => {
    expect(isEditingQueuedHead(chat())).toBe(false);
    expect(
      isEditingQueuedHead(chat({ editingQueuedMessageId: "a" })),
    ).toBe(true);
    expect(
      isEditingQueuedHead(chat({ editingQueuedMessageId: "b" })),
    ).toBe(false);
  });
});

describe("canDispatchQueuedHead", () => {
  it("dispatches an idle session with a queued head", () => {
    expect(canDispatchQueuedHead(chat())).toBe(true);
  });

  it("holds while the session is busy, paused, or resuming", () => {
    expect(canDispatchQueuedHead(chat({ busy: true }))).toBe(false);
    expect(canDispatchQueuedHead(chat({ queueStatus: "paused" }))).toBe(false);
    expect(canDispatchQueuedHead(chat({ queueStatus: "resuming" }))).toBe(
      false,
    );
  });

  it("holds while the last turn is stopped at a usage limit", () => {
    expect(
      canDispatchQueuedHead(chat({ usageLimit: { resetsAt: 1_000 } })),
    ).toBe(false);
  });

  it("holds only when the head item is being edited", () => {
    expect(
      canDispatchQueuedHead(chat({ editingQueuedMessageId: "a" })),
    ).toBe(false);
    expect(
      canDispatchQueuedHead(chat({ editingQueuedMessageId: "b" })),
    ).toBe(true);
  });

  it("does not dispatch during a preparing handoff", () => {
    const preparing = appendPreparingHandoff(
      chat({ queuedMessages: [queued("a")] }),
      "claude",
      "cursor",
    );
    expect(canDispatchQueuedHead(preparing)).toBe(false);
  });

  it("does not dispatch an empty queue", () => {
    expect(
      canDispatchQueuedHead(chat({ queuedMessages: undefined })),
    ).toBe(false);
  });
});

describe("dequeueQueuedMessage", () => {
  it("drops the id and clears queue state when the last item goes", () => {
    const one = chat({ queuedMessages: [queued("a")], queueStatus: "active" });
    expect(dequeueQueuedMessage(one, "a")).toMatchObject({
      queuedMessages: undefined,
      queueStatus: undefined,
    });
  });

  it("keeps editing another row after the head is sent", () => {
    const next = dequeueQueuedMessage(
      chat({ editingQueuedMessageId: "b" }),
      "a",
    );
    expect(next.queuedMessages?.map((message) => message.id)).toEqual(["b"]);
    expect(next.editingQueuedMessageId).toBe("b");
    expect(next.queueStatus).toBe("active");
  });
});

describe("queuedMessageForSubmit", () => {
  it("only auto-dispatches the idle head", () => {
    expect(queuedMessageForSubmit(chat(), "a", "dispatch")?.id).toBe("a");
    expect(queuedMessageForSubmit(chat(), "b", "dispatch")).toBeUndefined();
    expect(
      queuedMessageForSubmit(chat({ busy: true }), "a", "dispatch"),
    ).toBeUndefined();
  });

  it("hands back the queued text and attachments as queued, so tokens keep their numbers", () => {
    const attachments = [
      { id: "a", name: "one.png", mimeType: "image/png", kind: "image", size: 1 },
      { id: "b", name: "notes.md", mimeType: "text/plain", kind: "file", size: 1 },
      { id: "c", name: "two.png", mimeType: "image/png", kind: "image", size: 1 },
    ] as const;
    const message = {
      ...queued("q", "[image2] vs [image1] and [file1]"),
      attachments: [...attachments],
    };
    const session = chat({ queuedMessages: [message] });
    for (const mode of ["dispatch", "steer"] as const) {
      const out = queuedMessageForSubmit(session, "q", mode)!;
      expect(out.text).toBe("[image2] vs [image1] and [file1]");
      expect(out.attachments.map((file) => file.id)).toEqual(["a", "b", "c"]);
    }
  });

  it("lets Steer target any remaining row, including while busy or paused", () => {
    expect(
      queuedMessageForSubmit(chat({ busy: true }), "b", "steer")?.id,
    ).toBe("b");
    expect(
      queuedMessageForSubmit(chat({ queueStatus: "paused" }), "a", "steer")?.id,
    ).toBe("a");
    expect(queuedMessageForSubmit(chat(), "missing", "steer")).toBeUndefined();
  });
});

describe("resolveFollowUpRoute", () => {
  const base = {
    busy: true,
    intent: "default" as const,
    operatorCommand: false,
    backgroundTaskCount: 0,
    backgroundOnly: false,
    setting: "steer" as const,
  };

  it("dispatches when the session is idle, whatever else is set", () => {
    expect(
      resolveFollowUpRoute({ ...base, busy: false, requested: "queue" }),
    ).toBe("dispatch");
    expect(
      resolveFollowUpRoute({ ...base, busy: false, setting: "queue" }),
    ).toBe("dispatch");
  });

  it("follows the global setting while busy", () => {
    expect(resolveFollowUpRoute({ ...base, setting: "steer" })).toBe("steer");
    expect(resolveFollowUpRoute({ ...base, setting: "queue" })).toBe("queue");
  });

  it("lets an explicit request override the setting either way", () => {
    expect(
      resolveFollowUpRoute({ ...base, setting: "steer", requested: "queue" }),
    ).toBe("queue");
    expect(
      resolveFollowUpRoute({ ...base, setting: "queue", requested: "steer" }),
    ).toBe("steer");
  });

  it("always queues while a worktree prepares and for plan, orchestrate and operator", () => {
    expect(
      resolveFollowUpRoute({ ...base, worktreePreparing: true, requested: "steer" }),
    ).toBe("queue");
    expect(
      resolveFollowUpRoute({ ...base, intent: "plan", requested: "steer" }),
    ).toBe("queue");
    expect(
      resolveFollowUpRoute({ ...base, intent: "orchestrate" }),
    ).toBe("queue");
    expect(
      resolveFollowUpRoute({ ...base, operatorCommand: true, requested: "steer" }),
    ).toBe("queue");
  });

  it("steers when background tasks are open and nothing asked for a queue", () => {
    expect(
      resolveFollowUpRoute({ ...base, setting: "queue", backgroundTaskCount: 1 }),
    ).toBe("steer");
    expect(
      resolveFollowUpRoute({ ...base, setting: "steer", backgroundTaskCount: 2, backgroundOnly: true }),
    ).toBe("steer");
  });

  it("honours an explicit queue beside a background task while the agent is still working", () => {
    expect(
      resolveFollowUpRoute({ ...base, backgroundTaskCount: 1, requested: "queue" }),
    ).toBe("queue");
  });

  it("never parks an explicit queue behind background-only work", () => {
    expect(
      resolveFollowUpRoute({
        ...base,
        backgroundTaskCount: 1,
        backgroundOnly: true,
        requested: "queue",
      }),
    ).toBe("steer");
  });
});
