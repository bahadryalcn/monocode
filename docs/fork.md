# Running this fork next to the official MonoCode

This checkout can be built and installed as **MonoCode** (replacing the official app, with its own data directory), unlike
the official MonoCode. Three identities keep their data apart:

| Build                            | Product name | Identifier                  | Data dir (`%APPDATA%\<id>`) | Install dir                    |
| -------------------------------- | ------------ | --------------------------- | --------------------------- | ------------------------------ |
| Official release                 | MonoCode     | `com.monocode.desktop`      | `com.monocode.desktop`      | `%LOCALAPPDATA%\MonoCode`      |
| Installed fork (`build:windows`) | MonoCode     | `com.monocode.desktop.fork` | `com.monocode.desktop.fork` | `%LOCALAPPDATA%\MonoCode Fork` |
| `npm run tauri dev`              | MonoCode Dev | `com.monocode.desktop.dev`  | `com.monocode.desktop.dev`  | not installed                  |

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
Tools. Tauri downloads NSIS itself on first use. An updater signing key is required (see below). Windows Authenticode signing
is separate and is not configured, so SmartScreen may warn.

```
npm run build:windows
```

Output: `src-tauri\target\release\bundle\nsis\MonoCode_<version>_x64-setup.exe`
(per-user install, no admin). Run it; it does not touch the official install.

## Automatic Windows updates

The installed fork uses its own signed feed:
https://github.com/bahadryalcn/monocode/releases/latest/download/latest.json
Development builds do not check for updates. The installed app checks at startup
and every 30 minutes. Users install from the sidebar or Check for Updates;
installation closes/restarts the app, so finish active tasks and save work first.
The fork identifier and data directory remain unchanged.

The signing key is stored outside the repository at
`%USERPROFILE%\.tauri\monocode-fork.key`. Back it up securely: losing it prevents
updates to installed clients. The matching public key is in the fork config.
`npm run build:windows` loads this key automatically, or accepts
`TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` from the environment.
Never commit the private key. Updater signatures do not replace Windows
Authenticode signing or eliminate SmartScreen warnings.

GitHub Actions requires `TAURI_SIGNING_PRIVATE_KEY` in repository Secrets and,
for an encrypted key, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. The private key secret
has been provisioned for this repository. `.github/workflows/fork-release.yml`
builds a Windows x64 installer and signature, creates `latest.json`, uploads all
assets to a draft release, then publishes it. All version files must match the tag.
Do not publish unrelated releases as latest: this feed follows GitHub's latest release.

To publish after committing and pushing the intended source changes:

```powershell
npm run set-version -- 0.8.34
# Review, commit and push the version changes along with your code.
git tag v0.8.34
git push origin v0.8.34
```

A failed upload leaves a draft release; delete the incomplete draft before rerunning.
The manual workflow trigger must select an existing version tag, not a branch.
Existing installations with updates disabled need this first installer installed
manually. Subsequent releases can update in-app. Initially only Windows x64 is
published; macOS/Linux need their own build jobs and platform feed entries.
Verify the first rollout with two versions: install the older updater-enabled
build, publish the newer version, check its notification, install, and confirm
version, settings and session data after restart. Also test offline checks and
invalid signatures. CI/local packaging alone does not prove this installed flow.

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

Source: `%APPDATA%\com.monocode.desktop`
(`monocode.db` + WAL files, `checkpoints`, `provider-accounts`, `project-logos`,
`backgrounds`, `jira-config.json`) and, with `-IncludeWebView`,
`%LOCALAPPDATA%\com.monocode.desktop\EBWebView`. The source is
only read. A non-empty target stops the script; `-Force` first moves it aside
to `<dir>.bak-<timestamp>` (never deletes). After copying, the fork and the
official app have independent copies, so do not run the same conversation in both.
