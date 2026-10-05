# Automatic corrections for unattended tasks

Goal and steward tasks get up to three automatic correction runs after a concrete
review failure or a check command returning a nonzero exit code. Manual tasks keep
their existing explicit Retry behavior. Each correction uses a fresh worker session
in the existing task worktree, with the original prompt and bounded verification
feedback. The original checks and reviewer run again before delivery.

A required review note may explicitly specify `category: "external"` plus an
actionable suggestion naming missing device/access and the check required. If all
current required findings are external, correction stops immediately, without
claiming acceptance or releasing dependencies. Mixed reviews still repair code.
Legacy prose is never guessed to be external. Identical required findings after a
correction stop further automatic retries as unchanged; moved source line numbers
do not count as a new finding. Existing location-only duplicates are coalesced with
their review links and conservative open/unread state retained.
In the same JSON block reviewers may provide `resolvedNoteIds` for earlier required
findings they actually verified fixed, even when another issue keeps the verdict
at FAIL. Merely omitting an old finding does not resolve it; a recurring finding
reopens it. This keeps obsolete defects from hiding the current acceptance blocker.

The detail panel records up to 20 review outcomes, each with worker-reported summary,
review verdict and worker/reviewer links. Old tasks cannot reconstruct missing run
history; their latest review remains available. Stop reasons distinguish external
verification, unchanged findings and exhausted attempts. Marking a note fixed does
not remove these verification requirements.

Hosts advertising `tasks.review-recheck` support `tasks.review.recheck`. The owner
can use **Recheck review** on blocked work with an existing failed review: checks
and the reviewer run against existing work, without launching a worker. A failed
recheck stays blocked; PASS uses the normal delivery/merge gates. Retry remains the
explicit action for a new worker correction after supplying access or changing the
approach. Independent queued tasks continue; dependent tasks wait for delivery.

Correction counts are stored with the task and survive host restarts. The board
shows the attempt number and the latest finding. After three corrections, another
failure leaves the task blocked with its verification details; an explicit Retry
resets this allowance. Concurrency, daily usage limits and dependencies still apply.
Independent queued work can continue; dependents wait until the prerequisite is done.

Worker/runtime failures, owner stops, reviewer failures or missing verdicts, and
check timeouts or commands that cannot start remain blocked. Reviews distinguish
implementation defects from unavailable device/release/service acceptance checks,
while still requiring any evidence explicitly requested by the task.

For existing running or blocked goals, legacy review failures can recover once.
Recovery requires a matching successful reviewer session and its explicit FAIL
verdict. Cancelled goals, owner-stopped tasks, missing sessions and exhausted
correction attempts are not revived. Installing this host change is required for
the policy to affect tasks on that machine.

## Persistent review notes

Reviewers can return a `reviewNotes` JSON array before their verdict. Each entry
contains a `finding`, optional `suggestion`, and `kind` (`finding` or `suggestion`).
The host stores notes on the task before retrying it. Legacy FAIL reviews become
a summary note with their supporting review text when that session is available;
the latest trusted automatic-correction summary can also be retained without a
session. Missing or failed reviewer evidence is not invented as a code finding.

Cards and the board show unread counts. The detail panel offers Mark as read,
Mark fixed, Reopen note, and links to source review sessions. Read updates name
the displayed note IDs, leaving newer findings unread. These states live on the
host and survive retries, refreshes and host restarts. Older hosts remain usable
without note controls; updated hosts advertise `tasks.notes`.

Repeated findings with matching wording (ignoring case and whitespace) retain
their ID and source-session history. Reviewers are asked to reuse earlier wording.
A fixed finding that returns is reopened and unread. Open notes are included in
worker/reviewer prompts; optional suggestions are labelled as optional. PASS
closes existing required findings while retaining optional suggestions. Changing
a note's state never marks a task done, merges a branch or bypasses verification.
