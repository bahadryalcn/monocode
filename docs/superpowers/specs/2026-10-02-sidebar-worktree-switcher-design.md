# Sidebar worktree switcher — design

Date: 2026-10-02. Ports the upstream (hardbeat920/monocode) v0.7.0 "sidebar
working-copy switcher" into this fork at full parity, adapted to the layers
this fork added since v0.6.0.

## Goal

Each local worktree of a project gets its own workspace. Picking a worktree in
the sidebar title narrows the session list and the tab strip to it, new
sessions start in that checkout, and after a restart every project reopens on
its default workspace (the project folder).

## Approach

Port upstream's architecture as is: same file names, same exported functions,
same tests. Only the wiring in `src/app/App.tsx` and `src/app/shell/Sidebar.tsx`
is adapted by hand, because those two files have diverged. Upstream source is
read from the `v0.7.0` tag with `gh api`.

## Units

| Unit | Kind | Purpose |
| --- | --- | --- |
| `src/features/source-control/model/worktreeFocus.ts` | new, upstream verbatim | Per-project focused worktree, in memory for this run only. `worktreeFocus`, `setWorktreeFocus`, `useWorktreeFocus`, `inWorktreeFocus`. |
| `src/features/workspace/model/workspaceTabGroups.ts` | edit | Add `workspaceTabWorktree`, `tabInWorktree`; `planWorkspaceTabClose` takes `worktreeOf` so closing a tab stays in its worktree. |
| `src/features/workspace/model/workspaceSnapshot.ts` | edit | `collectWorkspaceSnapshot` takes `keepTab`; dropped tabs and the sessions only they showed are not saved. |
| `src/app/model/appLifecycle.ts` | edit | Thread `keepTab` through `setQuitWorkspace`, `handleQuitRequested`, `persistQuitState`. |
| `src/app/hooks/useWorkspaceNavigation.ts` | new, upstream verbatim | Queues workspace requests, applies only the latest, restores the remembered tab, moves a blank session or creates a tab. Exposes `selectWorkspace`, `selectProject`, `cancel`, `isSwitching`, `pending`, `error`, `revision`. |
| `src/features/source-control/ui/SidebarWorktreeSwitcher.tsx` | new, upstream verbatim | Sidebar title dropdown with per-worktree open-tab count and busy dot. |
| `src/app/shell/Sidebar.tsx` | edit | Render the switcher in the title; filter listed sessions with `inWorktreeFocus`. New props `worktreeTabStats`, `onSelectWorkspace`, `workspaceSwitchPending`, `workspaceSwitchError`. |
| `src/app/App.tsx` | edit | Workspace pins, tab-strip filter, new sessions in the focused checkout, cancel on ordinary navigation, composer lock while switching, `onWorktreeChange` gains `fromComposer` and `isCurrent`. |
| `src/shared/ui/icons.tsx` | edit | Add any icon the switcher needs that is missing (`ChevronsUpDown`, `FolderTree`). |

Tests ported from upstream alongside each unit: `worktreeFocus.test.ts`,
`workspaceTabGroups.test.ts`, `workspaceSnapshot.test.ts`, `layout.test.ts`
additions, `useWorkspaceNavigation.test.ts`, `SidebarWorktreeSwitcher.test.ts`.

## Behaviour

- A tab belongs to the workspace it was opened in (a "pin": tab or session id →
  worktree path). Unpinned tabs group by the worktree their first session runs in.
- The tab strip shows the active tab plus tabs whose workspace is the focused
  worktree. Tabs of other worktrees stay open, hidden.
- Selecting a worktree: reuse the active tab if it already belongs there, else
  the remembered tab for that workspace, else the last tab there, else move the
  active blank session into the checkout, else create a new tab.
- Rapid selections: only the latest request publishes focus and pins; a
  superseded one changes nothing. The switcher shows a spinner while pending and
  the error text on failure; the composer of the session being moved rejects
  submits until the switch settles.
- The composer's existing `WorktreePicker` keeps working: changing the checkout
  there pins the tab to the workspace on screen and does not change sidebar focus.
- Opening a session from the session list, search or inbox joins the workspace
  on screen while keeping its own checkout, and cancels any pending request.
- Returning to a project through the rail re-selects its remembered focus
  (`selectProject`); if no tab is open there, the landing conversation stays.
- New sessions (new tab, cleared tab, quick create) start in the focused
  checkout: `worktreeCwd` and `branch` are set from the focus.
- A focused worktree that is deleted or goes missing resets focus to the
  project folder.
- Remote projects and `~`: no switcher, plain "Workspace" title, behaviour
  unchanged. A project with no extra worktrees also shows the plain title.
- Restart: only tabs of each project's default workspace are saved. Restored
  tabs are pinned to the project folder.

## Fork-specific adaptations

These layers do not exist upstream, so they are handled explicitly here.

1. **Unsent drafts and queues survive.** This fork persists composer drafts per
   session (`composerDraftStore.ts`). A blank session in another worktree's tab
   would be dropped at quit and its draft orphaned. `keepWorkspaceTab` therefore
   also keeps a tab when any of its sessions has a non-empty draft
   (`composerDraftOf`) or queued messages. Such a tab reopens in the default
   workspace, still running in its own checkout.
2. **`projectReturn` memory.** `planProjectReturn` picks the landing pane before
   `selectProject` runs, as upstream. Add a test that a remembered pane living in
   a hidden worktree does not get activated without the focus following it.
3. **Rail groups and group lock.** Focus is keyed by project path only; group
   membership and lock state are untouched. A locked group hides its projects as
   today; the switcher renders only for the visible sidebar project.
4. **Window transfer.** Pins and focus are per window and in memory. A tab
   transferred to another window arrives unpinned and groups by its own worktree.
5. **Quick composer / automations / orchestration.** Sessions these create keep
   the checkout they ask for; they are not rewritten to the focused worktree.
   Orchestration workers and inbox sessions are never listed, as today.
6. **Any other mismatch found while wiring** (a call site of
   `planWorkspaceTabClose`, `collectWorkspaceSnapshot` or `setQuitWorkspace` that
   upstream does not have) is adapted in the same pass and covered by a test.

## Out of scope

Upstream's unrelated navigation changes in the same release: idle preload of
Inbox/Notes/Automations, `startTransition` around view switches, restoring the
previous view when Settings closes, and extracting `useIdleSessionDetach`.

## Error handling

- `useProjectWorktrees` load failure: shown inside the switcher popover.
- A failed switch: error text in the popover, focus stays on the workspace the
  landing tab actually belongs to, composer unlocked.
- Stale async completions are ignored via the `isCurrent` check passed into
  `onWorktreeChange`.

## Order of work

1. Model layer and its tests (`worktreeFocus`, `workspaceTabGroups`,
   `workspaceSnapshot`, `appLifecycle`).
2. `useWorkspaceNavigation` and its test.
3. `App.tsx` wiring, including the draft-aware `keepWorkspaceTab`.
4. `SidebarWorktreeSwitcher` and `Sidebar.tsx`.
5. Fork-specific tests (adaptations 1–4), full `vitest run`, `tsc --noEmit`,
   then a manual pass in the running app.

All work stays as uncommitted changes on the current branch.
