import { performance } from "node:perf_hooks";
import {
  applySessionSync,
  type SessionSync,
} from "../src/features/connections/model/protocol";
import { partialSessionSync, transcriptPage } from "../host/transcriptPage";
import { SyncTransfers } from "../host/sync-transfer";
import {
  makeRemoteSessionBenchmarkFixture,
  remoteSessionBenchmarkFixtures,
  type RemoteSessionBenchmarkFixture,
} from "./remote-session-benchmark";

type Mode = "full" | "lazy";
type PageMetadata = { before?: number; totalBlocks: number; revision: number };
type TransferResponse =
  SessionSync | { kind: "chunked"; transfer: string; length: number };

function deliver(
  sessionId: string,
  sync: SessionSync,
  pageMetadata?: PageMetadata,
) {
  const transfers = new SyncTransfers();
  const hostResponse = transfers.respond(sessionId, sync);
  const packet = JSON.parse(
    JSON.stringify(
      pageMetadata
        ? { ...pageMetadata, value: undefined, sync: hostResponse }
        : hostResponse,
    ),
  ) as TransferResponse | (PageMetadata & { sync: TransferResponse });
  const metadata = pageMetadata
    ? (packet as PageMetadata & { sync: TransferResponse })
    : undefined;
  let response: TransferResponse = metadata
    ? metadata.sync
    : (packet as TransferResponse);
  if (response.kind !== "chunked") return { sync: response, metadata };
  let text = "";
  let offset = 0;
  while (offset < response.length) {
    const chunk = JSON.parse(
      JSON.stringify(transfers.chunk(sessionId, response.transfer, offset)),
    ) as { data: string };
    text += chunk.data;
    offset += chunk.data.length;
  }
  if (text.length !== response.length)
    throw new Error("Assembled transfer length mismatch");
  return { sync: JSON.parse(text) as SessionSync, metadata };
}

function fullDelta(fixture: RemoteSessionBenchmarkFixture) {
  // Materialize one identical flat DB-like source before either measurement;
  // otherwise full sync flattens V8 repeat-string ropes that lazy history leaves untouched.
  const source = JSON.parse(
    JSON.stringify(makeRemoteSessionBenchmarkFixture(fixture)),
  ) as ReturnType<typeof makeRemoteSessionBenchmarkFixture>;
  const changedIndex = source.session.blocks.length - 1;
  const changed = {
    ...source.session.blocks[changedIndex]!,
    text: "updated tail",
  };
  const blocks = source.session.blocks.map((block, index) =>
    index === changedIndex ? changed : block,
  );
  const next = {
    ...source,
    revision: 2,
    updatedAt: 2,
    session: { ...source.session, blocks },
  };
  const { blocks: _allBlocks, ...session } = next.session;
  const delta: SessionSync = {
    kind: "delta",
    base: 1,
    value: {
      projectId: next.projectId,
      revision: next.revision,
      updatedAt: next.updatedAt,
      status: next.status,
      session,
    },
    blockIds: blocks.map((block) => block.id),
    blocks: [changed],
  };
  return { source, next, delta };
}

function buildOperation(fixture: RemoteSessionBenchmarkFixture, mode: Mode) {
  const { source, next, delta } = fullDelta(fixture);
  const expectedTailIds = next.session.blocks
    .slice(-100)
    .map((block) => block.id);
  if (mode === "full") {
    return () => {
      const initial = deliver(source.session.id, {
        kind: "snapshot",
        value: source,
      }).sync;
      if (initial.kind !== "snapshot")
        throw new Error("Full initial snapshot was not reconstructed");
      let client = applySessionSync(undefined, initial);
      const update = deliver(source.session.id, delta).sync;
      client = applySessionSync(client, update);
      const visibleIds = client.session.blocks
        .slice(-100)
        .map((block) => block.id);
      if (
        client.revision !== 2 ||
        JSON.stringify(visibleIds) !== JSON.stringify(expectedTailIds)
      )
        throw new Error("Full flow produced the wrong final visible tail");
      return client;
    };
  }
  return () => {
    const page = transcriptPage(source);
    const pageResponse = deliver(
      source.session.id,
      {
        kind: "snapshot",
        value: page.value,
      },
      {
        before: page.before,
        totalBlocks: page.totalBlocks,
        revision: page.revision,
      },
    );
    if (pageResponse.sync.kind !== "snapshot" || !pageResponse.metadata)
      throw new Error("Tail page snapshot was not reconstructed");
    const tail = {
      ...pageResponse.sync.value,
      history: {
        before: pageResponse.metadata.before,
        revision: pageResponse.metadata.revision,
        totalBlocks: pageResponse.metadata.totalBlocks,
      },
    };
    const loadedIds = tail.session.blocks.map((block) => block.id);
    const partial = partialSessionSync(delta, next, loadedIds);
    if (!partial || partial.kind !== "delta" || partial.partial !== true)
      throw new Error(
        "Production partial sync helper did not return a partial delta",
      );
    let client = applySessionSync(undefined, { kind: "snapshot", value: tail });
    const update = deliver(source.session.id, partial).sync;
    client = applySessionSync(client, update);
    const visibleIds = client.session.blocks.map((block) => block.id);
    if (
      client.revision !== 2 ||
      JSON.stringify(visibleIds) !== JSON.stringify(expectedTailIds)
    )
      throw new Error("Lazy flow produced the wrong final visible tail");
    return client;
  };
}

function summarize(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (p: number) =>
    sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)]!;
  return { p50: percentile(0.5), p95: percentile(0.95), max: sorted.at(-1)! };
}

function memory() {
  const { rss, heapTotal, heapUsed, external, arrayBuffers } =
    process.memoryUsage();
  return { rss, heapTotal, heapUsed, external, arrayBuffers };
}

function runWorker(mode: Mode, fixtureName: string, targetMs: number) {
  if (!Number.isFinite(targetMs) || targetMs < 500 || targetMs > 5_000)
    throw new Error("target-ms must be between 500 and 5000");
  const fixture = remoteSessionBenchmarkFixtures.find(
    (item) => item.name === fixtureName,
  );
  if (!fixture) throw new Error(`Unknown fixture: ${fixtureName}`);
  if (typeof global.gc !== "function")
    throw new Error("Worker requires --expose-gc");
  const expectedBlocks = Array.from(
    { length: fixture.blocks },
    (_, index) => `b${index}`,
  );
  if (fixture.toolBytes)
    expectedBlocks.splice(fixture.toolIndex!, 0, "tool-huge");
  if (fixture.tailToolBytes) expectedBlocks.push("tool-huge-tail");
  const expectedTailIds = expectedBlocks.slice(-100);
  const operation = buildOperation(fixture, mode);
  for (let i = 0; i < 2; i++) operation();
  const timingSamples = new Array<number>(4096);
  global.gc();
  global.gc();
  const baseline = memory();
  let result: ReturnType<typeof operation> | undefined;
  const sampledHighWater = { ...baseline };
  const cpuStart = process.cpuUsage();
  const wallStart = performance.now();
  let operationCount = 0;
  let batch = 0;
  do {
    const start = performance.now();
    result = operation();
    timingSamples[operationCount % timingSamples.length] =
      performance.now() - start;
    operationCount++;
    if (++batch === 8) {
      batch = 0;
      const current = memory();
      for (const key of Object.keys(current) as (keyof typeof current)[])
        sampledHighWater[key] = Math.max(sampledHighWater[key], current[key]);
    }
  } while (
    performance.now() - wallStart < targetMs &&
    operationCount < 100_000
  );
  const wallMs = performance.now() - wallStart;
  const cpu = process.cpuUsage(cpuStart);
  const operationWallMs = summarize(
    timingSamples.slice(0, Math.min(operationCount, timingSamples.length)),
  );
  timingSamples.fill(0);
  if (batch) {
    const current = memory();
    for (const key of Object.keys(current) as (keyof typeof current)[])
      sampledHighWater[key] = Math.max(sampledHighWater[key], current[key]);
  }
  for (let i = 0; i < 2; i++) {
    result = operation();
    const current = memory();
    for (const key of Object.keys(current) as (keyof typeof current)[])
      sampledHighWater[key] = Math.max(sampledHighWater[key], current[key]);
  }
  const transientAfterMeasurement = memory();
  for (let i = 0; i < 2; i++) global.gc();
  const retained = memory();
  if (
    !result ||
    result.revision !== 2 ||
    JSON.stringify(
      result.session.blocks.slice(-100).map((block) => block.id),
    ) !== JSON.stringify(expectedTailIds)
  )
    throw new Error("No validated final visible tail retained");
  const sourceBlocks =
    fixture.blocks +
    (fixture.toolBytes ? 1 : 0) +
    (fixture.tailToolBytes ? 1 : 0);
  return {
    format: "monocode.remote-session-resource-worker.v1",
    mode,
    fixture: fixture.name,
    runtime: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    measurement: {
      targetMs,
      warmupOperations: 2,
      operations: operationCount,
      wallMs,
      cpuUserMs: cpu.user / 1000,
      cpuSystemMs: cpu.system / 1000,
      cpuTotalMs: (cpu.user + cpu.system) / 1000,
      cpuUserMsPerOperation: cpu.user / 1000 / operationCount,
      cpuSystemMsPerOperation: cpu.system / 1000 / operationCount,
      cpuTotalMsPerOperation: (cpu.user + cpu.system) / 1000 / operationCount,
      operationWallMs,
      wallMsPerOperation: wallMs / operationCount,
    },
    memory: {
      unit: "bytes",
      fixtureSourceBlocksRetained: sourceBlocks,
      baselineAfterFixtureGc: baseline,
      sampledHighWaterAtOperationBoundaries: sampledHighWater,
      transientAfterTwoAdditionalOperations: transientAfterMeasurement,
      retainedClientStateAfterGc: retained,
      retainedHeapDeltaFromFixtureBaseline:
        retained.heapUsed - baseline.heapUsed,
      retainedRssDeltaFromFixtureBaseline: retained.rss - baseline.rss,
      lifetimeMaxRssRawPlatformUnits: process.resourceUsage().maxRSS,
    },
    finalState: {
      revision: result.revision,
      clientLoadedBlocks: result.session.blocks.length,
      visibleTailBlocks: Math.min(result.session.blocks.length, 100),
      visibleTailOrderValid: true,
    },
  };
}

function main() {
  const [, , marker, modeArg, fixtureName, targetArg] = process.argv;
  if (
    marker !== "--worker" ||
    (modeArg !== "full" && modeArg !== "lazy") ||
    !fixtureName ||
    !targetArg
  )
    throw new Error("Worker usage: --worker <full|lazy> <fixture> <target-ms>");
  console.log(
    JSON.stringify(runWorker(modeArg, fixtureName, Number(targetArg))),
  );
}

main();
