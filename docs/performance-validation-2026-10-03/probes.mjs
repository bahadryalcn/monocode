// Isolated audit probes. Uses synthetic values and an in-memory database only.
// Run from the repository root: node docs/performance-validation-2026-10-03/probes.mjs
import { build } from "esbuild";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { writeFile } from "node:fs/promises";

async function loadSource(path, stubs = {}) {
  const compiled = await build({
    entryPoints: [path], bundle: true, write: false,
    platform: "node", format: "esm", logLevel: "silent",
    plugins: [{ name: "isolated-audit-dependencies", setup(builder) {
      builder.onResolve({ filter: /.*/ }, (args) =>
        Object.hasOwn(stubs, args.path) ? { path: args.path, namespace: "audit" } : undefined);
      builder.onLoad({ filter: /.*/, namespace: "audit" }, (args) => ({ contents: stubs[args.path], loader: "js" }));
    } }],
  });
  return import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString("base64")}`);
}

const { DesktopLive } = await loadSource("host/desktopLive.ts");
const { runDesktopLiveTick } = await loadSource("src/features/connections/model/desktopLive.ts");
const { withRemoteAttachmentPreviews } = await loadSource("src/features/connections/model/remoteAttachmentPreviews.ts");
const { syncPush, syncPull } = await loadSource("host/sync.ts");
const { mergeAdoptedSession } = await loadSource("src/features/connections/model/adoptedSessions.ts");
const { HostStore } = await loadSource("host/store.ts");

const results = [];

// Execute the actual cache and hook bodies against a synthetic IPC bridge.
// These probes verify routing/call counts, not real React rendering or networking.
globalThis.auditEffects = [];
globalThis.auditCalls = [];
globalThis.window = { addEventListener() {}, removeEventListener() {}, dispatchEvent() {} };
const storage = new Map();
globalThis.localStorage = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
const remoteHealthStub = "export function reportRemoteConnection(){}; export function notifyRemoteRecovered(){}; export function readRemoteConnection(){return {status:'online'}}; export function recordRemoteConnection(){}; export function resetRemoteConnection(){};";
const machine = { id: "synthetic-machine", environmentId: "synthetic-environment" };
const pendingLists = [];
globalThis.auditInvoke = (command, args) => {
  if (command === "remote_machines") return Promise.resolve([machine]);
  if (command === "remote_request" && args.method === "sessions.list") {
    globalThis.auditCalls.push(args.method);
    return new Promise((resolve) => pendingLists.push(resolve));
  }
  throw new Error(`Unexpected synthetic command: ${command}`);
};
const connections = await loadSource("src/features/connections/model/connections.ts", {
  react: "export function useState(initial){return [typeof initial==='function'?initial():initial,()=>{}]}; export function useEffect(effect){const cleanup=effect();if(cleanup)globalThis.auditEffects.push(cleanup)}; export function useSyncExternalStore(subscribe,read){return read()};",
  "@tauri-apps/api/core": "export function invoke(...args){return globalThis.auditInvoke(...args)};",
  "./remoteProjects": "export function remoteProjectFor(){return {environmentId:'synthetic-environment',projectId:'synthetic-project'}};",
  "./remoteHealth": remoteHealthStub,
  "../../settings/model/settings": "export function loadRemoteAutoReconnect(){return true};",
});
await connections.remoteMachineFor(machine.environmentId);
connections.useRemoteProjectSessions("remote://synthetic-environment/project");
connections.useRemoteRailSessions(["remote://synthetic-environment/project"]);
assert.equal(globalThis.auditCalls.length, 2);
results.push({ id: "P05", probe: "Project sidebar and rail start duplicate in-flight sessions.list calls", callsForOneProject: globalThis.auditCalls.length });
for (const cleanup of globalThis.auditEffects) cleanup();
for (const resolve of pendingLists) resolve([]);
await new Promise((resolve) => setTimeout(resolve, 0));

globalThis.auditCalls = [];
const tree = await loadSource("src/features/files/model/fileTree.ts", {
  "../../../platform/tauri/fs": "export function listDir(path){globalThis.auditCalls.push(path);return Promise.resolve([])};",
  "../../connections/model/remoteHealth": remoteHealthStub,
  "../../projects/model/recents": "export function isRemoteProjectPath(path){return path.startsWith('remote://')};",
});
for (const path of ["remote://old-machine/project/closed-folder", "remote://current-machine/project/open-folder", "synthetic-local-folder"])
  await tree.listCachedDir(path);
globalThis.auditCalls = [];
await tree.refreshCachedDirs();
assert.equal(globalThis.auditCalls.length, 3);
assert.ok(globalThis.auditCalls.some((path) => path.includes("old-machine")));
results.push({ id: "P11", probe: "One directory refresh re-reads cached folders of unrelated projects/machines", refreshed: globalThis.auditCalls });
delete globalThis.window;
delete globalThis.localStorage;
delete globalThis.auditInvoke;
delete globalThis.auditEffects;
delete globalThis.auditCalls;

const live = new DesktopLive(() => 1000);
live.beat({ sessions: [{ id: "window-a-session", busy: true }] });
const beforeOtherWindow = live.running("window-a-session", true);
live.beat({ sessions: [{ id: "window-b-session", busy: true }] });
const afterOtherWindow = live.running("window-a-session", true);
assert.equal(beforeOtherWindow, true);
assert.equal(afterOtherWindow, false);
results.push({ id: "P02", probe: "Interleaved window heartbeats", beforeOtherWindow, afterOtherWindow });

live.beat({ sessions: [{ id: "window-a-session", busy: true }] });
live.enqueue({ type: "cancel", commandId: "synthetic-command", sessionId: "window-a-session" });
let stopCount = 0;
const unacked = new Set();
const handled = new Set();
for (let tick = 0; tick < 2; tick++) {
  await runDesktopLiveTick({
    request: (payload) => Promise.resolve(live.beat(payload)),
    sessions: () => [{ id: "window-b-session", busy: true, blocks: [] }],
    handlers: { stop: () => stopCount++, approve() {}, answer() {} },
    unacked, handled,
  });
}
const remainingCommands = live.beat({ sessions: [{ id: "window-a-session", busy: true }] }).commands.length;
assert.equal(stopCount, 0);
assert.equal(remainingCommands, 0);
results.push({ id: "P02", probe: "Wrong window acknowledges another window's Stop", stopCount, remainingCommands });

const snapshot = {
  revision: 1, projectId: "synthetic-project", status: "idle", updatedAt: 1,
  session: { id: "synthetic-session", blocks: [{ id: "b1", role: "user", text: "", attachments: [
    { id: "image1", kind: "image", size: 3, name: "missing.png", mimeType: "image/png" },
  ] }] },
};
let failedImageReads = 0;
let known;
for (let poll = 0; poll < 5; poll++) {
  known = await withRemoteAttachmentPreviews("synthetic-machine", snapshot, known, async () => {
    failedImageReads++;
    throw new Error("Synthetic permanently missing attachment");
  });
}
assert.equal(failedImageReads, 5);
results.push({ id: "P13", probe: "Unchanged revision repeatedly downloads missing image", polls: 5, failedImageReads });

const localSession = { id: "copy", title: "local", blocks: [{ id: "same-block", role: "assistant", text: "new local text" }] };
const staleHost = { session: { ...localSession, blocks: [{ id: "same-block", role: "assistant", text: "old host text" }] }, status: "idle", revision: 1 };
const merged = mergeAdoptedSession(localSession, staleHost);
assert.equal(merged.blocks[0].text, "old host text");
results.push({ id: "P23", probe: "Equal block count does not protect newer local content", newerLocalTextPreserved: false });

const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE sync_records (table_name TEXT, id TEXT, value TEXT, rev INTEGER, updated_at INTEGER, PRIMARY KEY(table_name,id));");
const unicodeValue = { id: "unicode-group", name: "界".repeat(30000) };
const op = { table: "group", id: unicodeValue.id, baseRev: 0, value: unicodeValue };
const pushed = syncPush(db, [op]);
const chars = JSON.stringify(unicodeValue).length;
const bytes = Buffer.byteLength(JSON.stringify(unicodeValue), "utf8");
assert.ok(chars < 65536 && bytes > 65536);
assert.equal(pushed.applied.length, 1);
results.push({ id: "P21", probe: "64 KiB value guard counts characters instead of UTF-8 bytes", chars, bytes, accepted: true });

const ops = Array.from({ length: 199 }, (_, index) => ({
  table: "group", id: `synthetic-group-${index}`, baseRev: 0,
  value: { id: `synthetic-group-${index}`, name: "界".repeat(30000) },
}));
syncPush(db, ops);
const all = syncPull(db, 0);
const pullBytes = Buffer.byteLength(JSON.stringify(all), "utf8");
assert.ok(pullBytes > 16 * 1024 * 1024);
results.push({ id: "P20", probe: "Unpaginated library pull exceeds desktop RPC response cap", records: all.records.length, pullBytes, desktopCap: 16 * 1024 * 1024 });
db.close();

const store = new HostStore(":memory:");
const project = store.addProject("synthetic-project", "synthetic-project");
const largeSession = {
  projectId: project.id, revision: 1, status: "idle", updatedAt: 1,
  session: { id: "large-chat", cwd: project.cwd, harness: "codex", title: "Synthetic chat", model: "synthetic", runtimeMode: "default", blocks: [
    { id: "large-block", role: "assistant", text: "x".repeat(1024 * 1024) },
  ] },
};
store.transaction(() => store.save(largeSession, { type: "audit" }));
// A title-only change still replaces the complete snapshot column.
store.transaction(() => store.save({ ...largeSession, revision: 2, session: { ...largeSession.session, title: "Renamed" } }, { type: "audit" }));
const snapshotBytes = store.db.prepare("SELECT length(CAST(snapshot AS BLOB)) AS bytes FROM sessions WHERE id=?").get("large-chat").bytes;
assert.ok(snapshotBytes > 1024 * 1024);
results.push({ id: "P14", probe: "Small changes retain full snapshot writes", changedField: "title", snapshotBytes });
store.db.close();

const report = { generatedAt: new Date().toISOString(), scope: "Synthetic local probes; no real host, credentials, provider, or user database accessed", results };
await writeFile(new URL("./probes.json", import.meta.url), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
