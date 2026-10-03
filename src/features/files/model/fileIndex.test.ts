import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectFile } from "../../../platform/tauri/fs";
import {
  listDir,
  listProjectFiles,
  statFiles,
} from "../../../platform/tauri/fs";
import {
  invalidateProjectFiles,
  loadProjectFiles,
  peekProjectFiles,
  rememberOpenedFile,
  resolveFileOpenRequest,
  resolveOpenablePath,
  subscribeProjectFiles,
} from "./fileIndex";
import { notifyDirsChanged } from "./fileTree";

const cwd = "/Users/me/project";
const files: ProjectFile[] = [
  {
    name: "App.tsx",
    path: "/Users/me/project/apps/desktop/src/App.tsx",
    relative: "apps/desktop/src/App.tsx",
  },
  {
    name: "App.tsx",
    path: "/Users/me/project/apps/web/src/App.tsx",
    relative: "apps/web/src/App.tsx",
  },
  {
    name: "main.tsx",
    path: "/Users/me/project/apps/desktop/src/main.tsx",
    relative: "apps/desktop/src/main.tsx",
  },
];

const extra: ProjectFile = {
  name: "pasted.ts",
  path: "/Users/me/project/pasted.ts",
  relative: "pasted.ts",
};

vi.mock("../../../platform/tauri/fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../platform/tauri/fs")>();
  return {
    ...actual,
    listProjectFiles: vi.fn(async () => files),
    listDir: vi.fn(async () => []),
    statFiles: vi.fn(async () => []),
  };
});

const list = vi.mocked(listProjectFiles);
const dir = vi.mocked(listDir);
const stat = vi.mocked(statFiles);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe("resolveOpenablePath", () => {
  beforeEach(() => {
    invalidateProjectFiles();
    list.mockReset();
    list.mockResolvedValue(files);
    dir.mockReset();
    dir.mockResolvedValue([]);
    stat.mockReset();
    stat.mockResolvedValue([]);
  });

  it("maps a basename-only link to the shortest matching project path", async () => {
    const resolved = await resolveOpenablePath(cwd, "App.tsx");
    expect(resolved).toBe(files[1].path);
  });

  it("prefers recently opened files for ambiguous basenames", async () => {
    rememberOpenedFile(cwd, files[1].path);
    const resolved = await resolveOpenablePath(cwd, "App.tsx");
    expect(resolved).toBe(files[1].path);
  });

  it("matches a relative project path", async () => {
    const resolved = await resolveOpenablePath(cwd, "apps/desktop/src/main.tsx");
    expect(resolved).toBe(files[2].path);
  });

  it("still opens a direct file when the optional project index is unavailable", async () => {
    list.mockRejectedValue(new Error("Project scan unavailable"));
    await expect(resolveOpenablePath(cwd, "apps/desktop/src/main.tsx"))
      .resolves.toBe(files[2].path);
  });

  it("finds a generated file the index leaves out in an ignored folder", async () => {
    const pdf = `${cwd}/.artifacts/reports/summary.pdf`;
    const entry = (path: string, isDir: boolean, ignored: boolean) => ({
      name: path.split("/").pop()!,
      path,
      isDir,
      ignored,
    });
    stat.mockResolvedValue([{ path: `${cwd}/summary.pdf`, mtimeMs: null }]);
    dir.mockImplementation(async (path) => {
      if (path === cwd)
        return [
          entry(`${cwd}/apps`, true, false),
          entry(`${cwd}/node_modules`, true, true),
          entry(`${cwd}/.artifacts`, true, true),
        ];
      if (path === `${cwd}/.artifacts`)
        return [entry(`${cwd}/.artifacts/reports`, true, false)];
      if (path === `${cwd}/.artifacts/reports`) return [entry(pdf, false, false)];
      throw new Error(`unexpected listing of ${path}`);
    });
    await expect(resolveOpenablePath(cwd, "summary.pdf")).resolves.toBe(pdf);
  });

  it("finds an ignored file on a remote machine from an absolute remote path", async () => {
    const remote = "remote://env1/Users/me/project";
    const png = `${remote}/Screenshots/lumisqa/ui.png`;
    const entry = (path: string, isDir: boolean, ignored: boolean) => ({
      name: path.split("/").pop()!,
      path,
      isDir,
      ignored,
    });
    list.mockResolvedValue([
      { name: "a.ts", path: `${remote}/a.ts`, relative: "a.ts" },
    ]);
    stat.mockResolvedValue([{ path: `${remote}/ui.png`, mtimeMs: null }]);
    dir.mockImplementation(async (path) => {
      if (path === remote) return [entry(`${remote}/Screenshots`, true, true)];
      if (path === `${remote}/Screenshots`)
        return [entry(`${remote}/Screenshots/lumisqa`, true, true)];
      if (path === `${remote}/Screenshots/lumisqa`)
        return [entry(png, false, false)];
      throw new Error(`unexpected listing of ${path}`);
    });
    await expect(resolveOpenablePath(remote, `${remote}/ui.png`)).resolves.toBe(png);
    // The session's folder need not be the project root the path sits under.
    await expect(
      resolveOpenablePath(`${remote}/Screenshots`, `${remote}/ui.png`),
    ).resolves.toBe(png);
  });

  it("finds a file created after the index was read", async () => {
    const created: ProjectFile = {
      name: "new.ts",
      path: `${cwd}/lib/new.ts`,
      relative: "lib/new.ts",
    };
    await loadProjectFiles(cwd);
    list.mockResolvedValue([...files, created]);
    stat.mockResolvedValue([{ path: `${cwd}/new.ts`, mtimeMs: null }]);
    await expect(resolveOpenablePath(cwd, "new.ts")).resolves.toBe(created.path);
  });

  it("keeps an unindexed path that exists", async () => {
    const ignored = `${cwd}/.artifacts/notes.md`;
    stat.mockResolvedValue([{ path: ignored, mtimeMs: 5 }]);
    await expect(resolveOpenablePath(cwd, ".artifacts/notes.md")).resolves.toBe(
      ignored,
    );
    expect(dir).not.toHaveBeenCalled();
  });

  it("preserves an exact path even when it is absent from the project index", async () => {
    const ignored = `${cwd}/ignored/App.tsx`;
    await expect(
      resolveFileOpenRequest(cwd, ignored, { exact: true }),
    ).resolves.toBe(ignored);
    expect(list).not.toHaveBeenCalled();
  });
});

describe("loadProjectFiles", () => {
  beforeEach(() => {
    invalidateProjectFiles();
    list.mockReset();
    list.mockResolvedValue(files);
  });

  afterEach(() => {
    vi.useRealTimers();
    invalidateProjectFiles();
  });

  it("returns the cached listing until refresh", async () => {
    await loadProjectFiles(cwd);
    list.mockResolvedValue([...files, extra]);
    expect(await loadProjectFiles(cwd)).toEqual(files);
    expect(list).toHaveBeenCalledTimes(1);
    expect(await loadProjectFiles(cwd, true)).toEqual([...files, extra]);
    expect(peekProjectFiles(cwd)).toEqual([...files, extra]);
  });

  it("does not drop a refresh that arrives while a scan is in flight", async () => {
    const first = deferred<ProjectFile[]>();
    const second = deferred<ProjectFile[]>();
    list.mockImplementationOnce(() => first.promise);
    list.mockImplementationOnce(() => second.promise);

    const initial = loadProjectFiles(cwd);
    const refresh = loadProjectFiles(cwd, true);
    expect(list).toHaveBeenCalledTimes(2);

    first.resolve(files);
    expect(await initial).toEqual(files);
    expect(peekProjectFiles(cwd)).toBeNull();

    second.resolve([...files, extra]);
    expect(await refresh).toEqual([...files, extra]);
    expect(peekProjectFiles(cwd)).toEqual([...files, extra]);
  });

  it("reuses the in-flight scan when refresh is not requested", async () => {
    const pending = deferred<ProjectFile[]>();
    list.mockImplementationOnce(() => pending.promise);

    const first = loadProjectFiles(cwd);
    const second = loadProjectFiles(cwd);
    expect(list).toHaveBeenCalledTimes(1);

    pending.resolve(files);
    expect(await first).toEqual(files);
    expect(await second).toEqual(files);
  });

  it("notifies subscribers when the listing changes", async () => {
    const onChange = vi.fn();
    const stop = subscribeProjectFiles(onChange);
    await loadProjectFiles(cwd);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(peekProjectFiles(cwd)).toEqual(files);
    stop();
  });

  it("reloads after a directory change", async () => {
    vi.useFakeTimers();
    await loadProjectFiles(cwd);
    list.mockResolvedValue([...files, extra]);

    const onChange = vi.fn();
    const stop = subscribeProjectFiles(onChange);
    onChange.mockClear();
    notifyDirsChanged();

    await vi.runAllTimersAsync();
    expect(peekProjectFiles(cwd)).toEqual([...files, extra]);
    expect(onChange).toHaveBeenCalled();
    stop();
  });

  it("does not drop a scan for a different project", async () => {
    const other = "/Users/me/other";
    const pending = deferred<ProjectFile[]>();
    list.mockImplementationOnce(() => pending.promise);

    const scan = loadProjectFiles(other);
    invalidateProjectFiles(cwd);
    pending.resolve(files);

    expect(await scan).toEqual(files);
    expect(peekProjectFiles(other)).toEqual(files);
  });
});
