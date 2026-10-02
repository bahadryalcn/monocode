# Project/group sync across paired machines — design

Date: 2026-10-02. Local-only feature set for personal use; not intended for upstream.

## Goal

When this desktop is paired with a remote machine (existing SSH-tunnel + host
connection), keep the "library" — recent/archived projects, project groups,
group↔project assignments, rail order/pinned state, and group-lock
passwords — in sync between this desktop and the remote machine's own
desktop, in both directions, automatically.

Scope for v1: exactly one paired remote machine. Multi-machine mesh sync is
out of scope and left for a later design.

## Shared rules

- The already-running **host** process on the paired machine becomes the
  single authoritative store for synced library data. Both desktops are
  sync clients: this desktop reaches it over the existing SSH tunnel + bearer
  token RPC channel; the remote machine's own desktop reaches the same host
  over loopback (`127.0.0.1`), with no tunnel needed since they're on the
  same machine.
- No new transport or crypto primitive. Transport confidentiality is the
  existing SSH tunnel (remote) or OS loopback (local). "Encryption" in scope
  means: the group lock stays protected the same way it is today — one
  app-wide password, stored as a PBKDF2-SHA256 verifier (never plaintext),
  600k iterations (`src/features/group-lock/model/passwordRecord.ts`). That
  single verifier (the `record` field of `GroupLockSettings`, currently only
  in `localStorage` under `monocode.groupLock`) now travels through sync, so
  the same password locks and unlocks groups on both machines. Each group's
  own `lockable: boolean` flag is already part of `ProjectGroup` and syncs
  as a normal field — there is no per-group password.
- Conflict resolution is last-write-wins at the single-record granularity
  (project path entry, group, assignment, rail layout). The host assigns
  each record a monotonically increasing revision; a push whose base
  revision is stale is rejected and the pusher adopts the host's current
  value. No 3-way merge — this is the same user's two machines, not
  multi-user collaboration.
- A project's identity is a stable `projectId`, independent of path. Each
  machine maps that id to its own absolute path. If a project is known but
  has no path mapping on this machine, it appears in the rail as a disabled
  placeholder ("mevcut, bu makinede yol bilinmiyor"); the user resolves it
  by manually opening the matching local folder, which records the mapping.
  No automatic path guessing.
- This identity/path-map only applies to plain local-filesystem recents
  entries. A `remote://<environmentId>/<hostPath>` entry (an "open folder on
  a machine" project, `REMOTE_PROJECT_PREFIX` in
  `src/features/projects/model/recents.ts`) is already portable by
  construction — `environmentId` identifies the same host everywhere — so it
  is excluded from this sync feature entirely and keeps working exactly as
  it does today, scoped to whichever desktop paired that host.

## Stage 1 — host-side sync store and RPC

- New tables in the host's SQLite (`host/store.ts`): `sync_projects(id,
  created_at)`, `sync_project_paths(project_id, machine_id, path, archived,
  updated_rev, updated_at)`, `sync_groups(id, name, color_index,
  custom_color, mascot, workspace_file, workspace_folders_json, lockable,
  password_verifier_json, updated_rev, updated_at)`,
  `sync_assignments(project_id, group_id, updated_rev, updated_at)`,
  `sync_rail_layout(id FIXED 'rail', ordered_json, updated_rev, updated_at)`,
  `sync_lock(id FIXED 'lock', record_json, updated_rev, updated_at)` for the
  single group-lock password verifier, `sync_machines(id, label, kind,
  last_seen_at)`.
- New RPC methods alongside the existing session RPC
  (`host/server.ts`): `sync.pull { sinceRev }` → `{ rev, projects, paths,
  groups, assignments, railLayout, lock, machines }`; `sync.push { ops:
  [{table, op, payload, baseRev}] }` → `{ rev, applied, rejected: [{op,
  currentValue}] }`. These two method names are added to the Rust
  allow-list (`supported_remote_method` in `src-tauri/src/remote.rs`) so the
  existing generic `remote_request`/`remoteRequest` plumbing
  (`src/features/connections/model/connections.ts`) carries them with no
  other Rust changes — same bearer-token auth as every other RPC call.
- `sync/push` applies ops in order inside one transaction; a record whose
  stored `updated_rev` is greater than the op's `baseRev` is rejected (kept
  as-is) and returned in `rejected` with the current value.

## Stage 2 — desktop sync client

- New module `src/features/sync/` (mirrors the shape of
  `src/features/connections/model/`):
  - `syncMachineId.ts` — generates and persists this desktop's own stable
    machine id (one-time, in the Tauri app data dir).
  - `syncOutbox.ts` — a small persisted queue of pending ops, appended to
    whenever a local mutation happens (see below), drained on push.
  - `syncClient.ts` — push-then-pull loop: push the outbox, adopt any
    `rejected` values locally, pull everything since the last known
    revision, apply incoming records.
- Hook points: `recents.ts`, `projectGroups.ts` (groups + assignments),
  the rail order/pinned module, and `passwordRecord.ts` each gain an
  `applyRemote*` entry point that updates local state (localStorage today)
  without re-enqueuing an outbox op, plus their existing mutators now also
  enqueue an outbox op.
- Triggers for the push/pull loop: tunnel established or reconnected
  (`remoteReconnect.ts`), any local mutation (debounced ~300ms), and a
  10s safety-net poll while the connection is up. Offline edits stay in the
  outbox and flush on the next successful connection.

## Stage 3 — local host auto-pairing (the remote machine's own desktop)

No new host-side mechanism is needed: the host CLI already supports
`connection-info` (confirms a host is live and reports its port) and `pair
--name <name> --json` (issues a device credential, printed once to stdout,
never persisted in plaintext) — this is exactly what the SSH bootstrap flow
already does remotely (`src-tauri/src/remote_ssh.rs::pairing_script`),
just over an SSH session instead of a local process.

- A new Tauri command (`src-tauri/src/local_host.rs`) resolves the local
  launcher the same way the existing Unix/Windows pairing scripts do
  (`$HOME/.monocode-host/bin/monocode-host` on Unix; the runtime recorded in
  `%USERPROFILE%\.monocode-host\runtime-path` on Windows), runs it as a
  plain local child process (no SSH) with `connection-info`, and only
  proceeds if that succeeds (a host is actually running on this machine).
- It then checks the desktop's own saved machines
  (`remote_machines`/`remote-machines.json`) for one already pointed at
  `http://127.0.0.1:<port>`. If one exists and still answers
  `environment.describe`, it's reused — nothing else happens. Otherwise the
  command runs the launcher's `pair --name <computer name> --json`, parses
  `{id, token, environmentId}` from its stdout, and calls the existing
  `remote_connect` logic to save it like any other connection.
- The frontend calls this once on startup (and after reconnect); if it
  returns no machine (no local host, or launcher not found), it silently
  does nothing — this desktop simply has no local sync peer. There is no
  separate manual step for the common case where the SSH bootstrap already
  installed the host on this machine.

## Stage 4 — conflict/error handling

- Per-record last-write-wins as described above. If an incoming sync
  overwrites a local edit made in the last ~5s, show a transient toast
  ("Bu değişiklik diğer makineden gelen güncellemeyle birleştirildi.").
- Connection loss mid-push leaves ops in the outbox; retried on the existing
  reconnect backoff schedule (2/5/15/30s, then 1min).
- A host-side write failure surfaces as a normal RPC error; the desktop
  keeps its local cache and retries later. Local state is authoritative
  until a push succeeds, so a failed push never loses local data.
- Two machines mapping the same real folder to different `projectId`s (or
  the reverse — a symlink alias) is not auto-detected in v1; the user
  resolves it manually.

## Non-goals (v1)

- Multi-machine mesh sync (more than one paired remote machine).
- Any new encryption primitive beyond the existing SSH transport and the
  existing PBKDF2 group-lock verifier.
- Automatic path mapping/guessing between machines.
- Syncing per-project provider/model settings, open tabs, or draft text.

## Testing plan

- Host: unit tests for `sync/push`/`sync/pull` — concurrent push rejection,
  revision monotonicity, empty pull, many-record payloads.
- Desktop: unit tests for outbox capture and `applyRemote*` merge logic in
  `recents.ts`/`projectGroups.ts`/rail-order module (existing `npm run
  check:web` happy-dom harness).
- Integration: extend the host's fake-provider test harness to run two
  simulated desktop clients against one host, verifying convergence after a
  disconnect with concurrent edits on both sides.
- Manual: the loopback self-pairing path, since it depends on real OS file
  permissions — verify by hand on Windows and on the Linux/macOS host, same
  as the existing manual-verification note for SSH-to-Task-Scheduler setup.
