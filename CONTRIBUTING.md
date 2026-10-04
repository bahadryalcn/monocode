# Contributing to this fork

This guide applies to [Bahadır Yalçın's MonoCode fork](https://github.com/bahadryalcn/monocode).
The original project was created by [Nick](https://github.com/hardbeat920) and is
maintained separately at [hardbeat920/monocode](https://github.com/hardbeat920/monocode).
Thank you to the original authors and community contributors; see [CREDITS.md](CREDITS.md).

Open fork-specific issues and pull requests in this repository. For a contribution
to the original project, follow its own [contribution guide](https://github.com/hardbeat920/monocode/blob/main/CONTRIBUTING.md)
and review policies. A contribution accepted here does not imply upstream acceptance.

Keep changes focused, explain the problem and preserve original authorship when
importing work from another repository or pull request.

## Get it running

You need Node.js 22.13+ and pnpm 12.8.2, a current stable Rust toolchain, and at least one provider CLI installed and logged in:

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

macOS, Linux, and Windows are supported targets. On Debian/Ubuntu, `pnpm run setup:linux:deb` installs the native Tauri build dependencies.

```bash
pnpm install --frozen-lockfile
pnpm run tauri dev
```

One provider is enough. MonoCode probes for each CLI at startup and disables the ones it can’t find, with a hint about how to install them, so a missing Codex doesn’t stop you from working on anything else.

## Where things live

- `src/app/` - application composition, startup behavior, window shell, and release/update UI
- `src/features/` - product behavior grouped by feature, with UI, model, data access, hooks, and tests kept together
- `src/integrations/harness/` - the provider-independent harness core and one folder per provider adapter
- `src/platform/tauri/` - browser-to-Tauri adapters for filesystem, PTY, clipboard, and platform behavior
- `src/shared/` - reusable UI, hooks, and small utilities that contain no feature behavior
- `src-tauri/src/` - the Rust side: PTYs, filesystem and git, session storage, native window

`src/integrations/harness/` is the most useful place to start if you want to fix something real. Each folder under `providers/` has an adapter (`claudeAdapter.ts`) that implements the shared `HarnessAdapter` lifecycle from `core/registry.ts`, and a protocol module (`claudeProtocol.ts`) that translates the CLI’s output into MonoCode’s own event types. The protocol modules are pure functions with unit tests beside them, so you can fix a Codex parsing bug with only Claude Code installed. Discuss a new provider proposal with the fork maintainer before implementation.

## Before you submit

Use the pnpm version pinned in `package.json`:

```bash
node scripts/check-repository-hygiene.mjs
pnpm run check
pnpm run test:host
```

`check` runs frontend tests and TypeScript checks, then Rust formatting, Clippy
and tests. `test:host` builds and tests the host. Use `check:web` or `check:rust`
for focused iteration. CI also includes platform and packaging jobs; a local
focused check does not prove the complete CI matrix or an installed application.
For local Windows/Mac installs, use [the update coordinator](docs/local-update.md).

## Provider proposals

Discuss scope before adding a provider. New adapters should use the existing
harness lifecycle and document authentication, catalog discovery, usage, approvals
and platform support. Include focused protocol/lifecycle tests. The upstream
project's provider admission policy belongs to that project and is not presented
as a statement by this fork's maintainer.

## Pull requests and attribution

Use the [PR template](.github/pull_request_template.md), describe the resulting
behavior and list the checks you actually ran. Include before/after screenshots
for UI changes. Discuss larger product or architecture changes in an issue first.

When importing a patch, retain its author information and any co-author trailers,
link the original pull request or commit, and keep required license notices.
Do not describe imported work as solely authored by this fork's maintainer.

Be kind: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Report vulnerabilities as
described in [SECURITY.md](SECURITY.md).
