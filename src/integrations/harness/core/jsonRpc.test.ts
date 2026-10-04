import { beforeEach, describe, expect, it, vi } from "vitest";

const transport = vi.hoisted(() => ({
  onWrite: async (_sessionId: string, _line: string): Promise<void> => {},
}));

vi.mock("./child", () => ({
  writeChild: (sessionId: string, line: string) =>
    transport.onWrite(sessionId, line),
}));

import { JsonRpcClient } from "./jsonRpc";

describe("JsonRpcClient", () => {
  beforeEach(() => {
    transport.onWrite = async () => {};
  });

  it("accepts a response delivered before the write resolves", async () => {
    let client!: JsonRpcClient;
    transport.onWrite = async (_sessionId, line) => {
      const outbound = JSON.parse(line) as { id: number };
      client.pushLine(
        JSON.stringify({
          jsonrpc: "2.0",
          id: outbound.id,
          result: { ok: true },
        }),
      );
    };
    client = new JsonRpcClient("fast", {});

    await expect(client.request("session/set_mode")).resolves.toEqual({
      ok: true,
    });
  });

  it("rejects and removes a request when writing fails", async () => {
    transport.onWrite = async () => {
      throw new Error("pipe closed");
    };
    const client = new JsonRpcClient("failed", {});

    await expect(client.request("initialize")).rejects.toThrow("pipe closed");
  });

  it("delivers a provider response without waiting for the IPC write acknowledgement", async () => {
    let client!: JsonRpcClient;
    transport.onWrite = (_sessionId, line) => {
      client.pushLine(
        JSON.stringify({ id: JSON.parse(line).id, result: { ok: true } }),
      );
      return new Promise<void>(() => undefined);
    };
    vi.useFakeTimers();
    try {
      client = new JsonRpcClient("mac-ipc", {});
      await expect(client.request("turn/start")).resolves.toEqual({ ok: true });
      await vi.advanceTimersByTimeAsync(16_000);
    } finally {
      vi.useRealTimers();
    }
  });

  it("bounds unanswered requests after a successful write", async () => {
    vi.useFakeTimers();
    try {
      const client = new JsonRpcClient(
        "no-response",
        {},
        { label: "codex", defaultRequestTimeoutMs: 100 },
      );
      const outcome = client
        .request("initialize")
        .catch((error: Error) => error.message);
      await vi.advanceTimersByTimeAsync(101);
      expect(await outcome).toContain("codex initialize response timed out");
    } finally {
      vi.useRealTimers();
    }
  });

  it("identifies a blocked server reply without including its content", async () => {
    vi.useFakeTimers();
    try {
      transport.onWrite = () => new Promise<void>(() => undefined);
      const client = new JsonRpcClient("reply", {}, { label: "codex" });
      client.pushLine(JSON.stringify({ id: 3, method: "currentTime/read" }));
      const outcome = client
        .respond(3, { privateValue: "secret" })
        .catch((error: Error) => error.message);
      await vi.advanceTimersByTimeAsync(16_000);
      expect(await outcome).toContain(
        "reply to currentTime/read write timed out",
      );
      expect(await outcome).not.toContain("secret");
    } finally {
      vi.useRealTimers();
    }
  });

  it("bounds a blocked write instead of outliving the request deadline", async () => {
    vi.useFakeTimers();
    try {
      transport.onWrite = () => new Promise<void>(() => undefined);
      const client = new JsonRpcClient("wedged", {});
      const outcome = client.request("initialize", undefined, 60_000).then(
        () => "resolved",
        (e: Error) => e.message,
      );
      // The 15s write bound fires long before the request's own 60s deadline.
      await vi.advanceTimersByTimeAsync(16_000);
      await expect(outcome).resolves.toMatch(/timed out/);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not let a slow request deadline report as unhandled while the write is pending", async () => {
    vi.useFakeTimers();
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);
    try {
      transport.onWrite = () => new Promise<void>(() => undefined);
      const client = new JsonRpcClient("quiet", {});
      const request = client.request("initialize", undefined, 5_000);
      const settled = request.catch((e: Error) => e.message);
      // At 5s the request's own deadline fires while the write stays blocked;
      // the outer promise only settles once the write bound returns it at 15s.
      await vi.advanceTimersByTimeAsync(6_000);
      await expect(settled).resolves.toContain("initialize response timed out");
      await vi.advanceTimersByTimeAsync(15_000);
      await expect(settled).resolves.toMatch(/timed out/);
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
      vi.useRealTimers();
    }
  });
});
