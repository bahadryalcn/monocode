# Host-owned pull request tracking

Open a GitHub pull request in Inbox, start or select a related host session, and use **Host PR tracking → Link PR**. The tools drawer can also mount `PrDeliveryTools` with session/task choices and a PR URL input. Several PRs can link to the same session/task. Links persist in the existing host SQLite database, independent of desktop lifetime. Existing `gh` login/credential helpers are reused.

Linking defaults to observation only. Explicitly enabling automatic wakeups lets new failed checks, submitted reviews or conflicts send a bounded follow-up to the linked target. The first read establishes a baseline. Unchanged evidence does not wake again. The host stops after three automatic wakeups or three consecutive read/wake failures. Resume is an explicit owner action that renews that budget. Closed/merged PRs stop polling. A busy target retains a durable pending event for later.

## Integration contract

`HostPrWatches(store, { wake })` owns persistence and a sequential minute timer; call `start`, `stop` and `idle` alongside other host services. Advertise `delivery.pr` and register:

| Method | Arguments | Result |
| --- | --- | --- |
| `delivery.pr.list` | `{projectId}` | `manager.list(projectId)` |
| `delivery.pr.link` | `{input: PrWatchInput}` | `manager.link(input)` |
| `delivery.pr.remove` | `{projectId,id}` | `manager.remove(id)` |
| `delivery.pr.resume` | `{projectId,id}` | `manager.resume(id)` |
| `delivery.pr.pause` | `{projectId,id}` | `manager.pause(id)` |
| `delivery.pr.check` | `{projectId,id}` | await `manager.check(id)` |

Every handler must authorize the project and check that a watch belongs to it. The manager separately validates session/task project ownership. The wake hook must deduplicate using the supplied stable `eventId` through the existing host receipt mechanism. This protects the crash interval between enqueueing the follow-up and persisting its acknowledgement. Return false while a session is running, has pending input/approval, is desktop-owned, or a task cannot safely accept a follow-up. Never blindly rerun a completed task or merge/push on an external CI event. A task follow-up should use the existing bounded task-repair lifecycle.

## Scope and acceptance

Current delivery supports public GitHub-hosted PR identifiers, existing `gh` auth, checks, submitted reviews and merge conflicts. GitLab/Azure DevOps watchers and cloud credentials are outside this implementation. Authenticated host RPC integration and engine receipts are required before enabling the feature. Regression tests cover persistence, evidence dedupe, busy retries, finite budgets, failure redaction, owner actions during reads and merged PR settlement; final root validation has not run at worker handoff. No real GitHub/network or installed host acceptance is claimed.
