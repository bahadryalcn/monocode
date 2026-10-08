import { describe, expect, it } from "vitest";
import { deviceCommand } from "./device-process";
describe("owned device subprocesses", () => {
  it("passes input literally without a shell", async () => {
    const output = await deviceCommand(process.execPath, ["-e", "process.stdout.write(process.argv[1])", "hello;$(whoami)"]);
    expect(output).toBe("hello;$(whoami)");
  });
  it("terminates hung commands and rejects instead of claiming success", async () => {
    await expect(deviceCommand(process.execPath, ["-e", "setInterval(()=>{},1000)"], { timeoutMs: 50 })).rejects.toThrow("timed out");
  });
  it("rejects output above the cap", async () => {
    await expect(deviceCommand(process.execPath, ["-e", "process.stdout.write('x'.repeat(2*1024*1024))"])).rejects.toThrow("1 MiB");
  });
});
