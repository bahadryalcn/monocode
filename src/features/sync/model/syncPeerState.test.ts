import { beforeEach, describe, expect, it } from "vitest";
import {
  applyPushResult,
  hasPendingOp,
  knownRecordIds,
  loadPeerState,
  markPulled,
  peerRev,
  queueLocalChange,
  setPeerRev,
  takeOutbox,
} from "./syncPeerState";

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

describe("syncPeerState", () => {
  beforeEach(mockLocalStorage);

  it("starts at revision 0 with an empty outbox", () => {
    expect(peerRev(MACHINE)).toBe(0);
    expect(takeOutbox(MACHINE)).toEqual([]);
  });

  it("queues a local change with baseRev 0 for a record never seen before", () => {
    queueLocalChange(MACHINE, "group", "g1", { id: "g1", name: "Work", collapsed: false });
    expect(takeOutbox(MACHINE)).toEqual([
      { table: "group", id: "g1", baseRev: 0, value: { id: "g1", name: "Work", collapsed: false } },
    ]);
  });

  it("a second local edit before pushing replaces the value but keeps the original baseRev", () => {
    markPulled(MACHINE, [{ table: "group", id: "g1", rev: 5, value: { id: "g1", name: "Old", collapsed: false } }]);
    queueLocalChange(MACHINE, "group", "g1", { id: "g1", name: "First edit", collapsed: false });
    queueLocalChange(MACHINE, "group", "g1", { id: "g1", name: "Second edit", collapsed: false });
    expect(takeOutbox(MACHINE)).toEqual([
      { table: "group", id: "g1", baseRev: 5, value: { id: "g1", name: "Second edit", collapsed: false } },
    ]);
  });

  it("markPulled advances the peer revision and remembers each record's revision", () => {
    markPulled(MACHINE, [{ table: "group", id: "g1", rev: 2, value: null }]);
    expect(peerRev(MACHINE)).toBe(2);
    // A local edit made after this pull is based on the pulled revision.
    queueLocalChange(MACHINE, "group", "g1", { id: "g1", name: "New", collapsed: false });
    expect(takeOutbox(MACHINE)[0].baseRev).toBe(2);
  });

  it("applyPushResult returns rejected records to adopt and clears applied/rejected from the outbox", () => {
    queueLocalChange(MACHINE, "group", "g1", { id: "g1", name: "Mine", collapsed: false });
    queueLocalChange(MACHINE, "group", "g2", { id: "g2", name: "Also mine", collapsed: false });
    const sent = takeOutbox(MACHINE);
    const toAdopt = applyPushResult(
      MACHINE,
      {
        rev: 9,
        applied: [{ table: "group", id: "g2", rev: 9 }],
        rejected: [
          { table: "group", id: "g1", current: { table: "group", id: "g1", rev: 7, value: { id: "g1", name: "Theirs", collapsed: false } } },
        ],
      },
      sent,
    );
    expect(toAdopt).toEqual([{ table: "group", id: "g1", rev: 7, value: { id: "g1", name: "Theirs", collapsed: false } }]);
    expect(takeOutbox(MACHINE)).toEqual([]);
  });

  it("re-queueing a value identical to the last pulled value is a no-op", () => {
    const value = { id: "g1", name: "Same", collapsed: false };
    markPulled(MACHINE, [{ table: "group", id: "g1", rev: 3, value }]);
    queueLocalChange(MACHINE, "group", "g1", { ...value });
    expect(takeOutbox(MACHINE)).toEqual([]);
  });

  it("keeps an edit made while a push was in flight, rebased onto the applied revision", () => {
    queueLocalChange(MACHINE, "group", "g1", { id: "g1", name: "A", collapsed: false });
    const sent = takeOutbox(MACHINE);
    queueLocalChange(MACHINE, "group", "g1", { id: "g1", name: "B", collapsed: false });
    applyPushResult(MACHINE, { rev: 4, applied: [{ table: "group", id: "g1", rev: 4 }], rejected: [] }, sent);
    expect(takeOutbox(MACHINE)).toEqual([
      { table: "group", id: "g1", baseRev: 4, value: { id: "g1", name: "B", collapsed: false } },
    ]);
  });

  it("reverting an edit back to the host value keeps the entry with the reverted value", () => {
    const value = { id: "g1", name: "Host", collapsed: false };
    markPulled(MACHINE, [{ table: "group", id: "g1", rev: 2, value }]);
    queueLocalChange(MACHINE, "group", "g1", { id: "g1", name: "Edited", collapsed: false });
    queueLocalChange(MACHINE, "group", "g1", { ...value });
    expect(takeOutbox(MACHINE)).toEqual([{ table: "group", id: "g1", baseRev: 2, value }]);
  });

  it("keeps a revert made while a push was in flight", () => {
    const host = { id: "g1", name: "Host", collapsed: false };
    markPulled(MACHINE, [{ table: "group", id: "g1", rev: 2, value: host }]);
    queueLocalChange(MACHINE, "group", "g1", { id: "g1", name: "X", collapsed: false });
    const sent = takeOutbox(MACHINE);
    queueLocalChange(MACHINE, "group", "g1", { ...host });
    applyPushResult(MACHINE, { rev: 5, applied: [{ table: "group", id: "g1", rev: 5 }], rejected: [] }, sent);
    expect(takeOutbox(MACHINE)).toEqual([{ table: "group", id: "g1", baseRev: 5, value: host }]);
  });

  it("applyPushResult does not advance the pull watermark; setPeerRev is monotonic", () => {
    queueLocalChange(MACHINE, "group", "g1", { id: "g1", name: "A", collapsed: false });
    const sent = takeOutbox(MACHINE);
    applyPushResult(MACHINE, { rev: 9, applied: [{ table: "group", id: "g1", rev: 9 }], rejected: [] }, sent);
    expect(peerRev(MACHINE)).toBe(0);
    setPeerRev(MACHINE, 9);
    setPeerRev(MACHINE, 4);
    expect(peerRev(MACHINE)).toBe(9);
  });

  it("hasPendingOp and knownRecordIds report outbox and host state", () => {
    markPulled(MACHINE, [
      { table: "group", id: "g1", rev: 1, value: { id: "g1", name: "A", collapsed: false } },
      { table: "group", id: "g2", rev: 2, value: null },
    ]);
    expect(knownRecordIds(MACHINE, "group")).toEqual(["g1"]);
    expect(hasPendingOp(MACHINE, "group", "g1")).toBe(false);
    queueLocalChange(MACHINE, "group", "g1", { id: "g1", name: "B", collapsed: false });
    expect(hasPendingOp(MACHINE, "group", "g1")).toBe(true);
  });

  it("a rejected op with a newer pending edit keeps the edit rebased and adopts nothing", () => {
    queueLocalChange(MACHINE, "group", "g1", { id: "g1", name: "A", collapsed: false });
    const sent = takeOutbox(MACHINE);
    queueLocalChange(MACHINE, "group", "g1", { id: "g1", name: "B", collapsed: false });
    const current = { table: "group" as const, id: "g1", rev: 7, value: { id: "g1", name: "T", collapsed: false } };
    const adopted = applyPushResult(MACHINE, { rev: 7, applied: [], rejected: [{ table: "group", id: "g1", current }] }, sent);
    expect(adopted).toEqual([]);
    expect(takeOutbox(MACHINE)).toEqual([
      { table: "group", id: "g1", baseRev: 7, value: { id: "g1", name: "B", collapsed: false } },
    ]);
  });
});
