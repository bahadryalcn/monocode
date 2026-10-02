import { beforeEach, describe, expect, it, vi } from "vitest";
import { runSyncCycle, subscribeSyncMerged } from "./syncClient";
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
            { table: "group", id: "g1", baseRev: 0, value: { id: "g1", name: "Mine", collapsed: false } },
          ]),
        );
        return { rev: 5, applied: [{ table: "group", id: "g1", rev: 5 }], rejected: [] };
      }
      if (method === "sync.pull") {
        expect(params.sinceRev).toBe(0);
        return {
          rev: 6,
          records: [{ table: "group", id: "g2", rev: 6, value: { id: "g2", name: "Theirs", collapsed: false } }],
        };
      }
      throw new Error(`unexpected method ${method}`);
    });

    await runSyncCycle(MACHINE, request);

    expect(request).toHaveBeenCalledWith("sync.push", { ops: expect.any(Array) });
    expect(request).toHaveBeenCalledWith("sync.pull", { sinceRev: 0 });
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
