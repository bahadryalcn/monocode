import { afterEach, expect, it, vi } from "vitest";
import { RemoteSessionLists } from "./remoteSessionLists";
import type { HostSessionSummary } from "./protocol";

const summary = (title: string) =>
  [{ id: "s", title, status: "idle" }] as HostSessionSummary[];
afterEach(() => vi.useRealTimers());

it("shares simultaneous requests and retains the same array for unchanged results", async () => {
  vi.useFakeTimers();
  const request = vi.fn(async () => summary("A"));
  const cache = new RemoteSessionLists(request);
  const reads = Array.from({ length: 20 }, () =>
    cache.load("machine", "project"),
  );
  const results = await Promise.all(reads);
  expect(request).toHaveBeenCalledTimes(1);
  expect(results.every((value) => value === results[0])).toBe(true);
  vi.advanceTimersByTime(5_001);
  expect(await cache.load("machine", "project")).toBe(results[0]);
  expect(request).toHaveBeenCalledTimes(2);
});

it("invalidates an in-flight read without letting its stale result replace newer data", async () => {
  let finish!: (value: HostSessionSummary[]) => void;
  const request = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue(summary("new"));
  const cache = new RemoteSessionLists(request);
  const old = cache.load("machine", "project");
  cache.invalidate();
  const latest = await cache.load("machine", "project");
  finish(summary("old"));
  expect(await old).toBe(latest);
  expect(await cache.load("machine", "project")).toBe(latest);
  expect(latest[0].title).toBe("new");
});

it("does not share projects across machines and retries failed reads", async () => {
  const request = vi
    .fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue([]);
  const cache = new RemoteSessionLists(request);
  await expect(cache.load("A", "project")).rejects.toThrow("offline");
  await cache.load("A", "project");
  await cache.load("B", "project");
  expect(request).toHaveBeenCalledTimes(3);
});

it("asks with the held etag and keeps the same array when the host says unchanged", async () => {
  vi.useFakeTimers();
  const request = vi
    .fn()
    .mockResolvedValueOnce({ etag: "e1", sessions: summary("A") })
    .mockResolvedValueOnce({ unchanged: true, etag: "e1" })
    .mockResolvedValueOnce({ etag: "e2", sessions: summary("B") });
  const cache = new RemoteSessionLists(request);
  const first = await cache.load("m", "p");
  expect(request).toHaveBeenLastCalledWith("m", "p", "");
  vi.advanceTimersByTime(5_001);
  expect(await cache.load("m", "p")).toBe(first);
  expect(request).toHaveBeenLastCalledWith("m", "p", "e1");
  vi.advanceTimersByTime(5_001);
  const changed = await cache.load("m", "p");
  expect(request).toHaveBeenLastCalledWith("m", "p", "e1");
  expect(changed[0].title).toBe("B");
});

it("falls back to the full list for a host that ignores the etag", async () => {
  vi.useFakeTimers();
  const request = vi.fn(async () => summary("A"));
  const cache = new RemoteSessionLists(request);
  await cache.load("m", "p");
  vi.advanceTimersByTime(5_001);
  await cache.load("m", "p");
  expect(request).toHaveBeenLastCalledWith("m", "p", "");
});
