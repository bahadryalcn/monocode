import { describe, expect, it, vi } from "vitest";
import type { Session } from "../../sessions/model/session";
import {
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
const host = (session: Partial<Session>, status: HostSession["status"] = "idle") =>
  ({
    session: { ...local(), cwd: "/other", worktreeCwd: undefined, blocks: [block("a"), block("b")], ...session },
    projectId: "p",
    revision: 5,
    status,
    updatedAt: 10,
  }) as HostSession;
const entry = (over: Partial<AdoptedEntry> = {}): AdoptedEntry => ({
  id: "s1", projectId: "p", revision: 5, updatedAt: 10, status: "idle", ...over,
});

describe("planAdoptedFetches", () => {
  it("fetches loaded idle sessions whose revision moved", () => {
    expect(planAdoptedFetches([entry()], [local()], new Map())).toHaveLength(1);
    expect(planAdoptedFetches([entry()], [local()], new Map([["s1", 5]]))).toHaveLength(0);
    expect(planAdoptedFetches([entry({ revision: 6 })], [local()], new Map([["s1", 5]]))).toHaveLength(1);
  });
  it("skips unloaded and busy sessions", () => {
    expect(planAdoptedFetches([entry({ id: "zz" })], [local()], new Map())).toHaveLength(0);
    expect(planAdoptedFetches([entry()], [local({ busy: true })], new Map())).toHaveLength(0);
  });
});

describe("mergeAdoptedSession", () => {
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
    expect(mergeAdoptedSession(local(), host({}, "running"))!.continuingElsewhere).toBe(true);
  });
  it("does not drop newer local turns", () => {
    const longer = local({ blocks: [block("a"), block("b"), block("c")] });
    expect(mergeAdoptedSession(longer, host({}))).toBeUndefined();
  });
});

describe("mirrorAdoptedSessions", () => {
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
      list: async () => [entry(), entry({ id: "busy", status: "running" as const })],
      load: async () => host({}),
      local: () => [],
      apply: vi.fn(),
      mirrored: new Map<string, number>(),
      stored,
      save,
    };
    await mirrorAdoptedSessions(deps);
    await mirrorAdoptedSessions(deps);
    expect(stored).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]).toMatchObject([
      { id: "s1", cwd: "C:/proj", blocks: [{ id: "a" }, { id: "b" }] },
    ]);
  });
});

it("needs the sessions.desktop capability", () => {
  expect(supportsAdoptedSessions(["sync"])).toBe(false);
  expect(supportsAdoptedSessions(["sessions.desktop"])).toBe(true);
  expect(supportsAdoptedSessions(undefined)).toBe(false);
});
