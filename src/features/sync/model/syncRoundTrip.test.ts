import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pathKey } from "../../../shared/lib/paths";

const HOST = "host-1";

/** What the desktop's Rust transport does to every JSON value passing
 * through it: object keys come out alphabetically sorted. */
function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => [key, sortDeep(item)]),
  );
}

const throughTransport = (value: unknown): any => sortDeep(JSON.parse(JSON.stringify(value)));

type Row = { table: string; id: string; rev: number; value: unknown };

/** A deliberately naive host: every accepted op bumps the revision, even a
 * redundant one, so a stable revision proves the clients stopped pushing. */
function fakeHost() {
  let rev = 0;
  const rows = new Map<string, Row>();
  const pushedOps: { table: string; id: string; value: unknown }[] = [];
  const request = async (method: string, rawParams: unknown): Promise<unknown> => {
    const params = throughTransport(rawParams);
    if (method === "sync.pull") {
      const records = [...rows.values()].filter((row) => row.rev > params.sinceRev).sort((a, b) => a.rev - b.rev);
      return throughTransport({ rev, records });
    }
    const applied: unknown[] = [];
    const rejected: unknown[] = [];
    for (const op of params.ops) {
      pushedOps.push(op);
      const key = `${op.table}:${op.id}`;
      const existing = rows.get(key);
      if ((existing?.rev ?? 0) !== op.baseRev) {
        rejected.push({
          table: op.table,
          id: op.id,
          current: existing ?? { table: op.table, id: op.id, rev: 0, value: null },
        });
        continue;
      }
      rev += 1;
      rows.set(key, { table: op.table, id: op.id, rev, value: op.value });
      applied.push({ table: op.table, id: op.id, rev });
    }
    return throughTransport({ rev, applied, rejected });
  };
  return {
    request,
    rev: () => rev,
    pushedOps,
    value: (table: string, id: string) => rows.get(`${table}:${id}`)?.value,
    tables: () => new Set([...rows.values()].map((row) => row.table)),
  };
}

/** One desktop: its own localStorage and its own instances of every module
 * that keeps state in memory (machine id, lock settings). */
async function makeDesktop(machineId: string) {
  const data = new Map<string, string>([["monocode.sync.machineId", machineId]]);
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
  const use = () => Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
  use();
  vi.resetModules();
  const client = await import("./syncClient");
  const groups = await import("../../projects/model/projectGroups");
  const recents = await import("../../projects/model/recents");
  const lock = await import("../../group-lock/model/groupLock");
  const projects = await import("./syncProjects");
  const remoteProjects = await import("./syncRemoteProjects");
  const cycle = async (host: ReturnType<typeof fakeHost>) => {
    use();
    await client.runSyncCycle(HOST, host.request);
  };
  const assignmentFor = (path: string) => {
    use();
    return groups.loadProjectGroupAssignments()[pathKey(path)];
  };
  return { use, cycle, assignmentFor, groups, recents, lock, projects, remoteProjects };
}

describe("sync over a key-sorting transport", () => {
  beforeEach(() => {
    vi.stubGlobal("crypto", {
      getRandomValues: (array: Uint8Array) => array.fill(7),
      subtle: {
        importKey: async () => "key",
        deriveBits: async () => new Uint8Array(32).fill(1),
      },
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("one desktop pushes once and then stays silent", async () => {
    const host = fakeHost();
    const a = await makeDesktop("machine-a");
    a.recents.rememberProject("/home/a/code/app");
    a.recents.rememberProject("/home/a/code/site");
    a.recents.saveProjectRailOrder(["/home/a/code/site", "/home/a/code/app"]);
    a.recents.savePinnedProjects(["/home/a/code/app"]);
    a.groups.saveProjectGroups([
      { id: "g1", name: "Work", collapsed: true, colorIndex: 2, lockable: true },
      { id: "g2", name: "Home", collapsed: false },
    ]);
    a.groups.saveProjectGroupAssignments({ [pathKey("/home/a/code/app")]: "g1" });
    await a.lock.setLockPassword("correct horse battery staple");

    await a.cycle(host);
    const revAfterFirst = host.rev();
    const opsAfterFirst = host.pushedOps.length;
    expect(host.tables()).toEqual(
      new Set(["project", "projectPath", "group", "assignment", "railLayout", "groupOrder", "lock"]),
    );

    await a.cycle(host);
    await a.cycle(host);
    await a.cycle(host);
    expect(host.pushedOps.length).toBe(opsAfterFirst);
    expect(host.rev()).toBe(revAfterFirst);
  });

  it("two desktops converge and then stop writing (no ping-pong)", async () => {
    const host = fakeHost();
    const a = await makeDesktop("machine-a");
    a.recents.rememberProject("/home/a/code/app");
    a.recents.rememberProject("/home/a/code/site");
    a.recents.saveProjectRailOrder(["/home/a/code/site", "/home/a/code/app"]);
    a.recents.savePinnedProjects(["/home/a/code/app"]);
    a.groups.saveProjectGroups([{ id: "g1", name: "Work", collapsed: true, colorIndex: 2 }]);
    a.groups.saveProjectGroupAssignments({ [pathKey("/home/a/code/app")]: "g1" });
    await a.lock.setLockPassword("correct horse battery staple");

    const b = await makeDesktop("machine-b");
    b.recents.rememberProject("C:/work/app");
    b.recents.rememberProject("C:/work/tool");
    b.recents.saveProjectRailOrder(["C:/work/tool", "C:/work/app"]);
    b.groups.saveProjectGroups([{ id: "g2", name: "Home", collapsed: false, mascot: undefined }]);
    b.groups.saveProjectGroupAssignments({ [pathKey("C:/work/tool")]: "g2" });

    for (let round = 0; round < 3; round += 1) {
      await a.cycle(host);
      await b.cycle(host);
    }
    const settledRev = host.rev();
    const settledOps = host.pushedOps.length;
    const layout = host.value("railLayout", "rail");
    const order = host.value("groupOrder", "groups");

    for (let round = 0; round < 3; round += 1) {
      await a.cycle(host);
      await b.cycle(host);
    }
    expect(host.pushedOps.slice(settledOps)).toEqual([]);
    expect(host.rev()).toBe(settledRev);
    expect(host.value("railLayout", "rail")).toEqual(layout);
    expect(host.value("groupOrder", "groups")).toEqual(order);

    // Both libraries hold the union, and neither machine's data was dropped.
    a.use();
    expect(a.groups.loadProjectGroups().map((group) => group.id).sort()).toEqual(["g1", "g2"]);
    expect(a.groups.loadProjectGroups().find((group) => group.id === "g1")?.collapsed).toBe(true);
    expect(a.lock.getGroupLockView().hasPassword).toBe(true);
    b.use();
    expect(b.groups.loadProjectGroups().map((group) => group.id).sort()).toEqual(["g1", "g2"]);
    expect(b.groups.loadProjectGroups().find((group) => group.id === "g1")?.collapsed).toBe(false);
    expect(b.lock.getGroupLockView().hasPassword).toBe(true);
    expect(a.assignmentFor("/home/a/code/app")).toBe("g1");
    expect(b.assignmentFor("C:/work/app")).toBe("g1");
    expect(b.assignmentFor("C:/work/tool")).toBe("g2");
    expect(host.value("group", "g1")).not.toHaveProperty("collapsed");
    expect((host.value("railLayout", "rail") as { order: string[] }).order.sort()).toEqual([
      "name:app",
      "name:site",
      "name:tool",
    ]);
    expect((host.value("groupOrder", "groups") as { order: string[] }).order.sort()).toEqual(["g1", "g2"]);
  });

  it("a machine without an assignment syncing first does not delete the other machine's membership", async () => {
    const host = fakeHost();
    const a = await makeDesktop("machine-a");
    a.recents.rememberProject("/home/a/code/app");
    a.groups.saveProjectGroups([{ id: "g1", name: "Work", collapsed: false }]);
    a.groups.saveProjectGroupAssignments({ [pathKey("/home/a/code/app")]: "g1" });
    const b = await makeDesktop("machine-b");
    b.recents.rememberProject("C:/work/app");

    await b.cycle(host);
    expect(host.pushedOps.some((op) => op.table === "assignment")).toBe(false);
    for (let round = 0; round < 3; round += 1) {
      await a.cycle(host);
      await b.cycle(host);
    }
    expect(host.value("assignment", "name:app")).toEqual({ groupId: "g1", projectId: "name:app" });
    expect(a.assignmentFor("/home/a/code/app")).toBe("g1");
    expect(b.assignmentFor("C:/work/app")).toBe("g1");
  });

  it("an empty desktop joining later keeps the host's layout and group order", async () => {
    const host = fakeHost();
    const a = await makeDesktop("machine-a");
    a.recents.rememberProject("/home/a/code/app");
    a.recents.saveProjectRailOrder(["/home/a/code/app"]);
    a.recents.savePinnedProjects(["/home/a/code/app"]);
    a.groups.saveProjectGroups([{ id: "g1", name: "Work", collapsed: false }]);
    await a.cycle(host);
    await a.cycle(host);
    const layout = host.value("railLayout", "rail");
    const order = host.value("groupOrder", "groups");
    expect(layout).toEqual({ order: ["name:app"], pinned: ["name:app"] });

    const b = await makeDesktop("machine-b");
    await b.cycle(host);
    await b.cycle(host);
    expect(host.value("railLayout", "rail")).toEqual(layout);
    expect(host.value("groupOrder", "groups")).toEqual(order);
  });

  it("a project on a connected machine arrives as a remote project in its group and rail slot", async () => {
    const host = fakeHost();
    const a = await makeDesktop("machine-a");
    a.projects.setLocalHostEnvironmentId("env-a");
    a.recents.rememberProject("/home/a/code/app");
    a.recents.rememberProject("/home/a/code/site");
    a.recents.saveProjectRailOrder(["/home/a/code/site", "/home/a/code/app"]);
    a.recents.savePinnedProjects(["/home/a/code/app"]);
    a.groups.saveProjectGroups([{ id: "g1", name: "Work", collapsed: false }]);
    a.groups.saveProjectGroupAssignments({ [pathKey("/home/a/code/app")]: "g1" });

    const b = await makeDesktop("machine-b");
    b.recents.rememberProject("C:/work/tool");
    b.recents.saveProjectRailOrder(["C:/work/tool"]);
    const opened: string[] = [];
    b.remoteProjects.setRemoteOpenTargets([
      {
        environmentId: "env-a",
        name: "Windows PC",
        request: async (method, params) => {
          const { cwd } = params as { cwd: string };
          opened.push(`${method} ${cwd}`);
          return { id: `host-${cwd}`, cwd, name: cwd.split("/").pop() };
        },
      },
    ]);

    for (let round = 0; round < 3; round += 1) {
      await a.cycle(host);
      await b.cycle(host);
    }
    const settledRev = host.rev();
    const settledOps = host.pushedOps.length;
    for (let round = 0; round < 3; round += 1) {
      await a.cycle(host);
      await b.cycle(host);
    }
    expect(host.pushedOps.slice(settledOps)).toEqual([]);
    expect(host.rev()).toBe(settledRev);

    const app = "remote://env-a/home/a/code/app";
    const site = "remote://env-a/home/a/code/site";
    b.use();
    expect(b.recents.loadRecents().map((item) => item.path).sort()).toEqual(["C:/work/tool", app, site]);
    expect(opened.sort()).toEqual(["projects.open /home/a/code/app", "projects.open /home/a/code/site"]);
    expect(b.assignmentFor(app)).toBe("g1");
    expect(b.assignmentFor(site)).toBeUndefined();
    expect(b.recents.loadPinnedProjects()).toEqual([app]);
    const order = b.recents.loadProjectRailOrder();
    expect(order.indexOf(site)).toBeGreaterThanOrEqual(0);
    expect(order.indexOf(site)).toBeLessThan(order.indexOf(app));
    expect(b.projects.remoteOnlyProjects()).toEqual([]);

    // The folder is only on A: B never claims a path for it, and A's data is intact.
    expect(host.value("projectPath", "name:app:machine-a")).toMatchObject({ hostEnvironmentId: "env-a" });
    expect(host.value("projectPath", "name:app:machine-b")).toBeUndefined();
    expect(host.value("assignment", "name:app")).toEqual({ groupId: "g1", projectId: "name:app" });
    expect(host.value("railLayout", "rail")).toEqual({
      order: ["name:site", "name:app", "name:tool"],
      pinned: ["name:app"],
    });
    expect(a.assignmentFor("/home/a/code/app")).toBe("g1");

    // An edit made on B's remote project reaches the machine where it is local.
    b.use();
    b.groups.saveProjectGroups([...b.groups.loadProjectGroups(), { id: "g2", name: "Side", collapsed: false }]);
    b.groups.setProjectGroupAssignment(app, "g2");
    for (let round = 0; round < 2; round += 1) {
      await b.cycle(host);
      await a.cycle(host);
    }
    expect(a.assignmentFor("/home/a/code/app")).toBe("g2");

    // Removing it on B is remembered: it is not added again, and A keeps its group.
    b.use();
    b.recents.forgetProject(app);
    const revBeforeRemoval = host.rev();
    for (let round = 0; round < 3; round += 1) {
      await b.cycle(host);
      await a.cycle(host);
    }
    b.use();
    expect(b.recents.loadRecents().map((item) => item.path)).not.toContain(app);
    expect(b.projects.remoteOnlyProjects()).toEqual([]);
    expect(opened).toHaveLength(2);
    expect(a.assignmentFor("/home/a/code/app")).toBe("g2");
    expect(host.value("assignment", "name:app")).toEqual({ groupId: "g2", projectId: "name:app" });
    const revAfterRemoval = host.rev();
    await b.cycle(host);
    await a.cycle(host);
    expect(host.rev()).toBe(revAfterRemoval);
    expect(revAfterRemoval - revBeforeRemoval).toBeLessThanOrEqual(1);
  });

  it("a folder one desktop opened remotely becomes a local project on the machine that holds it", async () => {
    const host = fakeHost();
    const remote = "remote://env-m/Users/me/projects/clinic";
    const local = "/Users/me/projects/clinic";
    const opened: string[] = [];
    const target = (environmentId: string) => ({
      environmentId,
      name: environmentId,
      request: async (method: string, params: unknown) => {
        const { cwd } = params as { cwd: string };
        opened.push(`${environmentId} ${method} ${cwd}`);
        return { id: `host-${cwd}`, cwd, name: "clinic" };
      },
    });

    const w = await makeDesktop("machine-w");
    w.projects.setLocalHostEnvironmentId("env-w");
    w.remoteProjects.setRemoteOpenTargets([target("env-m")]);
    w.recents.rememberProject(remote);
    w.recents.rememberProject("C:/work/tool");
    w.recents.saveProjectRailOrder([remote, "C:/work/tool"]);
    w.groups.saveProjectGroups([{ id: "g", name: "Clients", collapsed: false }]);
    w.groups.saveProjectGroupAssignments({ [pathKey(remote)]: "g" });

    const m = await makeDesktop("machine-m");
    m.projects.setLocalHostEnvironmentId("env-m");
    m.remoteProjects.setRemoteOpenTargets([target("env-w")]);

    for (let round = 0; round < 4; round += 1) {
      await w.cycle(host);
      await m.cycle(host);
    }
    const settledRev = host.rev();
    const settledOps = host.pushedOps.length;
    for (let round = 0; round < 3; round += 1) {
      await w.cycle(host);
      await m.cycle(host);
    }
    expect(host.pushedOps.slice(settledOps)).toEqual([]);
    expect(host.rev()).toBe(settledRev);

    expect(host.value("projectPath", "name:clinic:env:env-m")).toEqual({
      archived: false,
      hostEnvironmentId: "env-m",
      machineId: "env:env-m",
      path: local,
      projectId: "name:clinic",
    });
    expect(host.value("projectPath", "name:clinic:machine-m")).toMatchObject({ path: local, hostEnvironmentId: "env-m" });
    expect(host.value("projectPath", "name:clinic:machine-w")).toBeUndefined();

    // M holds the folder, so it gets a local project in W's group; W's tool is opened remotely.
    m.use();
    expect(m.recents.loadRecents().map((item) => item.path).sort()).toEqual([local, "remote://env-w/C:/work/tool"]);
    expect(m.assignmentFor(local)).toBe("g");
    expect(m.projects.remoteOnlyProjects()).toEqual([]);
    const order = m.recents.loadProjectRailOrder();
    expect(order.indexOf(local)).toBeGreaterThanOrEqual(0);
    expect(order.indexOf(local)).toBeLessThan(order.indexOf("remote://env-w/C:/work/tool"));
    expect(opened).toEqual(["env-w projects.open C:/work/tool"]);

    w.use();
    expect(w.recents.loadRecents().map((item) => item.path).sort()).toEqual(["C:/work/tool", remote]);
    expect(w.projects.remoteOnlyProjects()).toEqual([]);
    expect(w.assignmentFor(remote)).toBe("g");

    // Removing it on M is remembered: it is not adopted again, and W keeps its project.
    m.use();
    m.recents.forgetProject(local);
    for (let round = 0; round < 3; round += 1) {
      await m.cycle(host);
      await w.cycle(host);
    }
    m.use();
    expect(m.recents.loadRecents().map((item) => item.path)).toEqual(["remote://env-w/C:/work/tool"]);
    expect(m.projects.remoteOnlyProjects()).toEqual([]);
    expect(m.projects.locallyAdoptableProjects()).toEqual([]);
    w.use();
    expect(w.recents.loadRecents().map((item) => item.path).sort()).toEqual(["C:/work/tool", remote]);
    expect(w.assignmentFor(remote)).toBe("g");
    expect(opened).toHaveLength(1);
    const revAfterRemoval = host.rev();
    await m.cycle(host);
    await w.cycle(host);
    expect(host.rev()).toBe(revAfterRemoval);
  });
});
