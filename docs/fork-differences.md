# How this fork differs from the original MonoCode

This is Bahadır Yalçın's independently maintained version of
[MonoCode by Nick](https://github.com/hardbeat920/monocode).
The original application is the foundation of this project. Its code, design,
existing integrations and artwork are credited in [CREDITS](../CREDITS.md).

## Comparison scope

This comparison was reviewed against upstream `main` at
[`271b66d`](https://github.com/hardbeat920/monocode/tree/271b66ded71e795e0569db77c9bbf599219c8cdc)
on 2026-10-04. The shared fork point is
[`1e97594`](https://github.com/hardbeat920/monocode/tree/1e97594ddf6f40aa24671f7fa09f2048deb1d5eb).
Upstream continues to develop independently; a feature mentioned here may later
be implemented differently or become available there too. This is a description
of the fork's source, not a promise that every old release contains every feature.

## Changes developed in this fork

| Area | What changes for the user | Source |
| --- | --- | --- |
| Desktop layouts | Layout presets, flexible splits, detached windows and moving tabs between windows; transfer readiness and restoration handling. | [Workspace](../src/features/workspace), [application shell](../src/app) |
| Conversation import | Import existing Claude Code and Codex conversation history into MonoCode. | [Session import](../src/features/sessions/import) |
| Composer and sessions | Composer templates, richer queue editing, persistent drafts/queues, session recovery and controls for running work. | [Sessions](../src/features/sessions) |
| Editor and Git | Additional conflict-resolution and blame workflows, document viewers, diff navigation and side-by-side changes. | [Features](../src/features), [native filesystem/Git support](../src-tauri/src) |
| Notes and usage | A notes panel beside the conversation, markdown editing, and a combined provider usage overview. Upstream already has notes and provider usage; these are extensions. | [Notes](../src/features/notes), [usage overview](../src/features/usage) |
| Remote work | Project/group synchronization, reconnect/recovery controls, remote Git actions and status for work continuing on its owning host. Upstream already provides the remote host and session foundations. | [Host](../host), [remote access guide](remote-access.md) |
| Tasks and goals | A host-backed task board, goal planning, verification/review, steward workflows and guarded auto-merge. | [Task UI/model](../src/features/tasks), [host tasks](../host/tasks.ts) |
| Google CLI providers | Antigravity CLI setup for individual accounts; Gemini CLI remains available for enterprise licenses and API keys, preserving existing sessions. | [Setup and migration](antigravity-cli.md), [Gemini adapter](../src/integrations/harness/providers/gemini), [Antigravity adapter](../src/integrations/harness/providers/antigravity) |
| Updates and packaging | A separate fork identity/data directory and signed Windows update feed; one frozen source and persistent caches for local Windows/Mac builds and idle-aware installs. | [Fork guide](fork.md), [local updater](local-update.md) |

These entries describe additions and extensions, not sole ownership of all code
in the linked modules. Some workflows combine original code, imported patches
and changes developed here. Passing source tests or packaging checks does not
by itself establish native interaction or installed updater acceptance.

## Imported community improvements

The fork also integrates upstream community pull requests. Their authors retain
credit; importing a patch does not make it an original invention of this fork.
Examples include:

| Contribution | Original pull request |
| --- | --- |
| Continue an existing Claude conversation | [#445](https://github.com/hardbeat920/monocode/pull/445) |
| Keep the desktop awake during agent work | [#478](https://github.com/hardbeat920/monocode/pull/478) |
| Editor scrollbar wheel scrolling | [#517](https://github.com/hardbeat920/monocode/pull/517) |
| Per-account usage in provider settings | [#529](https://github.com/hardbeat920/monocode/pull/529) |
| Resume after a usage-limit reset | [#534](https://github.com/hardbeat920/monocode/pull/534) |
| Provider CLI update controls | [#609](https://github.com/hardbeat920/monocode/pull/609) |
| Operator `sessions.wait` | [#610](https://github.com/hardbeat920/monocode/pull/610) |
| Terminal restoration across webview reload | [#616](https://github.com/hardbeat920/monocode/pull/616) |
| Separate sidebar/content opacity and chat blur | [#618](https://github.com/hardbeat920/monocode/pull/618) |

This is a selection, not a complete contributor list. The original community
commits and their author metadata are retained in Git history, alongside the
upstream history. See [CREDITS](../CREDITS.md) for contributor links.

## Distribution differences

Fork packages and upstream packages have independent source and update channels.
The current fork pipeline supports Windows x64 and Apple Silicon Mac local
builds; the signed public updater feed supplies Windows x64 packages. Mac local
packages are ad-hoc signed and are not notarized. Other upstream platforms or
release assets are not automatically supplied by this fork.

On Windows, the default fork installation uses the same executable installation
directory as the original app, while its database and WebView identity are
separate. Read the [fork guide](fork.md) before installing or copying data.

The original MIT license and copyright text remain unchanged. Fork changes use
MIT too; provider subscriptions, trademarks and dependency licenses remain with
their respective owners.
