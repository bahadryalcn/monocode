import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyRemoteProjectRecords,
  captureLocalProjectChanges,
  localPathKeyForProjectId,
  linkLocalPathToProject,
  localProjectIdsByPath,
  mergeRailLayout,
  remoteOnlyProjects,
} from "./syncProjects";
import { markPulled, takeOutbox } from "./syncPeerState";
import { localMachineId } from "./syncMachineId";
import { loadProjectRailOrder, loadRecents, loadPinnedProjects, rememberProject, savePinnedProjects, saveProjectRailOrder } from "../../projects/model/recents";

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
