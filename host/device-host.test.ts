import { describe, expect, it, vi } from "vitest";
import { deviceActionArgs, DeviceHost } from "./device-host";
import * as deviceProcesses from "./device-process";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
describe("device boundaries", () => {
  it("opens a device-bound agent session before input commands", async () => {
    const directory = await mkdtemp(join(tmpdir(), "imece-agent-session-test-"));
    const host = new DeviceHost(directory, { env: {} });
    Object.assign(host, { origin: "http://127.0.0.1:12345" });
    const status = vi.spyOn(host, "status").mockResolvedValue({ running: true, installed: true, agentInstalled: true, platform: "darwin", platforms: [] });
    const installed = vi.spyOn(host as unknown as { installed: () => Promise<boolean> }, "installed").mockResolvedValue(true);
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ simulators: [{ id: "simulator-id", name: "iPhone", platform: "ios", booted: true, physical: false }] }));
    let opened = false;
    const command = vi.spyOn(deviceProcesses, "deviceCommand").mockImplementation(async (_exe, args) => {
      if (args[1] === "session") return '{"success":true,"data":{"sessions":[]}}';
      expect(args).toContain("--udid"); expect(args).toContain("simulator-id");
      if (args[1] === "open") opened = true;
      else if (!opened) throw new Error("SESSION_NOT_FOUND");
      return '{"success":true}';
    });
    try {
      await expect(host.action("simulator-id", { type: "home" })).resolves.toContain('"success":true');
      expect(command.mock.calls.map((call) => call[1][1])).toEqual(["session", "open", "home"]);
    } finally { command.mockRestore(); fetch.mockRestore(); installed.mockRestore(); status.mockRestore(); await rm(directory, { recursive: true, force: true }); }
  });
  it("captures a simulator through the pinned hub POST-only screenshot endpoint", async () => {
    const host = new DeviceHost("/nonexistent-imece-device-cache", { env: {} });
    Object.assign(host, { origin: "http://127.0.0.1:12345" });
    const status = vi.spyOn(host, "status").mockResolvedValue({ running: true, installed: true, agentInstalled: false, platform: "darwin", platforms: [] });
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      if (String(url).endsWith("/api/devices")) return Response.json({ simulators: [{ id: "simulator-id", name: "iPhone", platform: "ios", version: "27", booted: true, physical: false }] });
      // expo-device-hub 0.12.0 serve-sim returns 405 for GET screenshots.
      if (init?.method !== "POST") return new Response("method not allowed", { status: 405 });
      return new Response(new Uint8Array([137, 80, 78, 71]), { headers: { "Content-Type": "image/png" } });
    });
    try {
      const frame = await host.capture("simulator-id");
      expect(frame.mime).toBe("image/png");
      expect(Buffer.from(frame.base64, "base64")).toEqual(Buffer.from([137, 80, 78, 71]));
    } finally { fetch.mockRestore(); status.mockRestore(); }
  });
  it("creates only known action argument arrays", () => {
    expect(deviceActionArgs({ type: "press", x: 10, y: 20 })).toEqual(["press", "10", "20"]);
    expect(deviceActionArgs({ type: "type", text: "hello; whoami" })).toEqual(["type", "hello; whoami"]);
    expect(() => deviceActionArgs({ type: "press", x: -1, y: 20 })).toThrow();
    expect(() => deviceActionArgs({ type: "type", text: "--config=/private" })).toThrow();
    expect(() => deviceActionArgs({ type: "shell", text: "exec" } as never)).toThrow("Unsupported");
  });
  it("does not start or install on status and reports unsupported SDKs", async () => {
    const host = new DeviceHost("/nonexistent-imece-device-cache", { platform: "linux", env: {} });
    const status = await host.status();
    expect(status.running).toBe(false); expect(status.installed).toBe(false); expect(status.platforms.every((platform) => !platform.available)).toBe(true);
    await expect(host.setup(false)).rejects.toThrow("SDK");
    await expect(host.capture("arbitrary")).rejects.toThrow("stopped");
    await host.dispose();
    await expect(host.start()).rejects.toThrow("disposed");
  });
});
