# Getting started

Fresh desktop workspaces open a three-step setup dialog: Connect, Agents, Projects.
The dialog follows the current product branding and theme. It can be reopened from
Settings → General → Import history → Open setup.

- Connect starts with this computer. Manage computers uses the existing connection
  editor; the local sync host is excluded from the remote computer list.
- Agents checks local Codex, Claude Code and Gemini CLI installations. Missing
  agents link to the provider's installation guide. The CLI path control and
  provider login flow are reused. An installed CLI is not labeled authenticated;
  a successful login in setup displays Signed in. Existing CLI credentials remain
  available through the normal provider integration.
- Projects discovers local Claude/Codex interactive conversations and groups them
  by usable folder. Already imported conversations and missing folders are excluded.
  Selected folders import through the existing bounded, cancellable import runner.
  Failures and shortened/history-only imports stay visible in the result screen.
  New folders can be added with the native folder picker. Remote folders use the
  existing remote project picker; remote CLI history is not scanned by this dialog.

The `monocode.onboarding.v1` local preference records completion or skipping.
Remembered projects, stored history, restored workspaces and window transfers
suppress automatic setup. Existing workspaces are recorded so clearing their
projects later does not turn an upgrade into a first run. A skipped setup can be
reopened in Settings. Setup does not install providers or import history
automatically. Connection changes use the existing explicit connection controls.

Source tests cover first-run gating, reopening, selection, deduplication, import
cancellation, errors and folder addition. Native OAuth, SSH connections, actual
first installation and packaged desktop layout require desktop acceptance checks.
