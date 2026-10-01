# Running this fork next to the official MonoCode

This checkout can be built and installed as **MonoCode Fork**, side by side with
the official MonoCode. Three identities keep their data apart:

| Build | Product name | Identifier | Data dir (`%APPDATA%\<id>`) | Install dir |
| --- | --- | --- | --- | --- |
| Official release | MonoCode | `com.monocode.desktop` | `com.monocode.desktop` | `%LOCALAPPDATA%\MonoCode` |
| Installed fork (`build:windows`) | MonoCode Fork | `com.monocode.desktop.fork` | `com.monocode.desktop.fork` | `%LOCALAPPDATA%\MonoCode Fork` |
| `npm run tauri dev` | MonoCode Dev | `com.monocode.desktop.dev` | `com.monocode.desktop.dev` | not installed |

`src-tauri/tauri.conf.json` carries the **dev** identity so a plain `tauri dev`
can never touch the official or the installed fork's database.
`src-tauri/tauri.fork.conf.json` overrides it for the installer build.
The WebView profile (UI settings in localStorage) lives separately under
`%LOCALAPPDATA%\<id>\EBWebView`. The control server listens on an ephemeral
localhost port and there is no single-instance or deep-link plugin, so there is
nothing else shared between the apps.

## Build the installer

Prerequisites: Node + `npm ci`, the Rust MSVC toolchain
(`stable-x86_64-pc-windows-msvc`, as set by the script) and Visual Studio Build
Tools. Tauri downloads NSIS itself on first use. No signing key is needed: the
Windows config disables updater artifacts and no code-signing command is set,
so the installer is unsigned (SmartScreen will warn once).

```
npm run build:windows
```

Output: `src-tauri\target\release\bundle\nsis\MonoCode Fork_<version>_x64-setup.exe`
(per-user install, no admin). Run it; it does not touch the official install.

## Updater is disabled

Only a build whose identifier is exactly `com.monocode.desktop` ever contacts the
release feed (`isUpdaterEnabled` in `src/app/model/updater.ts`). In the fork and
dev builds the startup probe, "Check for updates" (menu and Settings) and the
sidebar update row do nothing; the menu item explains that updates are
disabled, and Settings shows "Automatic updates are disabled in this build" with
the check button hidden. "What's new" still works. The fork config also
keeps updater endpoints and pubkey empty and `createUpdaterArtifacts` off.
To update the fork, sync with upstream and rebuild.

## Sync with upstream

```
pwsh scripts/sync-upstream.ps1          # fetch and report only
pwsh scripts/sync-upstream.ps1 -Merge   # merge upstream/main if the tree is clean
```

The merge refuses to start on a dirty tree and stops on conflicts, telling you to
resolve them or `git merge --abort`.

One upstream PR only:

```
git fetch upstream pull/<n>/head:pr-<n>
git merge pr-<n>
```

## Carry the official data over (optional)

The fork starts empty. To copy your sessions, checkpoints and provider
accounts, close **all** MonoCode windows, then:

```
pwsh scripts/copy-official-data.ps1 -WhatIf            # preview
pwsh scripts/copy-official-data.ps1 -IncludeWebView    # copy for the installed fork
pwsh scripts/copy-official-data.ps1 -Target Dev        # copy for `tauri dev`
```

Source on this machine: `C:\Users\kraba\AppData\Roaming\com.monocode.desktop`
(`monocode.db` + WAL files, `checkpoints`, `provider-accounts`, `project-logos`,
`backgrounds`, `jira-config.json`) and, with `-IncludeWebView`,
`C:\Users\kraba\AppData\Local\com.monocode.desktop\EBWebView`. The source is
only read. A non-empty target stops the script; `-Force` first moves it aside
to `<dir>.bak-<timestamp>` (never deletes). After copying, the fork and the
official app have independent copies, so do not run the same conversation in both.
