# HTML artifacts and host devices

Implemented independently for MonoCode; no T3 or external tool source was copied. Reference baseline: T3 `7202ba666080cfca1351c080d7aaa2d81bfa9a66` device tool versions and documented API shapes. External tools are optional runtime installations, not new build dependencies.

## HTML publishing

Create one `HtmlArtifactStore(join(hostStateDir, "html-artifacts"))` per host. Register authenticated project/session operations:

- `html_artifact_publish`: input `{ projectId, sessionId, messageId?, title, path, requestId? }`. Resolve the registered session (or adopted desktop session) and require its project ID to equal the request project ID. Resolve its real working directory server-side, then call `publishFile(input, cwd)`. Never accept a client-provided workspace root. Do not expose unrestricted inline publishing to an untrusted agent/session. A stable request ID deduplicates identical retries and rejects changed content.
- `html.artifacts.list`: authorize the same ownership and call `list(sessionId)`.
- `html.artifacts.read`: authorize the same ownership and call `read(sessionId, id)`.

The existing desktop app CLI now accepts `imc app html_artifact_publish --input FILE` in an `/operator` conversation, with JSON `{ "title": "Chart", "path": "visuals/chart.html", "messageId": "optional-reply-id" }`. The source session comes from authenticated app access, never from generated arguments. `AgentAppHost.publishHtml(source, input)` binds this source to the owning host RPC and forwards the stable CLI request ID. Other conversations can use the Saved visuals form: write a workspace HTML file with the agent, enter its path/title and choose Save visual. No unrestricted external MCP server or global provider configuration is added.

Mount `HtmlArtifactsPanel({ sessionId, list, load, publish })` in the session drawer; `publish(path,title)` saves through the owning host and refreshes the list. Render `HtmlArtifactCard` for replies associated through `messageId`, or list unassociated artifacts after the transcript. Callbacks are injected; they must use the authenticated owning host. Metadata and HTML persist atomically under immutable artifact IDs, max 512 KiB per artifact and 100 artifacts per session. Failed reads surface as errors.

On desktop, the card reuses the existing `create_html_preview`/`close_html_preview` native lifecycle and `html-preview` isolated custom protocol. It supplies a `remote://artifact/...` pseudo-path so no local asset directory is granted. This avoids `srcdoc` inheriting the application's restrictive script CSP, without weakening the app CSP or adding iframe permissions. Browser rendering uses `srcdoc`. The generated document starts with a stricter meta CSP blocking external subresources/connections even though the general editor preview protocol supports external editor assets.

The iframe has an opaque origin (`sandbox="allow-scripts"`, no `allow-same-origin`, forms, popups, downloads or top navigation). This protects the application bridge and credentials; browsers can still navigate the sandboxed frame itself. Do not describe it as a full offline execution environment. Opening a visual is explicit, and closing it unmounts the script context and releases its native token, including races where a native token arrives after the card closes.

## Devices

Create one `DeviceHost(hostStateDir, { nodePath?, npmCliPath? })` per host. The default uses the current Node runtime and npm's JS CLI beside it. Packaged runtimes without npm return an explicit setup error; configure a genuine Node/npm toolchain path. Setup never launches shell command strings or visible windows.

Expose authenticated RPC: `devices.status`, `devices.setup({ agentAccess })`, `devices.start`, `devices.stop`, `devices.list`, `devices.boot({ deviceId })`, `devices.capture({ deviceId })`, `devices.action({ deviceId, action })`. Require registered project/session ownership on every operation; setup/start/stop/control are privileged mutations. Use the active agent run to attach project/session authority if exposing device tools to providers. `DevicePanel` expects injected callbacks matching `DevicePanelApi`.

Setup is an explicit UI action: installs `expo-device-hub@0.12.0` and optionally `agent-device@0.21.12` into private host tool caches, preserving dependency license files. Installs stage in separate directories and become usable only after successful completion plus a marker. Existing/partial directories are retained rather than destructively cleaned. Node 22.12+, Android SDK/AVDs or Mac Xcode/simulator runtimes must already exist. SDK detection does not prove a runtime is installed; device discovery returns the concrete SDK errors.

The hub runs only on loopback, in an owned hidden subprocess. Clients receive bounded image frames over existing authenticated RPC, never the unauthenticated hub URL or its exec routes. Live view is one frame per second, request-completion-driven, pauses in hidden documents, stops on error and releases its timer on unmount. Host capture concurrency is one and frame size is capped at 4 MiB. This is screenshot live view, not H.264/WebRTC video streaming.

Actions invoke the pinned agent CLI with explicit device selectors, isolated `AGENT_DEVICE_STATE_DIR` and a 10-second idle timeout. `stop` explicitly stops that private daemon and the owned hub; call `dispose` during server shutdown. No simulator/SDK/shared daemon is killed. Android screen-clicks use native pixels; iOS manual presses use logical points from the accessibility snapshot to avoid wrong Retina coordinate scaling. SDK/plugin refusal is displayed, never interpreted as success.

Licenses checked at upstream primary sources: [expo-device-hub LICENSE](https://github.com/expo/expo-device-hub/blob/main/LICENSE), [agent-device LICENSE](https://github.com/callstack/agent-device/blob/v0.21.12/LICENSE). Both use MIT. External installation preserves its package license notices; no external source is vendored here.

Exact runtime package evidence (read-only research on 2026-10-08): [expo-device-hub 0.12.0 registry metadata](https://registry.npmjs.org/expo-device-hub/0.12.0) confirms `dist/server/cli.mjs`, MIT, git head `7ec4a4a8e28acd52cf197eed24ccae945e6ebd60`; [agent-device 0.21.12 metadata](https://registry.npmjs.org/agent-device/0.21.12) confirms `bin/agent-device.mjs`, MIT, Node >=22.12, git head `01328de4113749ac33e35ea2390305e6a08c0edd`. [Pinned hub CLI options](https://github.com/expo/expo-device-hub/blob/7ec4a4a8e28acd52cf197eed24ccae945e6ebd60/packages/expo-device-hub/src/server/cli/options.ts) confirm host/port and hide options. [Pinned agent command documentation](https://github.com/callstack/agent-device/blob/01328de4113749ac33e35ea2390305e6a08c0edd/website/docs/docs/commands.md) confirms explicit sessions and device selectors; different-device selectors are rejected rather than silently stripped. T3's pinned `LocalDeviceHost.ts` confirms private daemon state directory, idle timeout environment and `daemon stop --state-dir` lifecycle.

Worker wrote regression tests but deliberately did not run tests, builds or typechecks. Main agent owns final validation. Real simulator, installed runtime and physical-device acceptance remain separate from those tests.

## Installed acceptance update (2026-10-08)

The user subsequently authorized tool provisioning. The current control tool is pinned to `agent-device@0.21.23`; the original 0.21.12 research references above remain historical. Device subprocesses discover existing standard Android SDK paths, the installed Xcode developer directory and Homebrew JDK17, without changing global system configuration. Packaged Node can use npm from the private runtime toolchain cache or the existing toolchain PATH.

Live iOS acceptance exposed and fixed the POST-only serve-sim screenshot API and the requirement to open a device-bound agent session before input. Existing private sessions must match platform and device ID. The host closes its own control sessions on stop. With the updated tool, discovery, boot, capture and a real home-button action passed on the Mac. Windows tools were installed, but the pinned hub's local Android discovery still fails to invoke avdmanager on Windows. See `t3-runtime-validation-2026-10-08.md` for saved images, exact package IDs and remaining acceptance limits.
