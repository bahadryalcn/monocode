# VS Code workspace support — design

Date: 2026-10-01. Local-only feature for personal use; not intended for upstream.

## Goal

Open a VS Code `.code-workspace` file in MonoCode, and let an agent session reach
the workspace's other folders.

## Naming

"Workspace" already means tab layout (`WorkspaceTab`, `WorkspaceSnapshot`) and
checkout-versus-worktree (`WorkspaceMode`, `WorkspacePicker`). This feature uses
`codeWorkspace` in code and "VS Code workspace" in the UI.

## Phase 1 — open a `.code-workspace` file

- A pure TypeScript parser `parseCodeWorkspace(text, filePath)` reads the file
  as JSON with comments and trailing commas, resolves each `folders[].path`
  against the file's directory, and returns `{ name, folders, unsupported }`.
  `name` is the file stem. Entries with a `uri` instead of a `path` go to
  `unsupported`. All other keys (`settings`, `extensions`, `launch`, `tasks`)
  are ignored. The file is read with the existing `readTextFile` and folders are
  probed with the existing `listDir`, so no Rust change is needed.
- Entry point: an "Open VS Code workspace…" item in the project rail's add
  menu (native file dialog filtered to `.code-workspace`). The app has no
  folder drop target for projects today, so drag-and-drop is out of scope.
- Existing folders are opened through the existing `openProjects(paths)` flow,
  so each folder is an ordinary project.
- The projects are then assigned to a `ProjectGroup` named after the file. If a
  group with that name exists it is reused; projects already in another group
  are moved. Re-opening the same file is idempotent.
- Missing folders are never dropped silently: a notice lists them. A file with
  no usable folders, or one that fails to parse, shows an error and changes
  nothing.
- No link back to the file is stored and the file is not watched.

## Phase 2 — multi-folder sessions

As built (differs from the first draft, which stored the folders per session):

- Additional folders are a per-project setting in localStorage
  (`monocode.projectAdditionalDirs`), so every session in the project shares
  them and no session-table migration is needed.
- The project's context menu in the rail has "Additional folders…". The dialog
  lists the other local projects of the same rail group; default is none
  selected. Manually created groups qualify too.
- Adapters read the folders through `additionalDirsFor(sessionId)` in
  `src/integrations/harness/core/additionalDirs.ts`, which the app backs with a
  resolver. Every operation on a session therefore sees the same list.
- Claude gets one `--add-dir` per folder; the list is part of the settings key,
  so a change restarts the process on the next message.
- Codex runs as `app-server`, which has no `--add-dir`; the folders are sent as
  `writableRoots` on the `workspaceWrite` sandbox policy of each thread and turn.
- Cursor and the other providers are not wired: Cursor speaks ACP, whose
  `session/new` takes a single `cwd`, and its CLI is not installed here to
  check for an alternative.
- The file tree and source-control panel keep showing the primary folder only.
- Remote projects are out of scope; the picker is hidden for them.

## Testing

- Rust unit tests for parsing (comments, trailing commas, relative and absolute
  paths, `uri` entries, missing folders, malformed file).
- TS unit tests for group reuse/assignment and for adapter argument building.
- `npm run check` green.
