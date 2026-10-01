# Git features — design

Date: 2026-10-01. Local-only feature set for personal use; not intended for upstream.

## Goal

Bring the source-control panel closer to VS Code: a full commit graph with
actions, branch operations, fetch, stash management, conflict handling, blame
and file history.

## Shared rules

- Git keeps being invoked by shelling out to the `git` binary through the
  existing `git_checked` / `git_cmd` helpers in `src-tauri/src/fs.rs`. No new
  git library.
- Each new command is a `#[tauri::command]` plus a wrapper in
  `src/platform/tauri/fs.ts`.
- Local projects only. New commands are not added to the remote allow-list or
  the host; for `remote://` projects the new actions are disabled.
- Destructive actions (hard reset, branch delete, stash drop, discard during
  conflict) open a confirmation dialog. No force push.
- Until stage 4, an operation that stops on conflicts shows the in-progress
  state (merge / rebase / cherry-pick / revert) with an "Abort" action only.

## Stage 1 — full graph

- `git_history` gains a scope (`current` = today's three tips, `all` =
  `--all`), a `skip` offset for "load more", and a search term matched against
  subject, author and SHA.
- `GitHistoryGraph` gets a scope toggle, a search box and a load-more row.
- Row context menu: checkout (detached), create branch here, create tag here,
  cherry-pick, revert, reset current branch here (soft / mixed / hard), copy
  SHA.
- New commands: `git_cherry_pick`, `git_revert`, `git_reset`, `git_create_tag`,
  `git_operation_state`, `git_operation_abort`.

## Stage 2 — branch operations and fetch

- Branch picker rows get delete (`-d`, with a second confirmation offering
  `-D` when unmerged), rename, merge into current, rebase current onto.
- `git_fetch` (`fetch --all --prune`) with a button in the sync actions, and an
  auto-fetch setting (off / interval) that refreshes ahead/behind.
- New commands: `git_delete_branch`, `git_rename_branch`, `git_merge`,
  `git_rebase`, `git_fetch`.

## Stage 3 — stash management

- A collapsible "Stashes" section in the changes panel: list, open a stash as a
  read-only diff, apply, pop, drop.
- New commands: `git_stash_list`, `git_stash_show`, `git_stash_apply`,
  `git_stash_pop`, `git_stash_drop`.

## Stage 4 — conflict UI

- The diff index reports unmerged paths; the changes panel shows them in a
  "Merge Conflicts" section with a conflict status letter.
- Opening a conflicted file shows each conflict block with accept ours /
  accept theirs / accept both; saving and staging marks it resolved.
- The in-progress banner from stage 1 gains "Continue".
- New commands: `git_operation_continue`, plus unmerged-path data in
  `git_diff_index`.

## Stage 5 — blame and file history

- Editor toggle for per-line blame (author, date, subject; click opens the
  commit diff).
- "File history" for the open file: the commits that touched it, each opening
  that commit's diff for the file.
- New commands: `git_blame`, `git_file_history`.

## As built

- Search filters the commits already loaded, client-side; "Load more commits"
  raises the limit in steps of 200 (cap 5000). `git_history` takes `all`, not a
  search term or offset.
- Branch operations live in a "Manage Branches…" dialog opened from the changes
  header menu, next to Fetch and Auto Fetch (every 5 minutes while the panel is
  open). They are not in the composer's branch picker.
- Conflicts are resolved per file from the in-progress banner: Current,
  Incoming, Both, or Resolved. There is no per-block control inside the editor.
- Blame and file history are dialogs opened from the explorer's file context
  menu, not an editor gutter.
- A stash opens in the existing commit diff view, which shows its tracked
  changes; untracked files in a stash are not shown.

## Testing

- Rust unit tests against temporary repositories for each new command,
  following the existing tests in `fs.rs`.
- TS unit tests for graph layout with the wider scope and for menu/model logic.
- `npm run check` green at the end of every stage.
