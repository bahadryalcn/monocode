import { build } from "esbuild";
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import { execFileSync, spawnSync } from "node:child_process";
import { join } from "node:path";

const repetitions = Number(process.argv[2] ?? 3);
const selectedFixture = process.argv[3] === "-" ? undefined : process.argv[3];
const targetMs = Number(process.argv[4] ?? 750);
if (!Number.isInteger(repetitions) || repetitions < 3 || repetitions > 10)
  throw new Error("repetitions must be an integer from 3 to 10");
if (!Number.isFinite(targetMs) || targetMs < 500 || targetMs > 5_000)
  throw new Error("target-ms must be from 500 to 5000");

const fixtures = ["small", "long", "large-tool", "oversized-tail-tool"];
if (selectedFixture && !fixtures.includes(selectedFixture))
  throw new Error(
    `unknown fixture '${selectedFixture}'; choose ${fixtures.join(", ")}`,
  );
const selected = selectedFixture ? [selectedFixture] : fixtures;
const scratch = join(process.cwd(), ".scratch");
mkdirSync(scratch, { recursive: true });
const bundle = join(scratch, "remote-session-resource-benchmark.bundle.mjs");
await build({
  entryPoints: ["scripts/remote-session-resource-benchmark.ts"],
  outfile: bundle,
  bundle: true,
  platform: "node",
  format: "esm",
  target: `node${Number(process.versions.node.split(".")[0])}`,
});

const runs = [];
for (const fixture of selected) {
  for (let repetition = 0; repetition < repetitions; repetition++) {
    const order = repetition % 2 === 0 ? ["full", "lazy"] : ["lazy", "full"];
    for (const mode of order) {
      const child = spawnSync(
        process.execPath,
        ["--expose-gc", bundle, "--worker", mode, fixture, String(targetMs)],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          maxBuffer: 1024 * 1024,
          windowsHide: true,
        },
      );
      if (child.error) throw child.error;
      if (child.status !== 0)
        throw new Error(
          `worker ${mode}/${fixture} failed (${child.status}): ${child.stderr}`,
        );
      try {
        runs.push({
          repetition: repetition + 1,
          ...JSON.parse(child.stdout.trim()),
        });
      } catch (error) {
        throw new Error(
          `invalid worker JSON for ${mode}/${fixture}: ${String(error)}\n${child.stdout}\n${child.stderr}`,
        );
      }
    }
  }
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
};
const summaries = selected.map((fixture) => {
  const one = (mode) => {
    const group = runs.filter(
      (run) => run.fixture === fixture && run.mode === mode,
    );
    const med = (pick) => median(group.map(pick));
    return {
      freshProcesses: group.length,
      medianOperations: med((run) => run.measurement.operations),
      medianCpuUserMsPerOperation: med(
        (run) => run.measurement.cpuUserMsPerOperation,
      ),
      medianCpuSystemMsPerOperation: med(
        (run) => run.measurement.cpuSystemMsPerOperation,
      ),
      medianCpuTotalMsPerOperation: med(
        (run) => run.measurement.cpuTotalMsPerOperation,
      ),
      medianOperationWallP50Ms: med(
        (run) => run.measurement.operationWallMs.p50,
      ),
      medianOperationWallP95Ms: med(
        (run) => run.measurement.operationWallMs.p95,
      ),
      medianFixtureBaselineHeapBytes: med(
        (run) => run.memory.baselineAfterFixtureGc.heapUsed,
      ),
      medianSampledHighWaterHeapBytes: med(
        (run) => run.memory.sampledHighWaterAtOperationBoundaries.heapUsed,
      ),
      medianRetainedClientHeapBytes: med(
        (run) => run.memory.retainedClientStateAfterGc.heapUsed,
      ),
      medianRetainedHeapDeltaBytes: med(
        (run) => run.memory.retainedHeapDeltaFromFixtureBaseline,
      ),
      medianSampledHighWaterRssBytes: med(
        (run) => run.memory.sampledHighWaterAtOperationBoundaries.rss,
      ),
      medianSampledHighWaterRssMiB:
        med((run) => run.memory.sampledHighWaterAtOperationBoundaries.rss) /
        (1024 * 1024),
      medianRetainedRssDeltaBytes: med(
        (run) => run.memory.retainedRssDeltaFromFixtureBaseline,
      ),
      medianRetainedHeapDeltaMiB:
        med((run) => run.memory.retainedHeapDeltaFromFixtureBaseline) /
        (1024 * 1024),
      medianLifetimeMaxRssRawPlatformUnits: med(
        (run) => run.memory.lifetimeMaxRssRawPlatformUnits,
      ),
    };
  };
  return { fixture, full: one("full"), lazy: one("lazy") };
});

const artifact = {
  format: "monocode.remote-session-resource-benchmark.v1",
  generatedAt: new Date().toISOString(),
  source:
    "working tree; uses production transcriptPage, partialSessionSync, SyncTransfers, and applySessionSync helpers",
  sourceHead: `${execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim()} + dirty working tree`,
  environment: {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    cpu: os.cpus()[0]?.model,
    logicalCpuCount: os.cpus().length,
    totalSystemMemoryBytes: os.totalmem(),
  },
  methodology: {
    repetitionsPerModeFixture: repetitions,
    targetMeasurementMsPerFreshProcess: targetMs,
    workers:
      "serial fresh Node subprocesses with --expose-gc; full/lazy order alternates by repetition; no benchmark workers overlap",
    operation:
      "serialize host response, JSON parse, perform SyncTransfers assembly when chunked, and apply snapshot+delta; lazy additionally constructs a production tail page and production partial delta",
    warmupAndReuse:
      "each fresh worker constructs and JSON-materializes the authoritative source once before baseline, constructs the next revision once, runs two untimed warmups, retains the same flat source objects for each mode, and regenerates per-operation transfer/page/delta transforms. Production block preview WeakMap entries are primed by lazy warmups and reused, as in a warm running process",
    cpu: "process.cpuUsage user/system delta over calibrated batch; wall p50/p95 is per complete operation; this is process work, not instantaneous CPU percent",
    memory:
      "fixture/source state retained equally as baseline; post-GC retained client state and RSS deltas are reported. Sampled high-water checks memory at operation boundaries every 8 operations and is not a true within-operation peak; process maxRSS is lifetime high-water including warm-up, in raw platform units",
    limitations:
      "one Node process simulates host helpers plus a client; no installed app, live host, network, renderer/WebView, native/system idle CPU or full app idle RAM measured. The host's authoritative full transcript is retained in both cases.",
  },
  summaries,
  runs,
};
const stamp = new Date()
  .toISOString()
  .replaceAll(":", "-")
  .replaceAll(".", "-");
const output = join(
  scratch,
  `remote-session-resource-${selected.join("_")}-${stamp}.json`,
);
writeFileSync(output, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ output, ...artifact }, null, 2));
