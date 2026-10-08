# Language support validation — 2026-10-09

Implemented eight UI languages: Turkish, English, German, French, Spanish,
Portuguese, Simplified Chinese and Japanese. The selector is under General
settings, uses the system language by default, persists explicit choices and
synchronizes windows. Locale subscriptions preserve mounted sessions and drafts.

Validation completed:

- All eight catalogs passed source/coverage/placeholder checks: 3,114 messages.
- `pnpm exec tsc --noEmit` passed after the final UI changes.
- Seven focused test files passed 226 tests covering settings, language changes,
  source control, file tree behavior and activity/quit labels.
- Final title-bar, usage-chip, subagent-sheet and language checks passed 36 tests
  (the five language tests overlap the earlier focused run).
- Chromium passed both localization scenarios: all eight languages retain the
  edited draft; Turkish survives reload and supports settings search; Japanese
  fits a 460-pixel viewport without horizontal page overflow.
- Windows Rust native-language unit test passed. Existing checkpoint dead-code
  warnings remained; macOS-only menu code was not compiled on this machine.
- Diff whitespace checks passed.

Browser screenshots were inspected at
`.scratch/localization-turkish.png` and
`.scratch/localization-japanese-narrow.png`. They show the localization fixture
using the real settings navigation, language selector and settings search; they
are not screenshots of an installed desktop build.

The broad source run reported 6,980 passing, 20 failing and 15 skipped tests.
Its file-tree date expectation was updated to the selected application locale
and passed in the focused rerun. Other failures remain outside this delivery.
Original HEAD source copies in an isolated test configuration reproduced the
updater's two failures and the command-picker, live-agent-preview and empty-session
failures. Other failures concern remote-host identity/method availability,
notification flow, native glass expectations and Inbox layout. The entire source
suite is therefore not claimed green. JSON reports are preserved in `.scratch/`
as `i18n-vitest.json`, `i18n-focused.json`, `i18n-final-focused.json`,
`i18n-baseline-results.json`, `i18n-empty-baseline.json`, and `i18n-browser.log`.

No application package/install, macOS acceptance, commit, push or publication was
performed. Native tray/menu behavior still needs installed-platform validation.
The catalogs contain machine translations with selected Turkish editorial
overrides; wider linguistic review remains a public-release acceptance task.
