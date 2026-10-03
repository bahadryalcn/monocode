import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CYCLE_INTERVAL_MS,
  MIN_CYCLE_SPACING_MS,
  SYNC_UNSUPPORTED_MESSAGE,
  getSyncStatus,
  recordSyncStatus,
  runSyncCycle,
  startSyncLoop,
  subscribeSyncMerged,
  subscribeSyncStatus,
  syncNow,
} from "./syncClient";
import { loadPeerState, peerRev, queueLocalChange } from "./syncPeerState";
import { loadProjectGroups, saveProjectGroups } from "../../projects/model/projectGroups";

function mockLocalStorage() {
  const data = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value),
      removeItem: (key: string) => void data.delete(key),
    },
    configurable: true,
  });
}

const MACHINE = "host-1";

describe("runSyncCycle", () => {
  beforeEach(mockLocalStorage);

  it("pushes the outbox, then pulls and applies what the host returns", async () => {
    saveProjectGroups([{ id: "g1", name: "Mine", collapsed: false }]);
    queueLocalChange(MACHINE, "group", "g1", { id: "g1", name: "Mine", collapsed: false });
    const request = vi.fn(async (method: string, params: any) => {
      if (method === "sync.push") {
        expect(params.ops).toEqual(
          expect.arrayContaining([
            { table: "group", id: "g1", baseRev: 0, value: { id: "g1", name: "Mine" } },
          ]),
        );
        return { rev: 5, applied: [{ table: "group", id: "g1", rev: 5 }], rejected: [] };
      }
      if (method === "sync.pull") {
        if (params.sinceRev !== 0) return { rev: 6, records: [] };
        return {
          rev: 6,
          records: [{ table: "group", id: "g2", rev: 6, value: { id: "g2", name: "Theirs", collapsed: false } }],
        };
      }
      throw new Error(`unexpected method ${method}`);
    });

    await runSyncCycle(MACHINE, request);

    expect(request).toHaveBeenCalledWith("sync.push", { ops: expect.any(Array) });
    // First contact pulls before pushing, then pulls again after the push.
    expect(request.mock.calls.map(([method, params]) => `${method}:${params.sinceRev ?? ""}`)).toEqual([
      "sync.pull:0",
      "sync.push:",
      "sync.pull:6",
    ]);
    expect(loadProjectGroups().map((g) => g.id).sort()).toEqual(["g1", "g2"]);
    expect(peerRev(MACHINE)).toBe(6);
  });

  it("skips the push call when the outbox is empty", async () => {
    const accept = vi.fn(async (method: string, params: any) => {
      if (method === "sync.push") {
        return { rev: 1, applied: params.ops.map((op: any) => ({ table: op.table, id: op.id, rev: 1 })), rejected: [] };
      }
      return { rev: 1, records: [] };
    });
    await runSyncCycle(MACHINE, accept);

    const request = vi.fn(async (method: string) => {
      if (method === "sync.pull") return { rev: 1, records: [] };
      throw new Error(`unexpected method ${method}`);
    });
    await runSyncCycle(MACHINE, request);
    expect(request).not.toHaveBeenCalledWith("sync.push", expect.anything());
  });

  it("applies the host's current value for a rejected push and clears the outbox", async () => {
    saveProjectGroups([{ id: "g1", name: "Mine", collapsed: false }]);
    queueLocalChange(MACHINE, "group", "g1", { id: "g1", name: "Mine", collapsed: false });
    const request = vi.fn(async (method: string) => {
      if (method === "sync.push") {
        return {
          rev: 7,
          applied: [],
          rejected: [
            {
              table: "group",
              id: "g1",
              current: { table: "group", id: "g1", rev: 7, value: { id: "g1", name: "Theirs", collapsed: false } },
            },
          ],
        };
      }
      if (method === "sync.pull") return { rev: 7, records: [] };
      throw new Error(`unexpected method ${method}`);
    });

    await runSyncCycle(MACHINE, request);

    expect(loadProjectGroups().find((g) => g.id === "g1")?.name).toBe("Theirs");
    expect(loadPeerState(MACHINE).outbox.find((op) => op.table === "group" && op.id === "g1")).toBeUndefined();
  });

  it("notifies listeners when a rejected push overwrites a differing local edit, not on a plain pull", async () => {
    saveProjectGroups([{ id: "g1", name: "Mine", collapsed: false }]);
    queueLocalChange(MACHINE, "group", "g1", { id: "g1", name: "Mine", collapsed: false });
    const listener = vi.fn();
    const off = subscribeSyncMerged(listener);
    const rejecting = async (method: string) =>
      method === "sync.push"
        ? {
            rev: 7,
            applied: [],
            rejected: [
              { table: "group", id: "g1", current: { table: "group", id: "g1", rev: 7, value: { id: "g1", name: "Theirs", collapsed: false } } },
            ],
          }
        : { rev: 7, records: [] };
    await runSyncCycle(MACHINE, rejecting);
    expect(listener).toHaveBeenCalledTimes(1);
    const pulling = async (method: string) => ({
      rev: 9,
      records: [{ table: "group", id: "g1", rev: 9, value: { id: "g1", name: "Again", collapsed: false } }],
      applied: [],
      rejected: [],
    });
    await runSyncCycle(MACHINE, pulling);
    expect(listener).toHaveBeenCalledTimes(1);
    off();
  });

  it("ignores malformed pulled records", async () => {
    const request = vi.fn(async (method: string, params: any) => {
      if (method === "sync.push") {
        return { rev: 0, applied: params.ops.map((op: any) => ({ table: op.table, id: op.id, rev: 1 })), rejected: [] };
      }
      if (method === "sync.pull") {
        return {
          rev: 3,
          records: [
            null,
            { table: "nope", id: "x", rev: 2, value: {} },
            { table: "group", id: "g9", rev: 3, value: { id: "g9", name: "Ok", collapsed: false } },
          ],
        };
      }
      throw new Error(`unexpected method ${method}`);
    });

    await runSyncCycle(MACHINE, request);

    expect(loadProjectGroups().map((g) => g.id)).toEqual(["g9"]);
    expect(peerRev(MACHINE)).toBe(3);
  });

  it("throws when the host returns a non-object result", async () => {
    const request = vi.fn(async () => "garbage");
    await expect(runSyncCycle(MACHINE, request)).rejects.toThrow();
  });
});

describe("sync status", () => {
  beforeEach(mockLocalStorage);

  it("goes syncing -> ok and notifies subscribers", async () => {
    const seen: string[] = [];
    const off = subscribeSyncStatus(() => seen.push(getSyncStatus("st-ok").state));
    await runSyncCycle("st-ok", async () => ({ rev: 1, records: [] }));
    off();
    expect(seen).toEqual(["syncing", "ok"]);
    const status = getSyncStatus("st-ok");
    expect(status.lastSyncAt).toBeGreaterThan(0);
    expect(status.pendingOps).toBeGreaterThanOrEqual(0);
  });

  it("records the real error text and warns", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(
      runSyncCycle("st-err", async () => {
        throw new Error("Machine is unreachable");
      }),
    ).rejects.toThrow();
    expect(getSyncStatus("st-err")).toMatchObject({ state: "error", lastError: "Machine is unreachable" });
    expect(warn).toHaveBeenCalledWith("[sync]", "st-err", expect.any(Error));
    warn.mockRestore();
  });

  it("syncNow is a no-op without a loop and runs a cycle through a running one", async () => {
    await syncNow("st-now");
    expect(getSyncStatus("st-now").state).toBe("idle");
    const request = vi.fn(async () => ({ rev: 1, records: [] }));
    const loop = startSyncLoop(() => ["st-now"], () => request);
    await syncNow("st-now");
    expect(getSyncStatus("st-now").state).toBe("ok");
    loop.stop();
  });

  it("syncNow marks a machine the loop does not sync as unsupported, replacing a stale error", async () => {
    recordSyncStatus("st-gone", { state: "error", lastError: "Machine is unreachable" });
    const request = vi.fn(async () => ({ rev: 1, records: [] }));
    const loop = startSyncLoop(() => [], () => request);
    await syncNow();
    await syncNow("st-gone");
    loop.stop();
    expect(getSyncStatus("st-gone")).toMatchObject({ state: "unsupported", lastError: SYNC_UNSUPPORTED_MESSAGE });
    expect(request).not.toHaveBeenCalled();
  });
});

describe("sync loop pacing", () => {
  beforeEach(() => {
    mockLocalStorage();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps cycles at least 3 s apart, collapses nudges into one trailing run, and idles at 30 s", async () => {
    const request = async () => ({ rev: 1, records: [], applied: [], rejected: [] });
    const cycles = vi.fn(() => ["pace-1"]);
    const loop = startSyncLoop(cycles, () => request);
    await vi.advanceTimersByTimeAsync(0);
    expect(cycles).toHaveBeenCalledTimes(1);

    loop.nudge();
    loop.nudge();
    loop.nudge();
    await vi.advanceTimersByTimeAsync(MIN_CYCLE_SPACING_MS - 1);
    expect(cycles).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(cycles).toHaveBeenCalledTimes(2);

    // No nudge: nothing until the 30 s poll.
    await vi.advanceTimersByTimeAsync(CYCLE_INTERVAL_MS - MIN_CYCLE_SPACING_MS - 1);
    expect(cycles).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(cycles).toHaveBeenCalledTimes(3);
    expect(CYCLE_INTERVAL_MS).toBe(30_000);
    expect(MIN_CYCLE_SPACING_MS).toBe(3_000);

    loop.nudge();
    loop.stop();
    await vi.advanceTimersByTimeAsync(CYCLE_INTERVAL_MS * 2);
    expect(cycles).toHaveBeenCalledTimes(3);
  });

  it("a nudge during a running cycle schedules exactly one trailing run after the spacing", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const request = async () => {
      await gate;
      return { rev: 1, records: [], applied: [], rejected: [] };
    };
    const cycles = vi.fn(() => ["pace-2"]);
    const loop = startSyncLoop(cycles, () => request);
    await vi.advanceTimersByTimeAsync(10);
    loop.nudge();
    loop.nudge();
    expect(cycles).toHaveBeenCalledTimes(1);
    release();
    await vi.advanceTimersByTimeAsync(MIN_CYCLE_SPACING_MS - 1);
    expect(cycles).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(cycles).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(MIN_CYCLE_SPACING_MS * 2);
    expect(cycles).toHaveBeenCalledTimes(2);
    loop.stop();
  });
});
