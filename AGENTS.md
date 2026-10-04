# MonoCode local app/host updates

For local Windows PC and MacBook build/install work, read `docs/local-update.md` and use `scripts/update-local.ps1` as the shared coordinator. Do not recreate ad-hoc build folders, SSH build commands, service swaps, or installer helpers. Use `-Plan` to review the selected machines/options and `-InstallOnly` to reuse this pipeline's already-built package.

The coordinator freezes source once, builds both machines in parallel, and records per-stage logs/timings. Keep its persistent pnpm/Cargo/runtime caches. Use the default local mode for local installs; `-Release` is the explicit full-optimization option. Do not repeatedly build to chase edits from another session.

Host and app idle gates are separate. Never treat a failed database read as zero active sessions, kill active work to speed an update, or claim that a scheduled install is completed. Read `-Status` and the recorded artifacts before reporting success. Keep existing host services, databases, credentials, and rollback files intact. Do not expose auth state/signing keys or infer public-release/commit/push authority from a local update request.

Honor requests to stop before building: validate the scripts/tests/plan and report that real build/installation remains unverified. On Windows, all shell tool calls use `tty=true`; helpers and child commands stay hidden.

Use the packageManager-pinned pnpm 12 version. Never run npm ci for local updates. Reuse existing node_modules unless package.json changed; missing node_modules requires an initial pnpm install. ForceBuild does not force dependency installation.
