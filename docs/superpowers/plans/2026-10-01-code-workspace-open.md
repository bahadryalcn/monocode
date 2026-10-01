# Open VS Code Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open a `.code-workspace` file so each of its folders becomes a MonoCode project, collected in a project group named after the file.

**Architecture:** A pure TypeScript parser turns the file text into resolved folder paths. The app shell picks the file, reads it with the existing `readTextFile`, checks each folder with the existing `listDir`, opens the found ones through the existing `openProjects`, and assigns them to a named `ProjectGroup`. No Rust changes.

**Tech Stack:** TypeScript, React 19, Vitest, `@tauri-apps/plugin-dialog`.

## Global Constraints

- Code name is `codeWorkspace`; UI copy is "VS Code workspace". Do not reuse the bare word "workspace" for new identifiers.
- Local projects only.
- Missing folders are never dropped silently.
- No git commits or branches: leave all changes uncommitted in the working tree.
- `npm run check:web` must be green at the end.

---

### Task 1: Workspace file parser

**Files:**
- Create: `src/features/projects/model/codeWorkspace.ts`
- Test: `src/features/projects/model/codeWorkspace.test.ts`

**Interfaces:**
- Produces:
  - `OPEN_CODE_WORKSPACE_EVENT = "monocode:open-code-workspace"`
  - `type CodeWorkspace = { name: string; folders: string[]; unsupported: string[] }`
  - `parseCodeWorkspace(text: string, filePath: string): CodeWorkspace` — throws `Error` with a user-readable message when the text is not valid JSON-with-comments or has no `folders` array. `folders` are absolute, forward-slashed, deduplicated by `pathKey`. `unsupported` lists entries without a `path` (their `uri`, or `"(unknown entry)"`).

- [ ] **Step 1: Write the failing tests** covering: file stem as name; relative paths (`.`, `sub`, `../sibling`) resolved against the file's directory; absolute Windows and POSIX paths kept; backslashes normalised for a Windows file; `//` and `/* */` comments and trailing commas accepted, with `//` inside a string preserved; duplicates removed; `uri` entries reported in `unsupported`; malformed JSON and a missing `folders` array both throw.
- [ ] **Step 2: Run** `npx vitest run src/features/projects/model/codeWorkspace.test.ts` — expected: FAIL, module not found.
- [ ] **Step 3: Implement** `stripJsonComments`, `stripTrailingCommas` (both string-aware scanners), `resolveFolder`, and `parseCodeWorkspace`.
- [ ] **Step 4: Run** the same command — expected: PASS.

### Task 2: Named group assignment

**Files:**
- Modify: `src/features/projects/model/projectGroups.ts` (append after `createProjectGroup`)
- Test: `src/features/projects/model/projectGroups.test.ts`

**Interfaces:**
- Produces: `assignProjectsToNamedGroup(name: string, paths: readonly string[]): ProjectGroup | null` — reuses a group whose name matches case-insensitively, otherwise creates one; assigns every path to it (moving it out of any other group); returns `null` for a blank name or empty `paths`.

- [ ] **Step 1: Write the failing tests**: creates a group and assigns paths; reuses an existing group on a second call (group count stays 1); moves a project out of another group; returns `null` and changes nothing for empty input.
- [ ] **Step 2: Run** `npx vitest run src/features/projects/model/projectGroups.test.ts` — expected: FAIL, export missing.
- [ ] **Step 3: Implement** with `loadProjectGroups`, `createProjectGroup`, `saveProjectGroups`, `loadProjectGroupAssignments`, `saveProjectGroupAssignments`, `pathKey`.
- [ ] **Step 4: Run** the same command — expected: PASS.

### Task 3: File picker, menu item and open flow

**Files:**
- Modify: `src/platform/tauri/fs.ts` (after `pickFolders`)
- Modify: `src/app/shell/ProjectRail.tsx` (`AddProjectButton`)
- Modify: `src/app/App.tsx` (after `pickProject`)

**Interfaces:**
- Consumes: `parseCodeWorkspace`, `OPEN_CODE_WORKSPACE_EVENT`, `assignProjectsToNamedGroup`.
- Produces: `pickCodeWorkspaceFile(): Promise<string | null>` in `fs.ts`.

- [ ] **Step 1:** Add `pickCodeWorkspaceFile` using the dialog `open` with `filters: [{ name: "VS Code workspace", extensions: ["code-workspace"] }]`.
- [ ] **Step 2:** Add an "Open VS Code workspace…" menu item to `AddProjectButton` between the two existing items; it dispatches `OPEN_CODE_WORKSPACE_EVENT`, mirroring the remote-project item.
- [ ] **Step 3:** In `App.tsx` add `openCodeWorkspace`: pick the file, `readTextFile`, `parseCodeWorkspace`, probe each folder with `listDir` (reject = missing), then:
  - no folder found → `message(..., { kind: "error" })`, change nothing;
  - otherwise `openProjects(found)`, `assignProjectsToNamedGroup(name, found)`, and if anything was missing or unsupported, `message(..., { kind: "warning" })` listing them;
  - parse/read failure → `message(error.message, { kind: "error" })`.
  Register it with a `useEffect` listener on `OPEN_CODE_WORKSPACE_EVENT`.
- [ ] **Step 4: Run** `npm run check:web` — expected: all tests pass, `tsc` clean.
- [ ] **Step 5: Manual check** in the running dev app: open a real `.code-workspace` file and confirm the projects and group appear; open one with a missing folder and confirm the warning.
