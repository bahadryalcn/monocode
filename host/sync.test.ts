import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { HostStore } from "./store";
import { syncPull, syncPush } from "./sync";

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function setup() {
  const directory = mkdtempSync(join(tmpdir(), "monocode-sync-test-"));
  const store = new HostStore(join(directory, "host.db"));
  cleanups.push(() => {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return store;
}

describe("syncPush / syncPull", () => {
  it("accepts a brand-new record and reports it as applied", () => {
    const store = setup();
    const result = syncPush(store.db, [
      { table: "group", id: "g1", baseRev: 0, value: { id: "g1", name: "Work", collapsed: false } },
    ]);
    expect(result.rejected).toEqual([]);
    expect(result.applied).toEqual([{ table: "group", id: "g1", rev: result.rev }]);
  });

  it("accepts a groupOrder op", () => {
    const store = setup();
    const result = syncPush(store.db, [
      { table: "groupOrder", id: "groups", baseRev: 0, value: { order: ["g1", "g2"] } },
    ]);
    expect(result.rejected).toEqual([]);
    expect(result.applied).toHaveLength(1);
  });

  it("rejects a push based on a stale revision and returns the current value", () => {
    const store = setup();
    const first = syncPush(store.db, [
      { table: "group", id: "g1", baseRev: 0, value: { id: "g1", name: "Work", collapsed: false } },
    ]);
    const firstRev = first.applied[0].rev;
    // A second push based on revision 0 again, after the record moved to firstRev.
    const second = syncPush(store.db, [
      { table: "group", id: "g1", baseRev: 0, value: { id: "g1", name: "Renamed", collapsed: false } },
    ]);
    expect(second.applied).toEqual([]);
    expect(second.rejected).toEqual([
      {
        table: "group",
        id: "g1",
        current: { table: "group", id: "g1", rev: firstRev, value: { id: "g1", name: "Work", collapsed: false } },
      },
    ]);
  });

  it("accepts a push based on the current revision, bumping it further", () => {
    const store = setup();
    const first = syncPush(store.db, [
      { table: "group", id: "g1", baseRev: 0, value: { id: "g1", name: "Work", collapsed: false } },
    ]);
    const second = syncPush(store.db, [
      {
        table: "group",
        id: "g1",
        baseRev: first.applied[0].rev,
        value: { id: "g1", name: "Renamed", collapsed: false },
      },
    ]);
    expect(second.rejected).toEqual([]);
    expect(second.applied[0].rev).toBeGreaterThan(first.applied[0].rev);
  });

  it("a tombstone (value: null) deletes the record", () => {
    const store = setup();
    const first = syncPush(store.db, [
      { table: "group", id: "g1", baseRev: 0, value: { id: "g1", name: "Work", collapsed: false } },
    ]);
    syncPush(store.db, [{ table: "group", id: "g1", baseRev: first.applied[0].rev, value: null }]);
    const pulled = syncPull(store.db, 0);
    expect(pulled.records.at(-1)).toMatchObject({ table: "group", id: "g1", value: null });
  });

  it("syncPull returns only records newer than the given revision, in order", () => {
    const store = setup();
    syncPush(store.db, [
      { table: "group", id: "g1", baseRev: 0, value: { id: "g1", name: "A", collapsed: false } },
    ]);
    const after = syncPull(store.db, 0).rev;
    syncPush(store.db, [
      { table: "group", id: "g2", baseRev: 0, value: { id: "g2", name: "B", collapsed: false } },
    ]);
    const pulled = syncPull(store.db, after);
    expect(pulled.records).toHaveLength(1);
    expect(pulled.records[0].id).toBe("g2");
  });

  it("two different records can be pushed in one call independently of each other", () => {
    const store = setup();
    const result = syncPush(store.db, [
      { table: "group", id: "g1", baseRev: 0, value: { id: "g1", name: "A", collapsed: false } },
      { table: "assignment", id: "p1", baseRev: 0, value: { projectId: "p1", groupId: "g1" } },
    ]);
    expect(result.applied).toHaveLength(2);
  });

  it("skips malformed ops without throwing while valid ops in the batch still apply", () => {
    const store = setup();
    const group = { id: "g1", name: "A", collapsed: false };
    const ops = [
      null,
      { table: "nope", id: "x", baseRev: 0, value: null },
      { table: "group", id: "", baseRev: 0, value: null },
      { table: "group", id: "x".repeat(201), baseRev: 0, value: null },
      { table: "group", id: "g", baseRev: -1, value: null },
      { table: "group", id: "g", baseRev: 1.5, value: null },
      { table: "group", id: "g", baseRev: 0, value: [] },
      { table: "group", id: "g", baseRev: 0, value: "str" },
      { table: "group", id: "g", baseRev: 0, value: { big: "x".repeat(70 * 1024) } },
      { table: "group", id: "g1", baseRev: 0, value: group },
    ] as unknown as Parameters<typeof syncPush>[1];
    const result = syncPush(store.db, ops);
    expect(result.rejected).toEqual([]);
    expect(result.applied).toHaveLength(1);
    expect(result.applied[0].id).toBe("g1");
  });

  it("a corrupt stored row does not break pull and can be overwritten by a push", () => {
    const store = setup();
    store.db
      .prepare("INSERT INTO sync_records (table_name, id, value, rev, updated_at) VALUES ('group', 'bad', '{bad', 7, 0)")
      .run();
    syncPush(store.db, [
      { table: "group", id: "g1", baseRev: 0, value: { id: "g1", name: "A", collapsed: false } },
    ]);
    const pulled = syncPull(store.db, 0);
    expect(pulled.records.map((record) => record.id)).toEqual(["g1"]);
    const result = syncPush(store.db, [
      { table: "group", id: "bad", baseRev: 7, value: { id: "bad", name: "Fixed", collapsed: false } },
    ]);
    expect(result.rejected).toEqual([]);
    expect(result.applied).toHaveLength(1);
    expect(syncPull(store.db, 0).records.map((record) => record.id)).toContain("bad");
  });
});
