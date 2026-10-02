import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyRemoteProjectRecords,
  captureLocalProjectChanges,
  dedupeProjectPaths,
  envMachineId,
  isEnvMachineId,
  locallyAdoptableProjects,
  localPathKeyForProjectId,
  linkLocalPathToProject,
  localProjectIdsByPath,
  mergeRailLayout,
  remoteOnlyProjects,
  setLocalHostEnvironmentId,
} from "./syncProjects";
import { markAutoAdded } from "./syncAutoAdded";
import { pathKey } from "../../../shared/lib/paths";
import {
  loadProjectGroupAssignments,
  saveProjectGroupAssignments,
  saveProjectGroups,
} from "../../projects/model/projectGroups";
import { applyPushResult, markPullCompleted, markPulled, takeOutbox } from "./syncPeerState";
import { localMachineId } from "./syncMachineId";
import { archiveProject, forgetProject, loadProjectRailOrder, loadRecents, loadPinnedProjects, rememberProject, savePinnedProjects, saveProjectRailOrder } from "../../projects/model/recents";

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

describe("syncProjects", () => {
  beforeEach(mockLocalStorage);

  it("captures a new local project as a project + projectPath op, keyed by this machine's id", () => {
    rememberProject("/home/me/code/app");
    captureLocalProjectChanges(MACHINE);
    const ops = takeOutbox(MACHINE);
    const pathOp = ops.find((op) => op.table === "projectPath");
    expect(pathOp?.value).toMatchObject({ machineId: localMachineId(), path: "/home/me/code/app", archived: false });
    expect(ops.some((op) => op.table === "project")).toBe(true);
  });

  it("captures the rail order as a railLayout op", () => {
    rememberProject("/home/me/code/app");
    saveProjectRailOrder(["/home/me/code/app"]);
    captureLocalProjectChanges(MACHINE);
    // Not before the first pull: the host may hold a richer layout.
    expect(takeOutbox(MACHINE).some((op) => op.table === "railLayout")).toBe(false);
    markPullCompleted(MACHINE);
    captureLocalProjectChanges(MACHINE);
    const layout = takeOutbox(MACHINE).find((op) => op.table === "railLayout");
    const id = Object.values(localProjectIdsByPath())[0];
    expect(layout?.value).toEqual({ order: [id], pinned: [] });
  });

  it("does not re-queue a project whose path is already captured for this machine", () => {
    rememberProject("/home/me/code/app");
    captureLocalProjectChanges(MACHINE);
    captureLocalProjectChanges(MACHINE);
    const pathOps = takeOutbox(MACHINE).filter((op) => op.table === "projectPath");
    expect(pathOps).toHaveLength(1);
  });

  it("applying a railLayout record from the peer updates the local rail order", () => {
    rememberProject("/home/me/code/app");
    captureLocalProjectChanges(MACHINE);
    const id = Object.values(localProjectIdsByPath())[0];
    applyRemoteProjectRecords(MACHINE, [
      { table: "railLayout", id: "rail", rev: 1, value: { order: ["unknown-id", id], pinned: [] } },
    ]);
    expect(loadProjectRailOrder()).toEqual(["/home/me/code/app"]);
  });

  it("resolves a projectId back to its local path key", () => {
    rememberProject("/home/me/code/app");
    captureLocalProjectChanges(MACHINE);
    const [[key, id]] = Object.entries(localProjectIdsByPath());
    expect(localPathKeyForProjectId(id)).toBe(key);
    expect(localPathKeyForProjectId("nope")).toBeUndefined();
  });

  it("keeps a project's createdAt stable across captures", () => {
    rememberProject("/home/me/code/app");
    captureLocalProjectChanges(MACHINE);
    const first = takeOutbox(MACHINE).find((op) => op.table === "project")!.value as { createdAt: number };
    const spy = vi.spyOn(Date, "now").mockReturnValue(first.createdAt + 100000);
    captureLocalProjectChanges(MACHINE);
    spy.mockRestore();
    const second = takeOutbox(MACHINE).find((op) => op.table === "project")!.value as { createdAt: number };
    expect(second.createdAt).toBe(first.createdAt);
  });

  it("applying our own project/projectPath echo back does not duplicate local recents", () => {
    rememberProject("/home/me/code/app");
    captureLocalProjectChanges(MACHINE);
    const ops = takeOutbox(MACHINE);
    const projectOp = ops.find((op) => op.table === "project")!;
    const pathOp = ops.find((op) => op.table === "projectPath")!;
    applyRemoteProjectRecords(MACHINE, [
      { table: "project", id: projectOp.id, rev: 1, value: projectOp.value as any },
      { table: "projectPath", id: pathOp.id, rev: 2, value: pathOp.value as any },
    ]);
    expect(loadRecents()).toHaveLength(1);
  });

  it("preserves foreign ids from the last pulled layout when capturing", () => {
    rememberProject("/home/me/code/app");
    markPulled(MACHINE, [
      { table: "railLayout", id: "rail", rev: 1, value: { order: ["foreign-a"], pinned: ["foreign-b"] } },
    ]);
    captureLocalProjectChanges(MACHINE);
    expect(takeOutbox(MACHINE).some((op) => op.table === "railLayout")).toBe(false);
    const id = Object.values(localProjectIdsByPath())[0];
    saveProjectRailOrder(["/home/me/code/app"]);
    savePinnedProjects(["/home/me/code/app"]);
    captureLocalProjectChanges(MACHINE);
    const next = takeOutbox(MACHINE).find((op) => op.table === "railLayout");
    expect(next?.value).toEqual({ order: ["foreign-a", id], pinned: ["foreign-b", id] });
  });

  it("uses deterministic name-based ids and lets the first same-named path own the id", () => {
    rememberProject("/home/me/code/App");
    rememberProject("/work/app");
    captureLocalProjectChanges(MACHINE);
    const pathOps = takeOutbox(MACHINE).filter((op) => op.table === "projectPath");
    expect(pathOps).toHaveLength(1);
    expect(Object.values(localProjectIdsByPath())).toEqual(["name:app"]);
  });

  it("keeps remote:// pins when applying a railLayout record", () => {
    rememberProject("/home/me/code/app");
    captureLocalProjectChanges(MACHINE);
    savePinnedProjects(["remote://box/x"]);
    applyRemoteProjectRecords(MACHINE, [
      { table: "railLayout", id: "rail", rev: 1, value: { order: ["name:app"], pinned: ["name:app"] } },
    ]);
    expect(loadPinnedProjects()).toEqual(["/home/me/code/app", "remote://box/x"]);
  });
});

describe("mergeRailLayout", () => {
  it("equals the host layout when nothing changed locally", () => {
    const host = { order: ["a", "x", "b"], pinned: ["x", "a"] };
    expect(mergeRailLayout(host, ["a", "b"], ["a"], new Set(["a", "b"]))).toEqual(host);
  });

  it("is a fixed point across two machines", () => {
    const aOwn = new Set(["a", "c"]);
    const bOwn = new Set(["b", "c"]);
    let host = { order: [] as string[], pinned: [] as string[] };
    host = mergeRailLayout(host, ["a", "c"], ["a"], aOwn);
    host = mergeRailLayout(host, ["c", "b"], ["b"], bOwn);
    const afterB = host;
    const afterA = mergeRailLayout(afterB, ["a", "c"], ["a"], aOwn);
    expect(afterA).toEqual(afterB);
    expect(mergeRailLayout(afterA, ["c", "b"], ["b"], bOwn)).toEqual(afterA);
  });
});

describe("remote-only projects and manual links", () => {
  beforeEach(mockLocalStorage);

  const remote = (projectId: string, machineId: string, path: string, archived = false) =>
    ({ table: "projectPath", value: { projectId, machineId, path, archived } }) as never;

  it("lists projects other machines have that this one lacks, minus archived ones", () => {
    rememberProject("/home/me/code/app");
    applyRemoteProjectRecords(MACHINE, [
      remote("name:app", "m2", "C:/x/app"),
      remote("name:site", "m2", "C:/x/site"),
      remote("name:old", "m2", "C:/x/old", true),
    ]);
    expect(remoteOnlyProjects()).toEqual([
      { projectId: "name:site", name: "site", otherPaths: [{ machineId: "m2", path: "C:/x/site" }] },
    ]);
  });

  it("a manual link maps a differently named folder onto the project", () => {
    applyRemoteProjectRecords(MACHINE, [remote("name:site", "m2", "C:/x/site")]);
    linkLocalPathToProject("/home/me/code/website", "name:site");
    rememberProject("/home/me/code/website");
    expect(remoteOnlyProjects()).toEqual([]);
    captureLocalProjectChanges(MACHINE);
    const pathOp = takeOutbox(MACHINE).find((op) => op.table === "projectPath");
    expect(pathOp?.value).toMatchObject({ projectId: "name:site", path: "/home/me/code/website" });
  });
});

describe("host environment on projectPath records", () => {
  beforeEach(mockLocalStorage);

  const pathOps = () => takeOutbox(MACHINE).filter((op) => op.table === "projectPath");
  const settle = () => {
    const sent = takeOutbox(MACHINE);
    applyPushResult(
      MACHINE,
      { rev: sent.length, applied: sent.map((op, i) => ({ table: op.table, id: op.id, rev: i + 1 })), rejected: [] },
      sent,
    );
  };

  it("omits the host while unknown and re-pushes the path once it is known or changes", () => {
    rememberProject("/home/me/code/app");
    captureLocalProjectChanges(MACHINE);
    expect(pathOps()[0].value).not.toHaveProperty("hostEnvironmentId");
    settle();

    setLocalHostEnvironmentId("env-1");
    captureLocalProjectChanges(MACHINE);
    expect(pathOps()[0].value).toMatchObject({ path: "/home/me/code/app", hostEnvironmentId: "env-1" });
    settle();
    captureLocalProjectChanges(MACHINE);
    expect(pathOps()).toEqual([]);

    setLocalHostEnvironmentId("env-2");
    captureLocalProjectChanges(MACHINE);
    expect(pathOps()[0].value).toMatchObject({ hostEnvironmentId: "env-2" });
  });

  it("remembers another machine's host with its path", () => {
    applyRemoteProjectRecords(MACHINE, [
      { table: "projectPath", id: "a", rev: 1, value: { projectId: "name:site", machineId: "m2", path: "C:/x/site", archived: false, hostEnvironmentId: "env-2" } },
      { table: "projectPath", id: "b", rev: 2, value: { projectId: "name:site", machineId: "m3", path: "/y/site", archived: false } },
    ]);
    expect(remoteOnlyProjects()).toEqual([
      {
        projectId: "name:site",
        name: "site",
        otherPaths: [
          { machineId: "m2", path: "C:/x/site", hostEnvironmentId: "env-2" },
          { machineId: "m3", path: "/y/site" },
        ],
      },
    ]);
  });
});

describe("records announced on a host's behalf", () => {
  beforeEach(mockLocalStorage);

  const record = (projectId: string, machineId: string, path: string, hostEnvironmentId?: string, archived = false) =>
    ({
      table: "projectPath",
      value: { projectId, machineId, path, archived, ...(hostEnvironmentId ? { hostEnvironmentId } : {}) },
    }) as never;

  it("dedupeProjectPaths keeps one entry per host folder, preferring the owning machine's", () => {
    const env = { machineId: envMachineId("env-a"), path: "C:/Code/App", hostEnvironmentId: "env-a" };
    const machine = { machineId: "m2", path: "c:/code/app/", hostEnvironmentId: "env-a" };
    const other = { machineId: envMachineId("env-b"), path: "C:/Code/App", hostEnvironmentId: "env-b" };
    const bare = { machineId: "m3", path: "C:/Code/App" };
    expect(dedupeProjectPaths([env, machine, other, bare])).toEqual([machine, other, bare]);
    expect(dedupeProjectPaths([machine, env])).toEqual([machine]);
    expect(isEnvMachineId(env.machineId)).toBe(true);
    expect(isEnvMachineId("m2")).toBe(false);
  });

  it("a host connected here but not opened is one placeholder, however many records describe it", () => {
    applyRemoteProjectRecords(MACHINE, [
      record("name:app", "env:env-a", "/code/app", "env-a"),
      record("name:app", "m2", "/code/app", "env-a"),
      record("name:site", "env:env-a", "/code/site", "env-a"),
    ]);
    expect(remoteOnlyProjects()).toEqual([
      { projectId: "name:app", name: "app", otherPaths: [{ machineId: "m2", path: "/code/app", hostEnvironmentId: "env-a" }] },
      {
        projectId: "name:site",
        name: "site",
        otherPaths: [{ machineId: "env:env-a", path: "/code/site", hostEnvironmentId: "env-a" }],
      },
    ]);
    expect(locallyAdoptableProjects()).toEqual([]);
  });

  it("a folder on this machine's own host is adoptable, not a placeholder", () => {
    setLocalHostEnvironmentId("env-own");
    applyRemoteProjectRecords(MACHINE, [
      record("name:clinic", "env:env-own", "/Users/me/projects/clinic", "env-own"),
      record("name:old", "env:env-own", "/Users/me/projects/old", "env-own", true),
      record("name:mine", "env:env-own", "/Users/me/projects/mine", "env-own"),
      record("name:far", "env:env-a", "/code/far", "env-a"),
    ]);
    rememberProject("/Users/me/projects/mine");
    expect(locallyAdoptableProjects()).toEqual([{ projectId: "name:clinic", path: "/Users/me/projects/clinic" }]);
    expect(remoteOnlyProjects().map((project) => project.projectId)).toEqual(["name:far"]);
  });
});

describe("remote:// rail projects", () => {
  beforeEach(mockLocalStorage);

  const REMOTE = "remote://env-a/C:/Code/App";

  it("get the id of their folder on the host and a projectPath record keyed by that host", () => {
    rememberProject(REMOTE);
    rememberProject("remote://env-a/home/me/Site");
    captureLocalProjectChanges(MACHINE);
    expect(localProjectIdsByPath()).toEqual({
      [pathKey(REMOTE)]: "name:app",
      [pathKey("remote://env-a/home/me/Site")]: "name:site",
    });
    expect(localPathKeyForProjectId("name:app")).toBe(pathKey(REMOTE));
    const paths = takeOutbox(MACHINE).filter((op) => op.table === "projectPath");
    expect(paths.map((op) => op.id).sort()).toEqual(["name:app:env:env-a", "name:site:env:env-a"]);
    expect(paths.find((op) => op.id === "name:app:env:env-a")?.value).toEqual({
      projectId: "name:app",
      machineId: "env:env-a",
      hostEnvironmentId: "env-a",
      path: "C:/Code/App",
      archived: false,
    });
    expect(paths.find((op) => op.id === "name:site:env:env-a")?.value).toMatchObject({ path: "/home/me/Site" });
    captureLocalProjectChanges(MACHINE);
    expect(takeOutbox(MACHINE).filter((op) => op.table === "projectPath")).toHaveLength(2);
  });

  it("are not announced when they are on this machine's own host or its machine already announced them", () => {
    setLocalHostEnvironmentId("env-own");
    rememberProject("remote://env-own/home/me/self");
    rememberProject(REMOTE);
    applyRemoteProjectRecords(MACHINE, [
      {
        table: "projectPath",
        id: "name:app:m2",
        rev: 1,
        value: { projectId: "name:app", machineId: "m2", path: "c:/code/app", archived: false, hostEnvironmentId: "env-a" },
      },
    ]);
    captureLocalProjectChanges(MACHINE);
    expect(takeOutbox(MACHINE).filter((op) => op.table === "projectPath")).toEqual([]);
  });

  it("carry their archived state in the announcement", () => {
    rememberProject(REMOTE);
    archiveProject(REMOTE);
    captureLocalProjectChanges(MACHINE);
    expect(takeOutbox(MACHINE).find((op) => op.table === "projectPath")?.value).toMatchObject({ archived: true });
  });

  it("ignore this desktop's own announcement when it comes back", () => {
    rememberProject(REMOTE);
    const own = {
      table: "projectPath",
      id: "name:app:env:env-a",
      rev: 1,
      value: { projectId: "name:app", machineId: "env:env-a", path: "C:/Code/App", archived: false, hostEnvironmentId: "env-a" },
    } as const;
    applyRemoteProjectRecords(MACHINE, [own]);
    forgetProject(REMOTE);
    expect(remoteOnlyProjects()).toEqual([]);
    // From another desktop it is a project this one lacks.
    applyRemoteProjectRecords(MACHINE, [own]);
    expect(remoteOnlyProjects().map((project) => project.projectId)).toEqual(["name:app"]);
  });

  it("lose the id to a local folder of the same name", () => {
    rememberProject(REMOTE);
    rememberProject("/home/me/code/app");
    captureLocalProjectChanges(MACHINE);
    expect(localProjectIdsByPath()).toEqual({ [pathKey("/home/me/code/app")]: "name:app" });
    expect(takeOutbox(MACHINE).find((op) => op.table === "projectPath")?.value).toMatchObject({
      path: "/home/me/code/app",
    });
  });

  it("use the project they were auto-added for, whatever the host calls the folder", () => {
    rememberProject("remote://env-a/private/real");
    markAutoAdded("name:app", "remote://env-a/private/real");
    captureLocalProjectChanges(MACHINE);
    expect(localProjectIdsByPath()).toEqual({ [pathKey("remote://env-a/private/real")]: "name:app" });
  });

  it("are not listed as missing here", () => {
    const remote = (projectId: string, path: string) =>
      ({ table: "projectPath", value: { projectId, machineId: "m2", path, archived: false } }) as never;
    applyRemoteProjectRecords(MACHINE, [remote("name:app", "C:/Code/App"), remote("name:site", "C:/Code/site")]);
    rememberProject(REMOTE);
    expect(remoteOnlyProjects().map((project) => project.projectId)).toEqual(["name:site"]);
  });

  it("take the rail slot and pin the host has for them, then sync later edits", () => {
    rememberProject("/home/me/code/mine");
    saveProjectRailOrder(["/home/me/code/mine"]);
    markPulled(MACHINE, [
      { table: "railLayout", id: "rail", rev: 1, value: { order: ["name:app", "name:other"], pinned: ["name:app"] } },
    ]);
    captureLocalProjectChanges(MACHINE);
    takeOutbox(MACHINE);

    rememberProject(REMOTE);
    saveProjectRailOrder(["/home/me/code/mine", REMOTE]);
    captureLocalProjectChanges(MACHINE);
    const layout = () => takeOutbox(MACHINE).find((op) => op.table === "railLayout")?.value;
    expect(layout()).toEqual({ order: ["name:app", "name:other", "name:mine"], pinned: ["name:app"] });
    expect(loadProjectRailOrder()).toEqual([REMOTE, "/home/me/code/mine"]);
    expect(loadPinnedProjects()).toEqual([REMOTE]);

    // Nothing changed locally since: the same layout again.
    captureLocalProjectChanges(MACHINE);
    expect(layout()).toEqual({ order: ["name:app", "name:other", "name:mine"], pinned: ["name:app"] });

    savePinnedProjects([]);
    captureLocalProjectChanges(MACHINE);
    expect(layout()).toEqual({ order: ["name:app", "name:other", "name:mine"], pinned: [] });
  });

  it("follow an incoming layout, while remote projects without an id keep their pin", () => {
    rememberProject(REMOTE);
    rememberProject("/home/me/code/mine");
    captureLocalProjectChanges(MACHINE);
    savePinnedProjects([REMOTE, "remote://box/unknown"]);
    applyRemoteProjectRecords(MACHINE, [
      { table: "railLayout", id: "rail", rev: 1, value: { order: ["name:app", "name:mine"], pinned: ["name:mine"] } },
    ]);
    expect(loadProjectRailOrder()).toEqual([REMOTE, "/home/me/code/mine"]);
    expect(loadPinnedProjects()).toEqual(["/home/me/code/mine", "remote://box/unknown"]);
  });

  it("hand their group to a local folder that takes over the id", () => {
    saveProjectGroups([{ id: "g1", name: "Work", collapsed: false }]);
    rememberProject(REMOTE);
    saveProjectGroupAssignments({ [pathKey(REMOTE)]: "g1" });
    captureLocalProjectChanges(MACHINE);
    rememberProject("/home/me/code/app");
    captureLocalProjectChanges(MACHINE);
    expect(loadProjectGroupAssignments()[pathKey("/home/me/code/app")]).toBe("g1");
  });
});
