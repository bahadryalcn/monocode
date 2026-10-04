# Host conversation refresh

## Scope

Add **Refresh from host** beside the adopted-session running/conflict notices.
Fetch a full host snapshot and apply its transcript and running state without
sending or stopping a host turn. Keep the same local session id, project and
composer instance so unsent text and attachments remain intact.

## Implementation

1. Serialize explicit refreshes with the existing adopted-session poller and
   deduplicate repeated requests for the same session.
2. Reuse the existing merge rules. If transcripts diverge, persist a separate
   conversation titled `<title> (local copy)` before replacing the open transcript.
   Give the copy a new id and omit provider conversation identity, automation and
   queued sends so opening it cannot resume the original host thread implicitly.
3. Refuse replacement if the local session changes or starts a turn during the
   fetch or backup write. A failed backup leaves the open conversation untouched.
4. Expose loading, success, saved-copy location and retryable error states in a
   responsive notice. Refreshing does not remount the composer.

## Acceptance

- A refresh fetches the latest full transcript even at an unchanged revision.
- Host work keeps running and its status is reflected in the notice.
- A divergent local transcript is saved before replacement and appears in project
  history; failure or concurrent local edits never overwrite it.
- Repeat clicks do not overlap polling or create duplicate backup requests.
- Unsent composer text and attachments remain attached to the original session.
- Focused model, hook and notice tests plus TypeScript/build validation pass.
- A real two-computer host test remains required for live network/native acceptance.
