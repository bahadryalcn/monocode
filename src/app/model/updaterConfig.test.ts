import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getIdentifier, getVersion, check, message, ask, relaunch } = vi.hoisted(() => ({
  getIdentifier: vi.fn(),
  getVersion: vi.fn(),
  check: vi.fn(),
  message: vi.fn(),
  ask: vi.fn(),
  relaunch: vi.fn(),
}));

vi.mock("@tauri-apps/api/app", () => ({ getIdentifier, getVersion }));
vi.mock("@tauri-apps/plugin-updater", () => ({ check }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ ask, message }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch }));
vi.mock("../../features/settings/model/sounds", () => ({ announceUpdateAvailable: vi.fn() }));

import { probeForUpdate, runUpdateFlow } from "./updater";

describe("updater", () => {
  beforeEach(() => {
    getIdentifier.mockResolvedValue("com.monocode.desktop");
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it.each(["com.monocode.desktop.fork", "com.monocode.desktop.dev"])(
    "never contacts the release feed from %s",
    async (identifier) => {
      getIdentifier.mockResolvedValue(identifier);
      getVersion.mockResolvedValue("0.6.0");

      await expect(probeForUpdate()).resolves.toBeNull();
      await expect(runUpdateFlow(false)).resolves.toEqual({
        phase: "idle",
        currentVersion: "0.6.0",
      });
      await expect(runUpdateFlow(true)).resolves.toMatchObject({ phase: "idle" });
      expect(check).not.toHaveBeenCalled();
      expect(message).toHaveBeenCalledOnce();
    },
  );

  it("treats an unreadable identifier as updates disabled", async () => {
    getIdentifier.mockRejectedValue(new Error("no tauri"));
    getVersion.mockResolvedValue("0.6.0");

    await expect(probeForUpdate()).resolves.toBeNull();
    expect(check).not.toHaveBeenCalled();
  });

  it("keeps automatic checks quiet when updater endpoints are missing", async () => {
    getVersion.mockResolvedValue("0.1.23");
    check.mockRejectedValue(new Error("Updater does not have any endpoints set"));

    await expect(runUpdateFlow(false)).resolves.toEqual({
      phase: "idle",
      currentVersion: "0.1.23",
    });
    expect(message).not.toHaveBeenCalled();
  });

  it("points manual checks without updater endpoints to GitHub releases", async () => {
    getVersion.mockResolvedValue("0.1.23");
    check.mockRejectedValue(new Error("Updater does not have any endpoints set"));

    await expect(runUpdateFlow(true)).resolves.toEqual({
      phase: "idle",
      currentVersion: "0.1.23",
    });
    expect(message).toHaveBeenCalledWith(
      expect.stringContaining("https://github.com/hardbeat920/monocode/releases/latest"),
      { title: "MonoCode" },
    );
  });

  it("still reports real updater failures", async () => {
    getVersion.mockResolvedValue("0.1.23");
    check.mockRejectedValue(new Error("network failed"));

    await expect(runUpdateFlow(true)).resolves.toMatchObject({
      phase: "error",
      error: "network failed",
    });
    expect(message).toHaveBeenCalledOnce();
  });
});
