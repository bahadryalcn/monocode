# Sidebar Worktree Switcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each local worktree of a project its own workspace: sidebar switcher, per-worktree session list and tab strip, new sessions in the focused checkout, default workspace on restart.

**Architecture:** Port upstream hardbeat920/monocode v0.7.0 units verbatim (model, navigation hook, switcher UI, tests) and hand-wire `App.tsx` and `Sidebar.tsx`, which have diverged. Fork-only layers (draft persistence, `projectReturn`, rail groups, window transfer) get explicit rules and tests.

**Tech Stack:** React 19, TypeScript, Vitest, Tauri. Spec: `docs/superpowers/specs/2026-10-02-sidebar-worktree-switcher-design.md`.

## Global Constraints

- No `git commit`, `git push`, branches, stashes or worktrees. Everything stays as uncommitted changes on `main`. (Replaces the usual per-task commit step.)
- The working tree holds the user's unrelated uncommitted work. Never revert, restore or overwrite a file wholesale; edit additively.
- Upstream source for a file: `gh api "repos/hardbeat920/monocode/contents/<path>?ref=v0.7.0" -H "Accept: application/vnd.github.raw"`.
- Upstream patch for a file: `gh api repos/hardbeat920/monocode/compare/v0.6.0...v0.7.0 --jq '.files[] | select(.filename=="<path>") | .patch'`.
- Out of scope: idle preload of Inbox/Notes/Automations, `startTransition` around view switches, Settings return view, `useIdleSessionDetach` extraction.
- Remote projects and `~` never get a worktree focus.
- Verify each task with `npx vitest run <paths>`; finish with `npx vitest run` and `npx tsc --noEmit`.

---

### Task 1: Model layer

**Files:**
- Create: `src/features/source-control/model/worktreeFocus.ts`, `worktreeFocus.test.ts` (upstream verbatim)
- Modify: `src/features/workspace/model/workspaceTabGroups.ts` (+ `.test.ts`)
- Modify: `src/features/workspace/model/workspaceSnapshot.ts` (+ `.test.ts`)
- Modify: `src/app/model/appLifecycle.ts`
- Check: `src/features/sessions/model/sessionWorkspaceLifecycle.ts:72` (fork-only caller of `planWorkspaceTabClose`)

**Interfaces — Produces:**
- `type WorktreeFocus = { path: string; branch: string | null }`
- `worktreeFocus(project): WorktreeFocus | undefined`, `setWorktreeFocus(project, focus | undefined)`, `useWorktreeFocus(project)`, `inWorktreeFocus(session: { cwd; worktreeCwd? }, focus)`
- `workspaceTabWorktree(tab, sessions): string | null`, `tabInWorktree(tab, sessions, worktree): boolean`
- `planWorkspaceTabClose({ ..., worktreeOf?: (tab: WorkspaceTab) => string | null })`
- `collectWorkspaceSnapshot(tabs, sessions, activeTabId, projectCwd, memory, projectTerminals?, lastDockSide?, keepTab?: (tab: WorkspaceTab) => boolean)`
- `setQuitWorkspace(..., lastDockSide?, keepTab?)`, `persistQuitState(..., lastDockSide?, keepTab?)`

- [ ] **Step 1:** Fetch `worktreeFocus.ts` and its test from upstream into place.
- [ ] **Step 2:** Port the upstream test additions for `workspaceTabGroups.test.ts`, `workspaceSnapshot.test.ts` (append the new cases; keep ours). Run them: expect FAIL on missing exports / `keepTab`.
- [ ] **Step 3:** Apply the upstream patches to `workspaceTabGroups.ts` (`workspaceTabWorktree`, `tabInWorktree`, `worktreeOf` + `sameScope` in `planWorkspaceTabClose`) and `workspaceSnapshot.ts` (`keepTab`, `keptIds`, `droppedIds`).
- [ ] **Step 4:** Thread `keepTab` through `appLifecycle.ts` (`liveWorkspace`, `setQuitWorkspace`, `handleQuitRequested`, `persistQuitState` and both `collectWorkspaceSnapshot` calls at ~550 and ~575; our file has more parameters than upstream, so append `keepTab` last).
- [ ] **Step 5:** `npx vitest run src/features/source-control/model/worktreeFocus.test.ts src/features/workspace/model src/app/model/appLifecycle.test.ts` → PASS.

### Task 2: Navigation hook

**Files:**
- Create: `src/app/hooks/useWorkspaceNavigation.ts`, `useWorkspaceNavigation.test.ts` (upstream verbatim; fix imports if our paths differ)

**Interfaces:**
- Consumes: Task 1 exports, `isBlankSession` from `projectReturn`, `filterTabsForProject`, `workspaceTabCwd`.
- Produces: `useWorkspaceNavigation({ project, activeTabId, tabs, sessions, pins: Map<string,string>, tabWorkspace(tab, sessions), moveSession(id, tree: Worktree, isCurrent), activateTab(id), createTab(project, focus?) })` → `{ selectWorkspace(project, focus?), selectProject(project), cancel(), isSwitching(sessionId), pending, error, revision }`.

- [ ] **Step 1:** Fetch both files. Check our `Worktree` type has the fields the hook builds (`path, branch, head, isMain, locked, prunable, missing, dirty, unpushed, sessionIds`); add any extra required field of ours to the literal.
- [ ] **Step 2:** `npx vitest run src/app/hooks` → PASS.

### Task 3: App.tsx wiring

**Files:** Modify `src/app/App.tsx`.

**Interfaces — Consumes:** Tasks 1–2. **Produces** (props for Task 4): `worktreeTabStats: ReadonlyMap<string, { tabs: number; busy: boolean }>`, `onSelectWorkspace(focus?: WorktreeFocus)`, `workspaceSwitchPending: boolean`, `workspaceSwitchError?: string`.

- [ ] **Step 1:** Rename state setter: `const [activeTabId, setActiveTabIdState] = useState(` (line ~1034). After the navigation hook, define `setActiveTabId = useCallback((id) => { workspaceNavigation.cancel(); setActiveTabIdState(id); }, [workspaceNavigation.cancel])` so every existing `setActiveTabId` call cancels a pending switch.
- [ ] **Step 2:** Add after `projectCwd`/`sessionsRef` are available: `projectWorktree = useWorktreeFocus(projectCwd)`, `restoredPins`, `workspacePins`, `tabWorkspace`, `tabWorktreeOf`, `keepWorkspaceTab`, the `useWorkspaceNavigation` call, module-level `currentWorkspace(project)`. Code as in the upstream patch hunk `@@ -1100,6 +1146,84 @@`.
- [ ] **Step 3 (fork rule — drafts):** `keepWorkspaceTab` additionally returns `true` when any session id in `leafIds(tab.layout)` has an unsent draft (`composerDraftOf(id)` text or attachments non-empty) or a non-empty queue on the session.
- [ ] **Step 4:** `activateTab` gains `reason: "session" | "workspace" = "session"`; `"workspace"` uses `setActiveTabIdState`.
- [ ] **Step 5:** Add `createWorkspaceTab(cwd, focus?)`; in the new-tab path at ~2377 start the session in `worktreeFocus(cwd)` (`worktreeCwd`, `branch`). In the clear-tab replacement session (upstream hunk `@@ -3130,13 +3221,33 @@`) keep the tab's workspace.
- [ ] **Step 6:** Pass `worktreeOf: tabWorktreeOf` to all six `planWorkspaceTabClose` calls (~2897, 3074, 3306, 3341, 3470, 3512).
- [ ] **Step 7:** Tab strip filter at ~3532: keep the active tab plus tabs whose `tabWorkspace` is null or equals `projectWorktree?.path ?? projectCwd`; add `worktreeTabStats` memo.
- [ ] **Step 8:** Pass `keepWorkspaceTab` to `setQuitWorkspace` (~1870), both `persistQuitState` calls (~1466, ~1897) and `collectWorkspaceSnapshot` (~2082); add `keepWorkspaceTab`, `projectWorktree?.path`, `workspaceNavigation.revision` to that effect's deps.
- [ ] **Step 9:** `onWorktreeChange(sessionId, tree, fromComposer = false, isCurrent = () => true)` with `isCurrent()` guards after each await and pin updates; add `onComposerWorktreeChange` and pass it where the composer's picker is wired (~10895); add `onSelectWorkspace`; `openProject` (~5431) cancels then `selectProject(path)`.
- [ ] **Step 10:** Composer lock: OR `workspaceNavigation.isSwitching(sessionId)` into the `switchingWorktrees.current.has(sessionId)` checks at ~4587 and ~6255, and reject submit while switching. Cancel navigation on pane focus change and when opening a session directly.
- [ ] **Step 11:** `npx tsc --noEmit` → clean; `npx vitest run src/app` → PASS.

### Task 4: Sidebar UI

**Files:**
- Create: `src/features/source-control/ui/SidebarWorktreeSwitcher.tsx`, `.test.ts` (upstream verbatim)
- Modify: `src/shared/ui/icons.tsx` (add `ChevronsUpDown`; `FolderTree`, `GitBranch`, `Loader`, `Check` exist)
- Modify: `src/app/shell/Sidebar.tsx` (props; `listedSessions` filter at ~615 with `inWorktreeFocus(session, focusedWorktree)` where `focusedWorktree = remoteProject ? undefined : useWorktreeFocus(cwd)`; title at ~1607)
- Modify: `src/app/App.tsx` (pass the four props to `<Sidebar>`)

- [ ] **Step 1:** Fetch switcher + test; add the missing icon following the `wrap(...)` pattern in `icons.tsx`.
- [ ] **Step 2:** Edit `Sidebar.tsx` per the upstream patch; pass props from `App.tsx`.
- [ ] **Step 3:** `npx vitest run src/features/source-control/ui/SidebarWorktreeSwitcher.test.ts src/app/shell` → PASS.

### Task 5: Fork-specific tests and full verification

**Files:** Modify `src/features/workspace/model/workspaceSnapshot.test.ts`, `src/features/projects/model/projectReturn.test.ts`; possibly extract `keepWorkspaceTab` logic into a pure function in `workspaceTabGroups.ts` so the draft rule is testable.

- [ ] **Step 1:** Extract `shouldKeepWorkspaceTab({ tab, sessions, tabWorkspace, hasUnsentWork })` as a pure function; tests: other-worktree tab dropped; other-worktree tab with draft kept; remote project tab kept; default-workspace tab kept.
- [ ] **Step 2:** Test that `planProjectReturn` + worktree filter never leaves the active tab hidden (active tab is always in the strip).
- [ ] **Step 3:** `npx vitest run` (full) and `npx tsc --noEmit` → both clean.
- [ ] **Step 4:** Report what could not be verified without running the app (switcher popover, tab strip narrowing, restart behaviour).
