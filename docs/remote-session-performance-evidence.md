# Remote session fixture evidence

The benchmark uses the production `transcriptPage`, `partialSessionSync`, `SyncTransfers`, and `applySessionSync` helpers. It compares a full snapshot plus one full-window change with a lazy tail page plus one partial change. Fixtures include 12 blocks, 2,000 blocks, a 17 MiB mid-history tool output, and a 17 MiB tail tool output. Twenty repeated JSON serializations are measured; chunk requests and response bytes are counted through the host transfer helper.

Run from the repository root with pinned `pnpm@12.8.2`:

```powershell
pnpm exec node scripts/remote-session-benchmark.mjs 20
pnpm exec node scripts/remote-session-benchmark.mjs 20 oversized-tail-tool
pnpm exec node node_modules/vitest/vitest.mjs run --config host/vitest.config.ts host/remote-performance.integration.test.ts
```

The serialization benchmark in this section measures local fixture serialization and in-process delta application only. It excludes request headers, network, live host load, idle CPU, process/WebView memory, renderer commits, paint, and physical device behavior. Do not interpret the local timings as network or live performance claims. Separate local process CPU/RAM measurements, when recorded below, do not change these limits for the serialization-only results.

## Evidence record

Final 20-iteration run: 2026-10-05, after the full-page metadata budget and preview-revision fixes. Response byte counts remained unchanged; the timings below are from that final run.

| Source | Benchmark | Host integration | Acceptance |
|---|---|---|---|
| `e78d881e` plus dirty working tree; Node v24.21.0, Windows x64 | 20 iterations per fixture, completed | 6 passed | No installed-client, two-machine, or physical-device acceptance claimed |

Measured JSON (response byte counts include serialized host transfer/chunk responses; request counts include follow-up chunk RPCs):

```json
{
  "small": {"fullPlusChange": 4713, "tailPagePlusChange": 4843, "avoided": -130, "requests": [2, 2], "serializeMs": {"fullP50": 0.005, "fullP95": 0.007, "tailP50": 0.004, "tailP95": 0.010}},
  "long": {"fullPlusChange": 4926488, "tailPagePlusChange": 245933, "avoided": 4680555, "requests": [4, 2], "serializeMs": {"fullP50": 6.410, "fullP95": 7.484, "tailP50": 0.271, "tailP95": 0.394}},
  "large-tool": {"fullPlusChange": 18023425, "tailPagePlusChange": 229396, "avoided": 17794029, "requests": [9, 2], "toolPreviewBytes": 32856, "serializeMs": {"fullP50": 13.649, "fullP95": 16.875, "tailP50": 0.558, "tailP95": 0.695}},
  "oversized-tail-tool": {"fullPlusChange": 18023477, "tailPagePlusChange": 229448, "avoided": 17794029, "requests": [9, 2], "toolPreviewBytes": 32861, "serializeMs": {"fullP50": 14.279, "fullP95": 18.870, "tailP50": 0.410, "tailP95": 0.549}}
}
```

Each fixture confirmed that the partial delta applied at revision 2 and preserved tail block ordering. Every initial tail page fit within the 1 MiB target; the 17 MiB block preview stayed below 64 KiB. The small fixture sends 130 more bytes in the paged flow because its page metadata outweighs the saved history. These results are deterministic fixture evidence only. The integration suite covers bounded machine-change cursors, restart reset/auth, lazy page and partial delta behavior, pinned history across append/deletion/restart, durable duplicate command receipts, separate host ownership, and long-poll cancellation with an independent command lane.

## Local CPU and RAM comparison — 2026-10-05

The user's CPU/RAM follow-up was measured separately with `scripts/remote-session-resource-benchmark.{ts,mjs}`. Final coherent cohort: **2026-10-05T20:03:41.436Z**, 24 fresh worker processes (four fixtures × two modes × three repeats). Raw worker CPU user/system totals, operation counts, memory baselines, retained memory, timings and final-state assertions are preserved in [the JSON artifact](benchmarks/remote-session-resources-2026-10-05.json). Earlier calibration/smoke runs are excluded from the following table.

Environment: pinned pnpm **12.8.2**, actual Node **v22.22.3**, Windows x64, AMD Ryzen 9 9950X3D, 32 logical processors; OS-reported physical memory **66,183,458,816 bytes**. This is a dirty working tree based on `e78d881e`, not an installed release. The older serialization-only record above used Node v24.21.0: do not compare its timings directly to this CPU/parse/transfer cohort.

```powershell
pnpm exec node scripts/remote-session-resource-benchmark.mjs 3
# Optional: three fresh processes per mode, one fixture, 750 ms measurement batches
pnpm exec node scripts/remote-session-resource-benchmark.mjs 3 long 750
```

Each mode starts with the same JSON-materialized, flat authoritative source, resembling a database-loaded transcript. Source, next revision and host delta construction are outside the timed batch. Two untimed operations warm the process and production preview cache, then GC establishes a baseline. Each measured operation performs the initial host response, wire JSON serialization/parse and chunk assembly when required, plus one update and production `applySessionSync`. Lazy mode additionally runs the production tail-page and partial-delta helpers. Both modes must end at revision 2 with the same independently checked visible tail order. Full mode intentionally retains all client history, while lazy mode loads the bounded tail.

Workers run **serially**, alternate full/lazy order by repetition, and use `--expose-gc` and hidden Windows child processes. Each batch lasts at least 750 ms; observed operations per worker ranged from 6–7 for full giant-output flows to 20,132–35,515 for small flows. CPU is the `process.cpuUsage` **user + system total divided by actual operation count**, including automatic GC and sampling overhead; forced GC, setup, timing-statistic sorting and the two extra memory-observation operations are outside this CPU interval. It is **not instantaneous CPU %, system idle CPU or CPU utilisation across 32 cores**. Existing processes were not stopped, so contention and runtime noise remain possible.

Numbers below are medians of the three independent process results. RAM is **total Node process RSS** at the highest observed operation boundary, including both host-helper and client work. It is sampled every eight operations, at the batch end and after two additional operations; it can miss an allocation peak inside an operation and is **not a true peak** or a WebView measurement. MiB = 1,048,576 bytes.

| Fixture | CPU ms/operation, full → lazy | CPU change | Observed RSS MiB, full → lazy | RSS range across three processes, full / lazy |
|---|---:|---:|---:|---|
| Small, 12 blocks | 0.029 → 0.038 | +31.0% | 44.99 → 46.03 | 44.94–48.01 / 45.20–46.19 |
| Long, 2,000 blocks | 40.905 → 1.078 | −97.4% | 214.04 → 98.53 | 214.02–214.29 / 98.39–99.94 |
| 17 MiB mid-history tool output | 127.143 → 1.599 | −98.7% | 282.27 → 98.05 | 282.22–282.43 / 97.57–98.16 |
| 17 MiB tail tool output | 134.000 → 1.880 | −98.6% | 199.57 → 97.59 | 199.43–199.76 / 97.41–98.11 |

The small session is already fully contained in one page: pagination adds local CPU and metadata overhead rather than saving work. The three large scenarios do less transfer/parse work in this warm fixture benchmark. These percentage changes apply only to these measured local operations and are not promised app or device improvements.

Post-GC **total process heapUsed** medians were 4.38 → 4.49 MiB (small), 13.91 → 9.51 MiB (long), 38.73 → 21.93 MiB (mid-history tool), and 21.73 → 21.87 MiB (tail tool). They include the authoritative source, runtime/preview caches and one final client state. The last scenario replaces the giant tail text with a short update, so the final full client no longer retains that giant text: lower transient RSS does not imply lower final retained heap there. The long full-flow post-warmup baseline was 13.93 MiB, versus 9.20 MiB for lazy; its post-GC delta was slightly negative (−16,720 bytes). Raw baseline deltas are retained for inspection and **must not be interpreted as exact exclusive client allocation or negative memory usage**. V8 retention/GC and warming differ between flows even with the same logical/materialized source.

Timing p50/p95 are calculated from a fixed 4,096-slot ring: the last up to 4,096 operations in each process. Large full-flow batches have only 6–22 operations, so their p95 is a coarse statistic; no confidence interval or sustained-use memory stability is claimed. The host's authoritative full transcript remains present in both modes. Cold session discovery, database reads, HTTP/SSH, Rust/native JSON decoding, actual rendering/paint, scrolling, IndexedDB, installed-app idle RAM/CPU, live network and physical MacBook–Windows acceptance remain **unmeasured**.

Validation: scripts-only TypeScript checking, runner/worker argument rejection checks, actual wire-envelope reconstruction and revision/order assertions in all 24 final worker processes. Exporting the shared fixtures also preserved the original serialization runner's small-fixture output (4,713 → 4,843 response bytes and valid revision/order). No dependencies were installed, no app/host was stopped or installed, and no commits/publication were performed.

## Remote content loading states — 2026-10-05

At the initial UI delivery, the follow-up was local frontend/model/test work and was not included in the earlier 0.9.0 artifacts or MacBook installation. The subsequent build refresh is recorded below. Physical Windows–MacBook UI acceptance remains pending. The resource benchmark above was not rerun and does not measure this UI change.

Delivered behavior:
- `RemoteDataState` / `RemoteDataStatus` separates loading, refreshing with retained content, verified ready/empty, stale and error. A successful connection alone does not verify transcript content. Error details and manual refresh/retry are visible.
- Sidebar session lists keep previous rows during refresh and failure. Manual reads bypass completed-cache TTL while equivalent in-flight reads stay shared. Cache timestamps represent owner reads. Project/reset transitions cannot reuse a pre-restart etag baseline; restart full rows may be accepted directly.
- Remote conversations show cache-only history as unverified, preserve composer/draft identity through refresh, show known revision reads as pending, and recover after a failed shared control channel. Restart handling sets the fresh-tail baseline before reading; deletion handling stops content demand before any recovery read.
- Task boards retain existing cards on aggregate errors, update successful machines in partial results, and expose per-machine failures/outdated hosts. Manual retry forces `tasks.list`; quiet background cache reuse does not advance its verification time. Control-channel errors invalidate the existing task cache.
- Root and nested file listings have status and actual-owner refresh controls. Failures retain their visible rows. Late root reads cannot overwrite a different project's tree or leave its spinner running. A WeakMap on cached arrays records successful owner reads without another strong cache or polling loop; automatic changed listings become verified and failures do not advance the timestamp.
- Machine-registry failures are distinct from empty results. Folder navigation retains and labels the last successful folder; opening it is disabled while a different navigation is pending/failed, and retry targets the requested folder. Superseded registry failures are ignored.

Changed files for this follow-up (existing unrelated dirty changes were preserved):
- `src/app/shell/Sidebar.tsx`, `SidebarRemoteSessions.test.ts`.
- `src/features/connections/model/{connections,remoteDataState,remoteMachineChannel,remoteSessionLists}.ts`, `remoteMachineChannel.test.ts`, `remoteSessionLists.test.ts`.
- `src/features/connections/ui/{RemoteDataStatus,RemoteSession,AddRemoteProjectDialog,ConnectionsSettings}.tsx`, `RemoteSession.test.ts`, `AddRemoteProjectDialog.test.ts`.
- `src/features/tasks/model/{taskClient.ts,taskChannel.test.ts}`, `src/features/tasks/ui/{TasksView.tsx,TasksView.test.ts}`.
- `src/features/files/model/{fileTree.ts,fileTree.test.ts}`, `src/features/files/ui/{FileTree.tsx,FileTree.test.ts}`.
- This evidence file and the follow-up checklist in `docs/remote-session-performance-todo.md`.

Validation used pinned pnpm **12.8.2**, Windows shell `tty=true`, and existing dependencies. Test groups overlap; their counts must not be added together as a single run.

| Focused check | Result |
|---|---|
| Sidebar remote sessions/rename/working count; project-session/list/channel models; folder dialog and connection settings (8 files) | 102/102 passed |
| After reset/recovery fixes: Sidebar remote sessions, project-session/list models, complete RemoteSession UI (4 files) | 77/77 passed; includes all 63 conversation tests |
| Recovery+restart and recovery+deletion regressions after test async cleanup | 2/2 passed, 61 skipped, no React act warnings |
| TasksView + taskChannel | 38/38 passed |
| FileTree model + UI, including automatic verification and late-root response | 44/44 passed |
| Remote project rail sessions | 8/8 passed |
| Final `pnpm exec node node_modules/typescript/bin/tsc --noEmit` | Exit 0 |
| `git diff --check` on affected frontend/model/tests/docs | Exit 0 |

Vitest commands used `pnpm exec node node_modules/vitest/vitest.mjs run` (the file groups above); the FileTree worker used the pinned `pnpm exec vitest` command. The optional `oxfmt` tool was unavailable; no dependency was installed to obtain it. No live-device, paint, WebView-memory or CPU gain is claimed for these status changes.

## 0.9.0 build refresh — 2026-10-06

The user requested fresh builds after the UI delivery. Ran the shared coordinator with `-Version 0.9.0 -BuildOnly -Plan`, then `-Version 0.9.0 -BuildOnly`. Both platforms completed and verified their packages. Source was frozen once; existing dependencies and persistent caches were reused. No installation, host stop, commit, push or GitHub publication was performed.

- Package ID: `9945af19ebcbf1d5-local`.
- Both manifests record source `9945af19ebcbf1d5fbb09d0f08da82247222d2f006f797203a52dfca741a0542` and version `0.9.0`.
- Windows x64 immutable installer: `C:\Users\kraba\.monocode-build\runs\9945af19ebcbf1d5-local\setup.exe`. Direct PE ProductVersion and FileVersion both read `0.9.0`; manifest records the installer/signature/binary hashes. NSIS output is also at `target/release/bundle/nsis/MonoCode_0.9.0_x64-setup.exe`.
- Mac arm64 immutable bundle: `/Users/bahadryalcn/.monocode-build/runs/9945af19ebcbf1d5-local/MonoCode.app`. Direct PlistBuddy CFBundleShortVersionString read `0.9.0`.
- The frozen Windows web bundle contains the new remote status text `Data has not been verified.`. Both platform manifests match the same source snapshot.
- Recorded stage times: Windows web 70.0 s, native/package 94.7 s; Mac web 22.37 s, native/package 38.39 s. These are individual stage timings, not total wall time or a performance-gain measurement.
- Final coordinator `-Status` still records the earlier Windows 0.8.90 installation and earlier Mac 0.9.0 package `a6d54a77f2607476-local`. The new package has not been installed. Physical two-machine acceptance remains unchecked.

## MacBook installation of refreshed 0.9.0 — 2026-10-06

At the user's explicit request, reviewed `-Platforms mac -InstallOnly -Plan`, then ran `-Platforms mac -InstallOnly` to reuse package `9945af19ebcbf1d5-local` without rebuilding. Latest coordinator status:

- App: `installed`, version `0.9.0`, package `9945af19ebcbf1d5-local`. Direct installed plist confirms `0.9.0`; installed and immutable-package executable SHA-256 both equal `3c4bd37a0da90ef1495a6d47939d8751efd18bb96728926c37342f51da529700`. The installed executable is running (PID 67681).
- Host: `waiting`, package `9945af19ebcbf1d5-local`, `activeSessions: 4`. Its persistent installation helper (PID 61475) waits for the existing idle gate; the new host installation is not complete. Active work was not interrupted.

This records an actual app installation and a pending host installation separately. Physical two-machine data/session acceptance remains unchecked. No Windows install, commit, push or publication was performed.
