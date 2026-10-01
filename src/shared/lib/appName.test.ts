import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("@tauri-apps/api/app");
});

it("uses the runtime product name once it resolves", async () => {
  vi.doMock("@tauri-apps/api/app", () => ({
    getName: async () => "MonoCode Fork",
  }));
  const { appName, loadAppName } = await import("./appName");
  expect(await loadAppName()).toBe("MonoCode Fork");
  expect(appName()).toBe("MonoCode Fork");
});

it("keeps the MonoCode fallback when the lookup fails or is blank", async () => {
  vi.doMock("@tauri-apps/api/app", () => ({
    getName: async () => {
      throw new Error("not in Tauri");
    },
  }));
  const failing = await import("./appName");
  expect(await failing.loadAppName()).toBe("MonoCode");
  vi.resetModules();
  vi.doMock("@tauri-apps/api/app", () => ({ getName: async () => "  " }));
  const blank = await import("./appName");
  expect(await blank.loadAppName()).toBe("MonoCode");
});
