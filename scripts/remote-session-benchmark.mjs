import { build } from "esbuild";
import { mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { join } from "node:path";

const iterations = Math.max(1, Number(process.argv[2] ?? 5) || 5);
const selectedFixture = process.argv[3];
const scratch = join(process.cwd(), ".scratch");
const bundle = join(scratch, "remote-session-benchmark.bundle.mjs");
mkdirSync(scratch, { recursive: true });
await build({ entryPoints: ["scripts/remote-session-benchmark.ts"], outfile: bundle,
  bundle: true, platform: "node", format: "esm", target: "node24" });
const { runRemoteSessionBenchmark } = await import(`${pathToFileURL(bundle).href}?run=${Date.now()}`);
console.log(JSON.stringify(runRemoteSessionBenchmark(iterations, selectedFixture), null, 2));
