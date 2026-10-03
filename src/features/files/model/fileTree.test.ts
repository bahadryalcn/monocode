import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FsEntry } from "../../../platform/tauri/fs";
import {
  forgetDir,
  listCachedDir,
  notifyDirsChanged,
  peekDir,
  refreshCachedDirs,
  refreshDir,
  subscribeDirsChanged,
} from "./fileTree";

const root = "/tmp/empty-project";

function entry(name: string): FsEntry {
  return {
    name,
    path: `${root}/${name}`,
    isDir: false,
    ignored: false,
  };
}

const listDir = vi.fn<(path: string) => Promise<FsEntry[]>>();

vi.mock("../../../platform/tauri/fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../platform/tauri/fs")>();
  return {
    ...actual,
    listDir: (path: string) => listDir(path),
  };
});

describe("fileTree cache", () => {
  it("refreshes only the requested root and bounds concurrent folder reads", async () => {
    const current = `${root}/current`;
    const old = `${root}/old`;
    listDir.mockResolvedValue([]);
    await Promise.all(
      [old, ...Array.from({ length: 10 }, (_, i) => `${current}/${i}`)].map(
        listCachedDir,
      ),
    );
    listDir.mockClear();
    let active = 0;
    let peak = 0;
    listDir.mockImplementation(async () => {
      peak = Math.max(peak, ++active);
      await new Promise<void>((resolve) => setTimeout(resolve, 1));
      active--;
      return [];
    });
    expect(await refreshCachedDirs([current])).toEqual([]);
    expect(listDir).toHaveBeenCalledTimes(10);
    expect(listDir.mock.calls.some(([path]) => path === old)).toBe(false);
    expect(peak).toBeLessThanOrEqual(4);
  });

  it("does not publish unchanged listings or notify unrelated roots", async () => {
    vi.useFakeTimers();
    const a = `${root}/A`;
    const b = `${root}/B`;
    listDir.mockResolvedValue([]);
    await listCachedDir(a);
    await listCachedDir(b);
    const changedA = vi.fn();
    const changedB = vi.fn();
    const stopA = subscribeDirsChanged(changedA, a);
    const stopB = subscribeDirsChanged(changedB, b);
    try {
      notifyDirsChanged(a, true);
      await vi.runAllTimersAsync();
      expect(changedA).not.toHaveBeenCalled();
      listDir.mockImplementation(async (path) =>
        path === a ? [entry("new.ts")] : [],
      );
      notifyDirsChanged(a, true);
      await vi.runAllTimersAsync();
      expect(changedA).toHaveBeenCalledTimes(1);
      expect(changedB).not.toHaveBeenCalled();
    } finally {
      stopA();
      stopB();
    }
  });
  beforeEach(() => {
    forgetDir(root);
    listDir.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps the first listing until refreshDir", async () => {
    listDir.mockResolvedValueOnce([]);
    await listCachedDir(root);
    expect(peekDir(root)).toEqual([]);

    listDir.mockResolvedValueOnce([entry("hello.ts")]);
    expect(await listCachedDir(root)).toEqual([]);
    expect(listDir).toHaveBeenCalledTimes(1);

    expect(await refreshDir(root)).toEqual([entry("hello.ts")]);
    expect(peekDir(root)).toEqual([entry("hello.ts")]);
  });

  it("refreshCachedDirs re-lists every cached folder", async () => {
    listDir.mockResolvedValueOnce([]);
    await listCachedDir(root);
    listDir.mockResolvedValueOnce([entry("created.ts")]);
    await refreshCachedDirs();
    expect(peekDir(root)).toEqual([entry("created.ts")]);
  });

  it("notifyDirsChanged refreshes the cache and tells listeners", async () => {
    vi.useFakeTimers();
    listDir.mockResolvedValueOnce([]);
    await listCachedDir(root);

    const onChange = vi.fn();
    const stop = subscribeDirsChanged(onChange);
    listDir.mockResolvedValueOnce([entry("from-agent.ts")]);
    notifyDirsChanged();
    expect(peekDir(root)).toEqual([]);

    await vi.runAllTimersAsync();
    expect(peekDir(root)).toEqual([entry("from-agent.ts")]);
    expect(onChange).toHaveBeenCalledTimes(1);
    stop();
  });
});
