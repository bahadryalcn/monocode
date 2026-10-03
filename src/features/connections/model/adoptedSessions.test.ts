import { describe, expect, it, vi } from "vitest";
import type { Session } from "../../sessions/model/session";
import {
  desktopCopyOf,
  mergeAdoptedSession,
  mirrorAdoptedSessions,
  planAdoptedFetches,
  supportsAdoptedSessions,
  type AdoptedEntry,
} from "./adoptedSessions";
import type { HostSession } from "./protocol";

const block = (id: string) => ({ id, role: "user", text: id }) as never;
const local = (over: Partial<Session> = {}): Session =>
  ({
    id: "s1",
    harness: "claude",
    model: "old",
    modelSettings: {},
    runtimeMode: "ask",
    title: "Local",
    cwd: "C:/proj",
    worktreeCwd: "C:/proj/wt",
    blocks: [block("a")],
    ...over,
  }) as Session;
const host = (
  session: Partial<Session>,
  status: HostSession["status"] = "idle",
) =>
  ({
    session: {
      ...local(),
      cwd: "/other",
      worktreeCwd: undefined,
      blocks: [block("a"), block("b")],
      ...session,
    },
    projectId: "p",
    revision: 5,
    status,
    updatedAt: 10,
  }) as HostSession;
const entry = (over: Partial<AdoptedEntry> = {}): AdoptedEntry => ({
  id: "s1",
  projectId: "p",
  revision: 5,
  updatedAt: 10,
  status: "idle",
  ...over,
});

describe("planAdoptedFetches", () => {
  it("fetches loaded idle sessions whose revision moved", () => {
    expect(planAdoptedFetches([entry()], [local()], new Map())).toHaveLength(1);
    expect(
      planAdoptedFetches([entry()], [local()], new Map([["s1", 5]])),
    ).toHaveLength(0);
    expect(
      planAdoptedFetches(
        [entry({ revision: 6 })],
        [local()],
        new Map([["s1", 5]]),
      ),
    ).toHaveLength(1);
  });
  it("skips unloaded and busy sessions", () => {
    expect(
      planAdoptedFetches([entry({ id: "zz" })], [local()], new Map()),
    ).toHaveLength(0);
    expect(
      planAdoptedFetches([entry()], [local({ busy: true })], new Map()),
    ).toHaveLength(0);
  });
});

describe("mergeAdoptedSession", () => {
  it("rejects equal-length divergent text, and accepts a rewind only with an unchanged baseline", () => {
    const edited = local({
      blocks: [{ id: "a", role: "user", text: "new local" } as never],
    });
    expect(
      mergeAdoptedSession(edited, host({ blocks: [block("a")] })),
    ).toBeUndefined();
    const base = local({ blocks: [block("a"), block("b")] });
    expect(
      mergeAdoptedSession(base, host({ blocks: [block("a")] }), base)?.blocks,
    ).toEqual([block("a")]);
    expect(
      mergeAdoptedSession(edited, host({ blocks: [] }), base),
    ).toBeUndefined();
  });
  it("takes the transcript and keeps local identity", () => {
    const merged = mergeAdoptedSession(
      local(),
      host({ title: "Remote", model: "new", providerSessionId: "prov-2" }),
    )!;
    expect(merged.blocks).toHaveLength(2);
    expect(merged.title).toBe("Remote");
    expect(merged.model).toBe("new");
    expect(merged.providerSessionId).toBe("prov-2");
    expect(merged.cwd).toBe("C:/proj");
    expect(merged.worktreeCwd).toBe("C:/proj/wt");
    expect(merged.continuingElsewhere).toBeUndefined();
  });
  it("holds sending while the host runs", () => {
    expect(
      mergeAdoptedSession(local(), host({}, "running"))!.continuingElsewhere,
    ).toBe(true);
  });
  it("does not drop newer local turns", () => {
    const longer = local({ blocks: [block("a"), block("b"), block("c")] });
    expect(mergeAdoptedSession(longer, host({}))).toBeUndefined();
  });
});

describe("mirrorAdoptedSessions", () => {
  it("retains a conflicting local edit and does not mark a rejected revision mirrored", async () => {
    const mirrored = new Map<string, number>();
    const current = local({
      blocks: [{ id: "a", role: "user", text: "edited here" } as never],
    });
    const conflict = vi.fn();
    const apply = vi.fn();
    await mirrorAdoptedSessions({
      list: async () => [entry()],
      load: async () => host({ blocks: [block("a")] }),
      local: () => [current],
      apply,
      mirrored,
      conflict,
    });
    expect(apply).not.toHaveBeenCalled();
    expect(conflict).toHaveBeenCalledWith(current);
    expect(mirrored.has("s1")).toBe(false);
  });

  it("checks edits made while the snapshot is in flight and accepts an unchanged-baseline reset", async () => {
    let current = local();
    let revision = 5;
    let next = host({});
    const mirrored = new Map<string, number>();
    const deps = {
      list: async () => [entry({ revision })],
      load: async () => next,
      local: () => [current],
      apply: (merged: Session) => {
        current = merged;
      },
      mirrored,
    };
    await mirrorAdoptedSessions(deps);
    expect(current.blocks).toHaveLength(2);
    revision = 6;
    next = { ...host({ blocks: [] }), revision };
    await mirrorAdoptedSessions(deps);
    expect(current.blocks).toEqual([]);
    revision = 7;
    const conflict = vi.fn();
    await mirrorAdoptedSessions({
      ...deps,
      conflict,
      load: async () => {
        current = { ...current, blocks: [block("new local")] };
        return { ...host({}), revision };
      },
    });
    expect(current.blocks).toEqual([block("new local")]);
    expect(mirrored.get("s1")).toBe(6);
    expect(conflict).toHaveBeenCalledTimes(1);
  });

  it("does not mark a closed conflicting session or a failed adoption caught up", async () => {
    const mirrored = new Map<string, number>();
    const save = vi.fn();
    await mirrorAdoptedSessions({
      list: async () => [entry()],
      load: async () => host({ blocks: [] }),
      local: () => [],
      apply: vi.fn(),
      mirrored,
      stored: async () => local(),
      save,
    });
    expect(save).not.toHaveBeenCalled();
    expect(mirrored.has("s1")).toBe(false);
    await mirrorAdoptedSessions({
      list: async () => [entry()],
      load: async () => host({}),
      local: () => [],
      apply: vi.fn(),
      mirrored,
      stored: async () => null,
      save,
      adopt: async () => false,
    });
    expect(mirrored.has("s1")).toBe(false);
  });
  it("applies once per revision and reports running ids", async () => {
    const mirrored = new Map<string, number>();
    const apply = vi.fn();
    const load = vi.fn(async () => host({}, "running"));
    const deps = {
      list: async () => [entry({ status: "running" })],
      load,
      local: () => [local()],
      apply,
      mirrored,
    };
    expect([...(await mirrorAdoptedSessions(deps))]).toEqual(["s1"]);
    expect(apply).toHaveBeenCalledTimes(1);
    await mirrorAdoptedSessions(deps);
    expect(load).toHaveBeenCalledTimes(1);
  });
  it("does not apply when the session turned busy during the fetch", async () => {
    let busy = false;
    const apply = vi.fn();
    await mirrorAdoptedSessions({
      list: async () => [entry()],
      load: async () => {
        busy = true;
        return host({});
      },
      local: () => [local({ busy })],
      apply,
      mirrored: new Map(),
    });
    expect(apply).not.toHaveBeenCalled();
  });
  it("catches up a closed session in storage, once per revision", async () => {
    const save = vi.fn(async () => {});
    const stored = vi.fn(async () => local());
    const deps = {
      list: async () => [
        entry(),
        entry({ id: "busy", status: "running" as const }),
      ],
      load: async () => host({}),
      local: () => [],
      apply: vi.fn(),
      mirrored: new Map<string, number>(),
      stored,
      save,
    };
    await mirrorAdoptedSessions(deps);
    await mirrorAdoptedSessions(deps);
    // Once each: the running one only to learn it is already stored here.
    expect(stored.mock.calls.map(([id]) => id)).toEqual(["s1", "s1", "busy"]);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]).toMatchObject([
      { id: "s1", cwd: "C:/proj", blocks: [{ id: "a" }, { id: "b" }] },
    ]);
  });
});

describe("sessions started on this machine's host from another computer", () => {
  it("are saved here once, even while their turn runs", async () => {
    const adopt = vi.fn(async () => {});
    const deps = {
      list: async () => [entry({ id: "new", status: "running" as const })],
      load: vi.fn(async () => host({})),
      local: () => [],
      apply: vi.fn(),
      mirrored: new Map<string, number>(),
      stored: vi.fn(async () => null),
      save: vi.fn(async () => {}),
      adopt,
    };
    await mirrorAdoptedSessions(deps);
    await mirrorAdoptedSessions(deps);
    expect(adopt).toHaveBeenCalledTimes(1);
    expect(adopt).toHaveBeenCalledWith(expect.objectContaining({ id: "new" }));
    expect(deps.save).not.toHaveBeenCalled();
  });

  it("then catch up like any shared session once the turn ends", async () => {
    const save = vi.fn(async () => {});
    const adopt = vi.fn(async () => {});
    await mirrorAdoptedSessions({
      list: async () => [entry({ revision: 7 })],
      load: async () => host({ title: "Finished" }),
      local: () => [],
      apply: vi.fn(),
      mirrored: new Map([["s1", 5]]),
      stored: async () => local(),
      save,
      adopt,
    });
    expect(adopt).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Finished" }),
    );
  });

  it("are filed under the project folder, with the host's working copy as worktree", () => {
    const same = (a: string, b: string) => a === b;
    const inProject = desktopCopyOf(
      host({ id: "h1", cwd: "/Users/me/clinic", busy: true }, "running"),
      "/Users/me/clinic",
      same,
    );
    expect(inProject).toMatchObject({
      id: "h1",
      cwd: "/Users/me/clinic",
      worktreeCwd: undefined,
      continuingElsewhere: true,
    });
    expect(inProject.busy).toBeUndefined();
    const inWorktree = desktopCopyOf(
      host({ cwd: "/Users/me/clinic-worktrees/fix" }),
      "/Users/me/clinic",
      same,
    );
    expect(inWorktree).toMatchObject({
      cwd: "/Users/me/clinic",
      worktreeCwd: "/Users/me/clinic-worktrees/fix",
    });
    expect(inWorktree.continuingElsewhere).toBeUndefined();
  });
});

it("needs the sessions.desktop capability", () => {
  expect(supportsAdoptedSessions(["sync"])).toBe(false);
  expect(supportsAdoptedSessions(["sessions.desktop"])).toBe(true);
  expect(supportsAdoptedSessions(undefined)).toBe(false);
});
