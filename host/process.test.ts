import { expect, it, vi } from "vitest";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { providerLaunch, resolveProvider } from "./process";

it.each(["bundle/gemini.js", "dist/index.js"])(
  "launches the Gemini Windows npm package at %s without interpreting a shell wrapper",
  async (relative) => {
    const directory = mkdtempSync(join(tmpdir(), "monocode-gemini-launch-"));
    const launcher = join(directory, "gemini.cmd");
    const entry = join(directory, "node_modules/@google/gemini-cli", relative);
    mkdirSync(join(entry, ".."), { recursive: true });
    writeFileSync(entry, "// fixture");
    writeFileSync(launcher, "@echo wrapper must not execute");
    try {
      expect(await providerLaunch(launcher, ["--experimental-acp"], "win32")).toEqual({
        command: process.execPath, args: [entry, "--experimental-acp"],
      });
    } finally { rmSync(directory, { recursive: true, force: true }); }
  },
);

it.each(["cursor", "pi", "fx"] as const)(
  "does not execute an unrelated ambiguous %s binary while resolving providers",
  async (provider) => {
    const directory = mkdtempSync(
      join(tmpdir(), "monocode-provider-identity-"),
    );
    const name = provider === "cursor" ? "agent" : provider;
    const candidate = join(directory, name);
    const sentinel = join(directory, "executed");
    writeFileSync(candidate, `#!/bin/sh\nprintf bad > '${sentinel}'\n`);
    chmodSync(candidate, 0o755);
    vi.stubEnv("PATH", directory);
    try {
      let resolved: string | undefined;
      try {
        resolved = await resolveProvider(provider);
      } catch {
        /* no matching provider is expected on CI */
      }
      expect(resolved).not.toBe(candidate);
      expect(existsSync(sentinel)).toBe(false);
    } finally {
      vi.unstubAllEnvs();
      rmSync(directory, { recursive: true, force: true });
    }
  },
);

it.runIf(process.platform !== "win32")(
  "recognizes a Cursor agent shim without executing it",
  async () => {
    const directory = mkdtempSync(join(tmpdir(), "monocode-cursor-identity-"));
    const targetDirectory = join(directory, "cursor-agent-package");
    const target = join(targetDirectory, "cursor-agent");
    const candidate = join(directory, "agent");
    const sentinel = join(directory, "executed");
    mkdirSync(targetDirectory);
    writeFileSync(target, `#!/bin/sh\nprintf bad > '${sentinel}'\n`);
    chmodSync(target, 0o755);
    symlinkSync(target, candidate);
    vi.stubEnv("PATH", directory);
    try {
      expect(await resolveProvider("cursor")).toBe(candidate);
      expect(existsSync(sentinel)).toBe(false);
    } finally {
      vi.unstubAllEnvs();
      rmSync(directory, { recursive: true, force: true });
    }
  },
);
