<p align="center">
  <img src="public/monocode.png" alt="MonoCode" width="88" />
</p>

<h1 align="center">MonoCode — independently maintained fork</h1>

<p align="center">
  A desktop workspace for your coding agents, based on the original MonoCode.
</p>

## Original project and credits

**MonoCode was originally created by [Nick (hardbeat920)](https://github.com/hardbeat920).**
This repository is [Bahadır Yalçın's fork](https://github.com/bahadryalcn/monocode)
of [hardbeat920/monocode](https://github.com/hardbeat920/monocode). The application
foundation, existing integrations, design and project artwork come from the
original project and its contributors. Thank you to Nick and everyone who has
contributed to MonoCode.

This fork is maintained independently. Changes developed here and improvements
imported from community pull requests build on that shared work; imported
contributions remain credited to their original authors. See [CREDITS.md](CREDITS.md)
for attribution, contributor links and third-party acknowledgements.

[![Upstream contributors](https://img.shields.io/github/contributors/hardbeat920/monocode)](https://github.com/hardbeat920/monocode/graphs/contributors)

[View all upstream contributors](https://github.com/hardbeat920/monocode/graphs/contributors). Contributor artwork is available through [contrib.rocks](https://contrib.rocks).

The original [MIT license](LICENSE) and copyright notice are preserved.
Fork modifications use the same license. This repository and its packages are
independent of the upstream project's official releases.

## Fork development

Compared with the original project, this fork adds or expands:

- **Desktop workspace:** layout presets, pop-out windows, tab transfers and more flexible pane arrangements.
- **Agent workflows:** importing Claude/Codex conversations, persistent and editable message queues, composer templates and session controls.
- **Editor and Git tools:** merge-conflict workflows, blame, document viewers and changes in side-by-side diffs.
- **Remote work:** project/group synchronization, host-owned running status, reconnection and session recovery improvements.
- **Tasks and goals:** a host-backed task board, planning/review workflows and controlled auto-merge.
- **Everyday tools:** a session notes panel and combined provider usage overview.
- **Providers and distribution:** Gemini CLI integration, a separate signed Windows updater feed and a shared Windows/Mac local update coordinator.

See [the detailed comparison and source references](docs/fork-differences.md).
MonoCode's original agent workspace, existing provider integrations, remote host,
notes and other shared foundations remain upstream work. This fork also imports
community improvements with their original authors credited.

See the [fork guide](docs/fork.md), [remote access guide](docs/remote-access.md),
[changelog](CHANGELOG.md) and [commit history](https://github.com/bahadryalcn/monocode/commits/main/)
for details. The source branch can be ahead of the published application.
Gemini CLI support is included from v0.8.75; it is not in the older v0.8.74 packages.

## Install this fork

Download from [this fork's releases](https://github.com/bahadryalcn/monocode/releases).
Check the tag and asset list before installing; source changes do not update
an already published package.

The [v0.8.76 release](https://github.com/bahadryalcn/monocode/releases/tag/v0.8.76) includes:

| Platform | Application package | Installation |
| --- | --- | --- |
| Windows x64 | `MonoCode_0.8.76_x64-setup.exe` | Run the installer after saving work. |
| macOS Apple Silicon | `MonoCode_0.8.76_aarch64.app.zip` | Extract and move `MonoCode.app` to Applications. |

That release also includes Windows x64 and macOS arm64 host packages for remote
sessions. The Mac application is ad-hoc signed and is not notarized, so macOS may
require explicit approval when opening it. The signed updater feed currently
provides Windows x64 updates only. See [the fork guide](docs/fork.md) for build
identities, data directories and updates.

For the **original MonoCode**, use [the upstream releases](https://github.com/hardbeat920/monocode/releases).
Those packages are maintained by the original project and have their own feature
set and update channel. Intel macOS and Linux packages are not included in this
fork's v0.8.76 release; consult the upstream asset list or build from source.

## Agent providers

MonoCode runs provider CLIs installed and authenticated on your machine. Provider
availability depends on the source checkout or release you use. It does not sell
tokens or include subscriptions to those services.

Install and log in to at least one provider first:

- [Claude Code](https://claude.com/product/claude-code) - `claude auth login`
- [Codex](https://developers.openai.com/codex/cli) - `codex login`
- [Cursor CLI](https://cursor.com/cli) - `agent login`
- [Grok Build](https://docs.x.ai/build/overview) - `curl -fsSL https://x.ai/cli/install.sh | bash` then `grok login`
- [OpenCode](https://opencode.ai) - `opencode auth login`
- [Antigravity](https://antigravity.google/docs/cli-install) (macOS/Linux) - `curl -fsSL https://antigravity.google/cli/install.sh | bash`, then run `agy` once to sign in
- [Pi](https://pi.dev/) - `npm install -g @earendil-works/pi-coding-agent`
- [omp](https://omp.sh) - `curl -fsSL https://omp.sh/install | sh`
- [fx](https://fx.sh) - `curl -fsSL https://fx.sh/setup.sh | bash` then `fx login`
- [Hermes Agent](https://github.com/NousResearch/hermes-agent) - macOS/Linux: `curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash`; Windows PowerShell: `iex (irm https://hermes-agent.nousresearch.com/install.ps1)`; then run `hermes model`

For Gemini CLI on the current source branch, follow the setup instructions shown
in Settings. Provider names and logos belong to their respective owners.

<p align="center">
  <img width="1680" height="1050" alt="Original MonoCode screenshot from the upstream README" src="https://github.com/user-attachments/assets/2cd4a6ec-eb1e-4b45-8627-a76442ea3874" />
</p>

*Screenshot retained from the upstream README as a reference. This fork's current
interface may differ; credit for the original screenshot belongs to the upstream project.*

## Usage notes

Experimental remote sessions: run agents on an always-on Windows, Linux, or macOS machine and connect from the desktop. See [remote access setup and current limitations](docs/remote-access.md).

This is very early and you should expect bugs.

### Agent access to MonoCode

Type `/operator` at the start of a composer message to enable MonoCode access in that thread. For example, `/operator start two Codex sessions: one to inspect the API and one to review the UI`, or `/operator list my notes`. The slash picker also offers this command. The transcript shows only the request text in a translucent amber bubble; MonoCode removes the command from the request sent to the agent and supplies the local `app` CLI path and instructions on that turn. Later turns in the same thread can use the CLI without repeating `/operator`; other threads receive no CLI instructions or app access. The CLI can act only during an active agent turn. The agent can run the shown `app --help` command for the exact JSON input fields.

- `models.list` shows available providers, models, settings, and permission modes.
- `sessions.start` opens a tab in the current project with a prompt. Set `placement: "right"` or `placement: "down"` to split the calling session's pane instead; `besideSessionId` selects another visible session pane in the project. Reuse the returned session ID as the next `besideSessionId` to build nested layouts. By default it submits the prompt; set `draft: true` to save it unsent without starting an agent turn. It accepts a provider, model, effort or other model settings, permission mode, and current checkout or new worktree choice. Set `worktreeCwd` to a path from `worktrees.list` for a specific existing checkout. Use `worktrees.create` to create a worktree on a named new or existing local branch, then pass its path as `worktreeCwd`. Omit `runtimeMode` to inherit the calling session's permission mode, or set it explicitly to override. It returns the new session ID as soon as the pane and prompt are accepted, so the agent can move it into a folder immediately.
- `sessions.list` shows project sessions. `sessions.read` returns up to three recent user/assistant exchanges, with a cursor for older exchanges and a per-message character cap. `sessions.send` submits a follow-up to an idle session and `sessions.wait` returns that turn's reply once it finishes, while `sessions.draft` saves an unsent message for the user to review. `folders.list` and `folders.move` organize project sessions in sidebar folders, including a new folder.
- `notes.list` returns titles and short previews; `notes.read` returns one full note by ID.

Orchestration workers keep their existing scoped `control` workflow and do not receive this app access.

Small, focused pull requests are welcome. Anything large is worth an issue first - see [CONTRIBUTING.md](CONTRIBUTING.md).

## Build from source

Supports macOS, Linux, and Windows.

Use Node.js 22.13+ (required by pnpm 12), the `pnpm@12.8.2` version pinned in `package.json`, and a current stable Rust toolchain. On Linux, ensure standard Tauri prerequisites are installed (e.g. `libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `libsoup-3.0-dev`, `libjavascriptcoregtk-4.1-dev`). On Windows, the installer bootstraps the [WebView2](https://developer.microsoft.com/microsoft-edge/webview2/) runtime when it is missing.

```bash
pnpm install --frozen-lockfile
pnpm run tauri dev
```

For local Windows PC and MacBook build/install work, use the shared
[local update coordinator](docs/local-update.md). It builds one frozen source
and waits for app/host idle gates before installing.

### Ubuntu / Debian packages

On an Ubuntu/Debian workstation, the repository can install the native Tauri prerequisites and build distributable Linux packages directly:

```bash
pnpm run setup:linux:deb
pnpm install --frozen-lockfile
pnpm run build:linux
```

The Linux build emits `.deb` and AppImage bundles under `target/release/bundle/`.
Tauri loads `src-tauri/tauri.linux.conf.json` automatically for Linux development and builds.

### Fedora / Enterprise Linux packages

For packages built by the original project, use [upstream releases](https://github.com/hardbeat920/monocode/releases). These packages contain upstream code.

On Fedora, or on an Enterprise Linux 10 system (registered RHEL, Rocky, Alma, CentOS Stream, Oracle), install the release `.rpm` from [GitHub Releases](https://github.com/hardbeat920/monocode/releases/latest). Enterprise Linux needs EPEL first, because `webkit2gtk4.1` is an EPEL package there — CRB is not needed to run MonoCode. On Oracle Linux 10, `epel-release` does not enable `ol10_developer_EPEL`, which is the repository that provides that package. Enable it before installing the rpm:

```bash
# Enterprise Linux 10 only; skip on Fedora.
sudo dnf install -y epel-release   # RHEL: sudo dnf install -y https://dl.fedoraproject.org/pub/epel/epel-release-latest-10.noarch.rpm
# Oracle Linux 10, instead of epel-release:
# sudo dnf install -y oracle-epel-release-el10 dnf-plugins-core
# sudo dnf config-manager --set-enabled ol10_developer_EPEL
sudo dnf install ./MonoCode-*.rpm
```

The `.rpm` declares its own runtime dependencies, so `dnf` pulls the WebKitGTK stack for you. GitHub Releases builds that package on Enterprise Linux 10 so it loads on Fedora and EL 10. Building natively links the system WebKitGTK instead of the Ubuntu-built libraries shipped in the AppImage, which avoids graphics issues (e.g. `Could not create default EGL display`) on newer Mesa/Wayland systems.

To build it yourself instead — which also enables EPEL 10 and CRB automatically, since the -devel packages need CRB:

```bash
pnpm run setup:linux:fedora
pnpm install --frozen-lockfile
pnpm run build:fedora
```

That emits a `.rpm` under `target/release/bundle/rpm/`, installable with `sudo dnf install ./target/release/bundle/rpm/MonoCode-*.rpm`. EL 9 and older are unsupported (`webkit2gtk4.1-devel` only exists in EPEL 10).

### Troubleshooting on Fedora / Wayland

The portable AppImage bundles Ubuntu-built Wayland libraries that can fail against newer Mesa drivers: the app aborts at startup with `Could not create default EGL display: EGL_BAD_PARAMETER`, or opens a blank window. The native `.rpm` above links the system WebKitGTK stack and does not have this problem — prefer it on Fedora.

### Windows packages

```bash
pnpm install --frozen-lockfile
pnpm run build:windows
```

The Windows build emits an NSIS installer under `target/release/bundle/nsis/`.
The build script also loads `src-tauri/tauri.fork.conf.json` for the fork identity and updater. See [the fork guide](docs/fork.md) for signing prerequisites.

## License

[MIT](LICENSE), with the original `Copyright (c) 2026 Nick` notice preserved.
Fork modifications are also distributed under MIT. See [CREDITS.md](CREDITS.md)
and [NOTICE](NOTICE) for original-project, community and provider acknowledgements.
