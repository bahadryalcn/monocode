# T3 Code adoption research and implementation ledger

## Authority and evidence

On 2026-10-08 the user authorized implementing all seven adoption areas with four distinct subagents. Workers write implementation and meaningful regression tests but do not run tests, builds, typechecks or validation; the main agent performs final validation after all workers finish. Preserve existing staged and unstaged work. No commit, push, installation or publication is authorized.

Research baseline: T3 Code commit `7202ba666080cfca1351c080d7aaa2d81bfa9a66` (2026-10-07). Source snapshot is available at `C:/Users/kraba/AppData/Local/Temp/imece-t3-research-20261007-030606/t3code-7202ba666080cfca1351c080d7aaa2d81bfa9a66`. This is source research, not measured performance or installed acceptance. The repository is MIT licensed; preserve applicable notices if importing substantial code. External device tools have independent licenses.

## Findings to preserve

- Provider coverage cannot be inferred from README alone: the researched source includes Pi, ACP Registry and local ACP commands.
- MonoCode already has ACP transport, provider handoff, worktrees, PR creation, remote hosts, revision deltas, paged history, usage views and task/review orchestration. Extend these contracts instead of creating competing systems.
- T3 portable handoff selects messages within target capacity and retains references to omitted history. Native provider reasoning/tool state is not transferred.
- T3 PR watches react to CI, reviews and conflicts, with bounded wakeups and read-failure handling.
- Connection ownership and state freshness are separate. Retries must not replay uncertain mutations blindly; cached state is not sending authority.
- Resource sampling is an isolated Rust child in T3, demand driven and bounded by bytes as well as count. Do not claim sampling itself is free.
- Device hosting uses expo-device-hub for streaming and agent-device for automation; host identity, authenticated proxying and lifecycle ownership matter.
- HTML replies are persisted sandboxed artifacts, distinct from an editor's local HTML preview.
- T3 voice transcription is currently local on supported iOS devices, not an implemented general desktop/server transcription system.
- T3 Connect includes Clerk, relay and managed tunnels. Adapt existing pairing/direct access first; do not depend on T3-owned cloud accounts.
- Shared helpers include searchRanking, semver, changeRequestUrl, sourceControl and usageMerge. Most larger packages are private workspace packages coupled to contracts/shared/Effect; they are not drop-in npm dependencies.
- Transport regression fixtures are more useful than assuming Electron/Tauri or another app is inherently faster.

## Seven deliverables and four ownership groups

| Area | Deliverable | Owner | Status |
| --- | --- | --- | --- |
| 1 | Persistent task/session PR linkage and bounded host-owned PR watcher using existing GitHub/CI workflows | worker 1: delivery | Implemented; locally validated |
| 2 | Capacity-aware provider handoff with selected-message budget and agent-readable omitted history | worker 2: providers/context | Implemented; locally validated |
| 3 | Local generic ACP provider configuration and registry discovery/setup integrated into existing provider lifecycle | worker 2: providers/context | Implemented; locally validated |
| 4 | Persisted sandboxed HTML replies reachable from agent and rendered in conversations | worker 3: visual/device | Implemented; locally validated |
| 5 | Host resource diagnostics and meaningful bounded transport/performance regression coverage | worker 4: remote/runtime | Implemented; locally validated |
| 6 | Host-owned device panel and explicit device-tool setup with simulator/emulator interaction | worker 3: visual/device | Implemented; locally validated |
| 7 | Authenticated responsive web/mobile control and host-owned shared browser, reusing remote/session authority | worker 4: remote/runtime | Implemented; locally validated |

The main agent owns cross-module integration, shared host RPC registration, app navigation/settings integration and final validation unless explicitly delegated. Workers must report integration hooks rather than race on shared files. Four distinct workers run in waves because the root plus three workers exhaust the available four concurrency slots.

## Acceptance

Each feature must have an actual reachable user/agent workflow, explicit unsupported/error states, bounded background work and preserved existing sessions/drafts/credentials. No placeholder feature is accepted as complete. Source/test completion, real provider/network execution, simulator acceptance and installed Windows/Mac acceptance are recorded separately. Web/mobile means usable responsive browser control first; an App Store/Play Store publication is outside this task.

## Primary references

- https://github.com/pingdotgg/t3code/tree/7202ba666080cfca1351c080d7aaa2d81bfa9a66
- `apps/server/src/orchestration-v2/pullRequestWatch.ts`, `PullRequestWatchReactor.ts`
- `apps/server/src/orchestration-v2/ContextHandoffBudget.ts`, `ContextHandoffService.ts`
- `apps/server/src/provider/AcpRegistryCatalog.ts`, `provider/acp/`
- `apps/server/src/htmlRender/`, `apps/server/src/device/`, `apps/server/src/preview/`
- `native/resource-monitor/`, `packages/client-runtime/src/connection/`
- `docs/internals/performance-regressions.md`, `docs/internals/environment-auth.md`
- https://github.com/expo/expo-device-hub
- https://github.com/callstack/agent-device

## Implementation and validation log

All seven areas have been implemented by four distinct workers and integrated by root. Root validation and concrete runtime limits are recorded below.

### Delivered workflows

- Conversation tools opens saved visuals, host devices, PR tracking, shared browser and resources. Only its selected panel mounts; session/project changes reset ephemeral state.
- PR tracking persists multiple session/task links, observes by default and permits explicit bounded automatic follow-ups. Project task choices load on request. Stable host receipts prevent duplicate queueing; owner stops, archived sessions, merged work and repair budgets are respected.
- Desktop and headless handoffs archive full user/assistant history on the owning machine and budget the selected history against the target model capacity. Omitted messages remain readable from the archive.
- Provider settings supports generic ACP local executable configuration, pinned npm registry installation/cancellation, credential-preserving edits and generic provider lifecycle. Unsupported filesystem/terminal client capabilities are not advertised.
- Saved visuals publishes workspace HTML through the form or the existing `/operator` `imc app html_artifact_publish` action. Project/session identity is supplied by the app. Desktop rendering reuses the isolated `html-preview` protocol without relaxing app CSP. Native preview tokens close with the panel.
- Host diagnostics samples OS memory and the Node host process on demand. It does not claim provider-descendant CPU accounting. Transport fixtures cover actual paging/delta/replay and UTF-8 byte budgets.
- Devices setup installs pinned `expo-device-hub` and optional `agent-device` into isolated host storage on explicit user action. Discovery, boot, screenshots and native input report SDK/tool failures. Live screenshots run only in an open, enabled panel.
- Set `IMECE_WEB_CONTROL_ORIGIN` to an explicit loopback or HTTPS origin to enable `/control`. Paired-device bearer authentication, origin isolation and command receipts reuse the host dispatcher. Shared Chromium uses an explicit, expiring control lease and demand-driven frames.

### Root validation

- App and host TypeScript typechecks passed after integration fixes.
- New host suites: 31 passing tests across 12 files; one Windows symlink-privilege test skipped. Covers authenticated feature RPC, ownership/path confinement, PR persistence/wake budgets/receipts, device process argument safety, browser leases, diagnostics and transport budgets.
- Handoff/provider/artifact/agent app suites: 60 passing tests across 8 files.
- Existing harness/protocol/settings suites: 91 tests passed (55 settings cases passed together; the corrected ACP mock case passed in a focused rerun).
- Existing host server/engine/child-backend/task suites: 165 passed, two existing task tests failed. Both failures reproduced against unmodified `HEAD:host/tasks.ts` in temporary baseline files, then those files were removed. Failures: task prompt no longer ends with the raw prompt; legacy review recovery is held blocked by the current takeover contract. This task leaves those unrelated contracts intact.
- Rust library compile check passed; six native control CLI tests passed. Existing unused-code warnings remain in checkpoint/filesystem modules.
- Web production bundling and host bundling passed. Existing CSS `::highlight` and large-chunk warnings remain.
- Task-owned diff whitespace check passed; previous staged and dirty changes were preserved.

### Runtime acceptance still required

At implementation completion, no installed desktop, remote Mac, real GitHub PR/CI, real generic ACP agent, device SDK/simulator or live Chromium acceptance was claimed. Browser operation requires provisioned Playwright/Chromium in the actual host runtime; device operation requires the appropriate SDK and explicit setup. Remote web control requires the configured HTTPS origin/reverse proxy. Supporting guides: `pr-delivery.md`, `t3-artifacts-devices-integration.md`, `host-browser-control.md`.

### Subsequent authorized installation and live checks

The user subsequently authorized local Windows/Mac installation and testing. Both hosts and the Mac app were installed from `af43cd37c684bfb2-local` (0.9.13). Windows desktop installation remains queued behind active sessions; its installed binary does not yet match the new package. Fresh validation passed 66 tests and both TypeScript checks. Both installed hosts passed live health, authentication rejection, capability and resource checks. Actual Chromium launch reported missing Playwright on both machines; Mac `simctl` was unavailable. Full evidence and remaining runtime/visual limits: `t3-runtime-validation-2026-10-08.md`.

The user then authorized installing the missing tools. Playwright/Chromium and device tools were provisioned. Actual browser click/frame acceptance passed on both installed hosts; Mac simulator discovery/boot/capture/home input passed after SDK path, screenshot HTTP method, agent session and pinned control-tool updates. The latest host package is `a21c4237a9529d76-local`; Mac app is `5585acc94b120b38-local`. Windows app installation remains idle-gated, and its local Android hub has an avdmanager compatibility failure. Saved real browser/simulator images and final limits are in the runtime validation report.
