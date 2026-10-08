import { spawn, type ChildProcess } from "node:child_process";

/** Hidden, argument-array-only subprocess. Hard time and output bounds. */
export function deviceCommand(command: string, args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number } = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, windowsHide: true, shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let output = ""; let bytes = 0; let failure: Error | undefined;
    const timer = setTimeout(() => { failure = new Error("Device command timed out"); child.kill(); }, options.timeoutMs ?? 30_000);
    const collect = (chunk: Buffer) => { bytes += chunk.length; if (bytes > 1024 * 1024) { failure = new Error("Device command output exceeds 1 MiB"); child.kill(); } else output += chunk.toString(); };
    child.stdout?.on("data", collect); child.stderr?.on("data", collect);
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("close", (code) => { clearTimeout(timer); if (failure) reject(failure); else if (code !== 0) reject(new Error(`Device command failed (${code}): ${output.slice(-2000)}`)); else resolve(output); });
  });
}
export async function stopDeviceChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => { child.kill("SIGKILL"); resolve(); }, 3000);
    child.once("close", () => { clearTimeout(timer); resolve(); });
    child.kill();
  });
}
