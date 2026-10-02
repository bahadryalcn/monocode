import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  archiveProject,
  forgetProject,
  loadRecents,
  rememberProject,
} from "../../projects/model/recents";
import { remoteProjectFor } from "../../connections/model/remoteProjects";
import {
  applyRemoteProjectRecords,
  projectIdForPath,
  remoteOnlyProjects,
  setLocalHostEnvironmentId,
  type RemoteOnlyProject,
} from "./syncProjects";
import type { RemoteOpenTarget } from "./syncRemoteProjects";

const PEER = "host-1";

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

const pathRecord = (projectId: string, machineId: string, path: string, hostEnvironmentId?: string, archived = false) =>
  ({
    table: "projectPath",
    value: { projectId, machineId, path, archived, ...(hostEnvironmentId ? { hostEnvironmentId } : {}) },
  }) as never;

function target(environmentId: string, name = "Windows PC") {
  const calls: { cwd: string; userInitiated: boolean }[] = [];
  let online = true;
  const value: RemoteOpenTarget = {
    environmentId,
    name,
    request: async (method, params, userInitiated) => {
      const { cwd } = params as { cwd: string };
      calls.push({ cwd, userInitiated });
      if (!online) throw new Error("offline");
      expect(method).toBe("projects.open");
      return { id: `id-${cwd}`, cwd, name: "x" };
    },
  };
  return { value, calls, setOnline: (next: boolean) => void (online = next) };
}

/** The module keeps its targets and retry state in memory, so each test gets its own copy. */
async function load() {
  vi.resetModules();
  return import("./syncRemoteProjects");
}

describe("remoteOpenMatch and remoteOnlyProjectHint", () => {
  const project: RemoteOnlyProject = {
    projectId: "name:app",
    name: "app",
    otherPaths: [
      { machineId: "m1", path: "/srv/app" },
      { machineId: "m2", path: "C:/code/app", hostEnvironmentId: "env-2" },
    ],
  };

  it("matches the path whose host is a connected machine", async () => {
    const { remoteOpenMatch, remoteOnlyProjectHint } = await load();
    const pc = target("env-2").value;
    const match = remoteOpenMatch(project, [target("env-9").value, pc]);
    expect(match).toEqual({ target: pc, path: "C:/code/app" });
    expect(remoteOnlyProjectHint(project, match)).toBe("C:/code/app on Windows PC. Click to open it there.");
  });

  it("has no match without a host id or without that machine", async () => {
    const { remoteOpenMatch, remoteOnlyProjectHint } = await load();
    expect(remoteOpenMatch(project, [target("env-9").value])).toBeUndefined();
    expect(remoteOpenMatch({ ...project, otherPaths: [project.otherPaths[0]] }, [target("env-2").value])).toBeUndefined();
    expect(remoteOnlyProjectHint(project, undefined)).toBe(
      "/srv/app, C:/code/app (another machine, not connected here). Click to link a folder.",
    );
  });
});

describe("autoAddRetryDelayMs", () => {
  it("doubles from one minute up to half an hour", async () => {
    const { autoAddRetryDelayMs } = await load();
    expect([1, 2, 3, 6, 20].map(autoAddRetryDelayMs)).toEqual([60_000, 120_000, 240_000, 1_800_000, 1_800_000]);
  });
});

describe("autoAddRemoteProjects", () => {
  beforeEach(mockLocalStorage);

  it("adds projects of a connected machine once, without a path for unmatched ones", async () => {
    const sync = await load();
    const pc = target("env-a");
    sync.setRemoteOpenTargets([pc.value]);
    const added = vi.fn();
    sync.subscribeSyncedProjectsAdded(added);
    rememberProject("/home/me/code/mine");
    applyRemoteProjectRecords(PEER, [
      pathRecord("name:app", "m-a", "C:\\code\\app", "env-a"),
      pathRecord("name:old", "m-a", "C:/code/old", "env-a", true),
      pathRecord("name:far", "m-c", "/srv/far", "env-c"),
      pathRecord("name:plain", "m-d", "/srv/plain"),
    ]);

    expect(await sync.autoAddRemoteProjects()).toEqual(["remote://env-a/C:/code/app"]);
    expect(added).toHaveBeenCalledTimes(1);
    expect(pc.calls).toEqual([{ cwd: "C:\\code\\app", userInitiated: false }]);
    expect(loadRecents().map((item) => item.path)).toEqual(["/home/me/code/mine", "remote://env-a/C:/code/app"]);
    expect(remoteProjectFor("remote://env-a/C:/code/app")).toMatchObject({ environmentId: "env-a", cwd: "C:\\code\\app" });
    expect(remoteOnlyProjects().map((project) => project.projectId)).toEqual(["name:far", "name:plain"]);

    expect(await sync.autoAddRemoteProjects()).toEqual([]);
    expect(pc.calls).toHaveLength(1);
    expect(added).toHaveBeenCalledTimes(1);
  });

  it("does not add again a project the user removed or archived", async () => {
    const sync = await load();
    const pc = target("env-a");
    sync.setRemoteOpenTargets([pc.value]);
    applyRemoteProjectRecords(PEER, [
      pathRecord("name:app", "m-a", "/code/app", "env-a"),
      pathRecord("name:site", "m-a", "/code/site", "env-a"),
    ]);
    await sync.autoAddRemoteProjects();
    expect(pc.calls).toHaveLength(2);

    forgetProject("remote://env-a/code/app");
    archiveProject("remote://env-a/code/site");
    // Hidden at once, before the next cycle writes the dismissal down.
    expect(remoteOnlyProjects()).toEqual([]);
    expect(await sync.autoAddRemoteProjects()).toEqual([]);
    expect(await sync.autoAddRemoteProjects()).toEqual([]);
    expect(pc.calls).toHaveLength(2);
    expect(loadRecents()).toEqual([]);
    expect(remoteOnlyProjects()).toEqual([]);

    // A fresh copy of the module (an app restart) still knows.
    const restarted = await load();
    restarted.setRemoteOpenTargets([pc.value]);
    expect(await restarted.autoAddRemoteProjects()).toEqual([]);
    expect(pc.calls).toHaveLength(2);
  });

  it("stays silent while the machine is offline and retries with backoff", async () => {
    const sync = await load();
    const pc = target("env-a");
    pc.setOnline(false);
    sync.setRemoteOpenTargets([pc.value]);
    applyRemoteProjectRecords(PEER, [
      pathRecord("name:app", "m-a", "/code/app", "env-a"),
      pathRecord("name:site", "m-a", "/code/site", "env-a"),
    ]);

    expect(await sync.autoAddRemoteProjects(0)).toEqual([]);
    // One request for the unreachable machine, not one per project.
    expect(pc.calls).toHaveLength(1);
    expect(await sync.autoAddRemoteProjects(59_999)).toEqual([]);
    expect(pc.calls).toHaveLength(1);
    expect(await sync.autoAddRemoteProjects(60_000)).toEqual([]);
    expect(pc.calls).toHaveLength(2);
    expect(await sync.autoAddRemoteProjects(60_000 + 119_999)).toEqual([]);
    expect(pc.calls).toHaveLength(2);
    expect(remoteOnlyProjects()).toHaveLength(2);

    pc.setOnline(true);
    expect((await sync.autoAddRemoteProjects(60_000 + 120_000)).sort()).toEqual([
      "remote://env-a/code/app",
      "remote://env-a/code/site",
    ]);
    expect(remoteOnlyProjects()).toEqual([]);
  });

  it("uses the path the host reports and still knows which project it added", async () => {
    const sync = await load();
    sync.setRemoteOpenTargets([
      {
        environmentId: "env-a",
        name: "Mac",
        request: async () => ({ id: "p1", cwd: "/private/code/real-name", name: "real-name" }),
      },
    ]);
    applyRemoteProjectRecords(PEER, [pathRecord("name:app", "m-a", "/code/app", "env-a")]);
    expect(await sync.autoAddRemoteProjects()).toEqual(["remote://env-a/private/code/real-name"]);
    expect(remoteOnlyProjects()).toEqual([]);
    expect(await sync.autoAddRemoteProjects()).toEqual([]);
  });
});

describe("adoptLocalProjects", () => {
  beforeEach(mockLocalStorage);

  const CLINIC = "/Users/me/projects/clinic";

  async function loadWithOwnHost() {
    const sync = await load();
    setLocalHostEnvironmentId("env-own");
    return sync;
  }

  it("adds a folder on this machine that another desktop opened remotely, once", async () => {
    const sync = await loadWithOwnHost();
    const pc = target("env-own");
    sync.setRemoteOpenTargets([pc.value]);
    let added = 0;
    sync.subscribeSyncedProjectsAdded(() => (added += 1));
    rememberProject("/home/me/mine");
    applyRemoteProjectRecords(PEER, [
      pathRecord("name:clinic", "env:env-own", `${CLINIC}/`, "env-own"),
      pathRecord("name:tool", "env:env-own", "G:\\Projects\\tool", "env-own"),
    ]);

    expect(await sync.adoptLocalProjects(async () => true)).toEqual([CLINIC, "G:/Projects/tool"]);
    expect(loadRecents().map((item) => item.path)).toEqual(["/home/me/mine", CLINIC, "G:/Projects/tool"]);
    expect(added).toBe(1);
    expect(await sync.adoptLocalProjects(async () => true)).toEqual([]);
    // Never as a remote project through its own host.
    expect(await sync.autoAddRemoteProjects()).toEqual([]);
    expect(pc.calls).toEqual([]);

    forgetProject(CLINIC);
    expect(await sync.adoptLocalProjects(async () => true)).toEqual([]);
    expect(loadRecents().map((item) => item.path)).toEqual(["/home/me/mine", "G:/Projects/tool"]);
  });

  it("skips a folder that does not exist, an archived one, and one already here", async () => {
    const sync = await loadWithOwnHost();
    applyRemoteProjectRecords(PEER, [
      pathRecord("name:clinic", "env:env-own", CLINIC, "env-own"),
      pathRecord("name:gone", "env:env-own", "/Users/me/projects/gone", "env-own"),
      pathRecord("name:old", "env:env-own", "/Users/me/projects/old", "env-own"),
      pathRecord("name:far", "env:env-a", "/code/far", "env-a"),
    ]);
    rememberProject("/Users/me/projects/old");
    archiveProject("/Users/me/projects/old");
    const asked: string[] = [];
    const exists = async (path: string) => {
      asked.push(path);
      return !path.endsWith("/gone");
    };
    expect(await sync.adoptLocalProjects(exists)).toEqual([CLINIC]);
    expect(asked).toEqual([CLINIC, "/Users/me/projects/gone"]);
    expect(loadRecents().map((item) => item.path)).toEqual([CLINIC]);
  });

  it("keeps the announced project id when the folder name differs from it", async () => {
    const sync = await loadWithOwnHost();
    applyRemoteProjectRecords(PEER, [pathRecord("name:app", "env:env-own", "/private/real-name", "env-own")]);
    expect(await sync.adoptLocalProjects(async () => true)).toEqual(["/private/real-name"]);
    expect(projectIdForPath("/private/real-name")).toBe("name:app");
  });

  it("does nothing until this machine knows its own host", async () => {
    const sync = await load();
    applyRemoteProjectRecords(PEER, [pathRecord("name:clinic", "env:env-own", CLINIC, "env-own")]);
    expect(await sync.adoptLocalProjects(async () => true)).toEqual([]);
  });
});

describe("openSyncedProjectRemotely", () => {
  beforeEach(mockLocalStorage);

  it("is unavailable when no connected machine has the project", async () => {
    const sync = await load();
    sync.setRemoteOpenTargets([target("env-a").value]);
    applyRemoteProjectRecords(PEER, [pathRecord("name:far", "m-c", "/srv/far", "env-c")]);
    expect(await sync.openSyncedProjectRemotely("name:far")).toEqual({ status: "unavailable" });
    expect(await sync.openSyncedProjectRemotely("name:nope")).toEqual({ status: "unavailable" });
  });

  it("retries a failed machine at once, as a user request, and reports a failure", async () => {
    const sync = await load();
    const pc = target("env-a");
    pc.setOnline(false);
    sync.setRemoteOpenTargets([pc.value]);
    applyRemoteProjectRecords(PEER, [pathRecord("name:app", "m-a", "/code/app", "env-a")]);
    await sync.autoAddRemoteProjects(0);

    expect(await sync.openSyncedProjectRemotely("name:app")).toMatchObject({ status: "failed" });
    pc.setOnline(true);
    expect(await sync.openSyncedProjectRemotely("name:app")).toEqual({
      status: "opened",
      key: "remote://env-a/code/app",
    });
    expect(pc.calls.map((call) => call.userInitiated)).toEqual([false, true, true]);
    expect(loadRecents().map((item) => item.path)).toEqual(["remote://env-a/code/app"]);
  });
});
