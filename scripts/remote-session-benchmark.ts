import { performance } from "node:perf_hooks";
import type { Block } from "../src/features/sessions/model/session";
import type {
  HostSession,
  SessionSync,
} from "../src/features/connections/model/protocol";
import { applySessionSync } from "../src/features/connections/model/protocol";
import { partialSessionSync, transcriptPage } from "../host/transcriptPage";
import { SyncTransfers } from "../host/sync-transfer";

export type RemoteSessionBenchmarkFixture = {
  name: string;
  blocks: number;
  blockBytes: number;
  toolBytes?: number;
  toolIndex?: number;
  tailToolBytes?: number;
};
export const remoteSessionBenchmarkFixtures: RemoteSessionBenchmarkFixture[] = [
  { name: "small", blocks: 12, blockBytes: 300 },
  { name: "long", blocks: 2_000, blockBytes: 2_400 },
  {
    name: "large-tool",
    blocks: 80,
    blockBytes: 2_400,
    toolIndex: 40,
    toolBytes: 17 * 1024 * 1024,
  },
  {
    name: "oversized-tail-tool",
    blocks: 80,
    blockBytes: 2_400,
    tailToolBytes: 17 * 1024 * 1024,
  },
];

const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value));
const measure = <T>(fn: () => T) => {
  const start = performance.now();
  const value = fn();
  return { value, ms: performance.now() - start };
};
const text = (size: number) => "x".repeat(size);

export function makeRemoteSessionBenchmarkFixture(
  fixture: RemoteSessionBenchmarkFixture,
): HostSession {
  const blocks = Array.from({ length: fixture.blocks }, (_, index) => ({
    id: `b${index}`,
    role: "assistant" as const,
    text: text(fixture.blockBytes),
  })) as Block[];
  if (fixture.toolBytes)
    blocks.splice(fixture.toolIndex!, 0, {
      id: "tool-huge",
      role: "tool",
      text: text(fixture.toolBytes),
    });
  if (fixture.tailToolBytes)
    blocks.push({
      id: "tool-huge-tail",
      role: "tool",
      text: text(fixture.tailToolBytes),
    });
  return {
    projectId: "fixture-project",
    revision: 1,
    updatedAt: 1,
    status: "idle",
    session: {
      id: `fixture-${fixture.name}`,
      cwd: "/fixture",
      harness: "codex",
      model: "fixture",
      runtimeMode: "supervised",
      title: fixture.name,
      blocks,
    },
  } as HostSession;
}

function transferMetrics(sessionId: string, sync: SessionSync) {
  const transfers = new SyncTransfers();
  const initial = transfers.respond(sessionId, sync);
  let responseBytes = bytes(initial),
    requestCount = 1,
    chunkRequests = 0;
  if (initial.kind === "chunked") {
    let offset = 0;
    while (offset < initial.length) {
      const chunk = transfers.chunk(sessionId, initial.transfer, offset);
      responseBytes += bytes(chunk);
      offset += chunk.data.length;
      requestCount++;
      chunkRequests++;
    }
  }
  return { responseBytes, requestCount, chunkRequests };
}

function runFixture(
  fixture: RemoteSessionBenchmarkFixture,
  iterations: number,
) {
  const source = makeRemoteSessionBenchmarkFixture(fixture);
  const page = transcriptPage(source);
  const tail: HostSession = {
    ...page.value,
    history: {
      before: page.before,
      revision: page.revision,
      totalBlocks: page.totalBlocks,
    },
  };
  const loadedIds = tail.session.blocks.map((block) => block.id);
  const changedIndex = source.session.blocks.length - 1;
  const changed = {
    ...source.session.blocks[changedIndex]!,
    text: "updated tail",
  };
  const nextBlocks = source.session.blocks.map((block, index) =>
    index === changedIndex ? changed : block,
  );
  const next: HostSession = {
    ...source,
    revision: 2,
    updatedAt: 2,
    session: { ...source.session, blocks: nextBlocks },
  };
  const { blocks: _blocks, ...session } = next.session;
  const fullDelta: SessionSync = {
    kind: "delta",
    base: 1,
    value: {
      projectId: next.projectId,
      revision: next.revision,
      updatedAt: next.updatedAt,
      status: next.status,
      session,
    },
    blockIds: nextBlocks.map((block) => block.id),
    blocks: [changed],
  };
  const delta = partialSessionSync(fullDelta, next, loadedIds);
  if (!delta || delta.kind !== "delta" || !delta.partial)
    throw new Error("Fixture partial delta was not produced");
  const applied = measure(() => applySessionSync(tail, delta));
  const expectedIds = nextBlocks
    .slice(-loadedIds.length)
    .map((block) => block.id);

  const full = transferMetrics(source.session.id, {
    kind: "snapshot",
    value: source,
  });
  const fullUpdate = transferMetrics(source.session.id, fullDelta);
  const pageTransfer = transferMetrics(source.session.id, {
    kind: "snapshot",
    value: tail,
  });
  const update = transferMetrics(source.session.id, delta);
  const pageResponseBytes =
    bytes({
      before: page.before,
      totalBlocks: page.totalBlocks,
      revision: page.revision,
    }) + pageTransfer.responseBytes;
  const requestBytes = bytes({
    sessionId: source.session.id,
    revision: 1,
    partial: true,
    loadedBlockIds: loadedIds,
    windowStart: page.before,
  });
  const fullRepeated = Array.from(
    { length: iterations },
    () => measure(() => bytes({ snapshot: source, delta: fullDelta })).ms,
  ).sort((a, b) => a - b);
  const tailRepeated = Array.from(
    { length: iterations },
    () => measure(() => bytes({ page: tail, delta })).ms,
  ).sort((a, b) => a - b);
  const percentile = (samples: number[], p: number) =>
    samples[Math.min(samples.length - 1, Math.ceil(p * samples.length) - 1)]!;
  const fullWithChangeBytes = full.responseBytes + fullUpdate.responseBytes;
  const tailWithChangeBytes = pageResponseBytes + update.responseBytes;
  return {
    name: fixture.name,
    iterations,
    fullSnapshotResponseBytes: full.responseBytes,
    fullSnapshotPlusChangeResponseBytes: fullWithChangeBytes,
    tailPageResponseBytes: pageResponseBytes,
    partialSyncRequestBytes: requestBytes,
    partialDeltaResponseBytes: update.responseBytes,
    tailPlusOneChangeResponseBytes: tailWithChangeBytes,
    responseBytesAvoidedWithOneChange:
      fullWithChangeBytes - tailWithChangeBytes,
    totalBlocks: source.session.blocks.length,
    tailPageBlocks: tail.session.blocks.length,
    tailWithinOneMiBTarget: pageResponseBytes <= 1024 * 1024,
    largeBlockPreviewBytes: tail.session.blocks
      .filter((block) => block.id.includes("tool-huge"))
      .map(bytes),
    networkRequestCounts: {
      fullSnapshotPlusChange: full.requestCount + fullUpdate.requestCount,
      tailPagePlusOneChange: pageTransfer.requestCount + update.requestCount,
      fullFlowChunkRequests: full.chunkRequests + fullUpdate.chunkRequests,
      partialFlowChunkRequests:
        pageTransfer.chunkRequests + update.chunkRequests,
    },
    loadedTailDeltaApplied: applied.value.revision === 2,
    tailOrderPreserved:
      JSON.stringify(applied.value.session.blocks.map((block) => block.id)) ===
      JSON.stringify(expectedIds),
    localApplyMs: Number(applied.ms.toFixed(3)),
    repeatedSerializationMs: {
      fullSnapshotPlusChange: {
        p50: Number(percentile(fullRepeated, 0.5).toFixed(3)),
        p95: Number(percentile(fullRepeated, 0.95).toFixed(3)),
        max: Number(fullRepeated.at(-1)!.toFixed(3)),
      },
      tailPagePlusChange: {
        p50: Number(percentile(tailRepeated, 0.5).toFixed(3)),
        p95: Number(percentile(tailRepeated, 0.95).toFixed(3)),
        max: Number(tailRepeated.at(-1)!.toFixed(3)),
      },
    },
  };
}

export function runRemoteSessionBenchmark(
  iterations = 5,
  selectedFixture?: string,
) {
  const selected = remoteSessionBenchmarkFixtures.filter(
    (fixture) => !selectedFixture || fixture.name === selectedFixture,
  );
  if (!selected.length) throw new Error(`Unknown fixture: ${selectedFixture}`);
  return {
    format: "monocode.remote-session-fixture-benchmark.v1",
    measured:
      "local fixture JSON response serialization, chunk assembly counts, and in-process delta apply only; excludes request headers, network, host runtime, idle CPU, renderer, paint, and device costs",
    runtime: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    pageContract: {
      maxBlocks: 100,
      targetBytes: 1024 * 1024,
      blockPreviewMaxBytes: 64 * 1024,
    },
    results: selected.map((fixture) =>
      runFixture(fixture, Math.max(1, iterations)),
    ),
  };
}
