import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The desktop's native layer forwards only allowlisted host methods
// (`supported_remote_method` in src-tauri/src/remote.rs). A method the app
// calls but the allowlist lacks fails at runtime with "Unsupported remote
// operation", which unit tests that mock `remoteRequest` never see.

const root = join(__dirname, "..", "..", "..", "..");

function allowlist(): Set<string> {
  const rust = readFileSync(join(root, "src-tauri", "src", "remote.rs"), "utf8");
  const body = rust.match(/fn supported_remote_method[\s\S]*?matches!\(([\s\S]*?)\n\s*\)/);
  if (!body) throw new Error("supported_remote_method not found");
  return new Set([...body[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]));
}

function hostMethods(): Set<string> {
  const server = readFileSync(join(root, "host", "server.ts"), "utf8");
  return new Set([...server.matchAll(/case "([a-zA-Z]+\.[a-zA-Z]+)":/g)].map((match) => match[1]));
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("remote method allowlist", () => {
  it("lets through every host method the desktop app calls", () => {
    const allowed = allowlist();
    const served = hostMethods();
    const missing = new Set<string>();
    for (const file of sourceFiles(join(root, "src"))) {
      for (const match of readFileSync(file, "utf8").matchAll(/["'`]([a-zA-Z]+\.[a-zA-Z]+)["'`]/g)) {
        if (served.has(match[1]) && !allowed.has(match[1])) missing.add(match[1]);
      }
    }
    expect([...missing].sort()).toEqual([]);
  });
});
