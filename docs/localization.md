# Application languages

The UI supports Turkish, English, German, French, Spanish, Portuguese,
Simplified Chinese and Japanese. Settings → General → Application language
changes the language immediately. The default follows the system's preferred
supported language, falling back to English. Regional variants use the matching
catalog (for example, `tr-TR`, `pt-BR`, and `zh-Hans`).

The preference is stored under `monocode.language` and synchronizes between
windows, including the quick composer. Language changes preserve mounted
sessions, terminal processes and composer drafts. A new language is activated
only after its bundled catalog loads; a failed load leaves the current language
available for retry. Application-owned Windows tray and macOS menu labels are
updated through `native_language_set`. macOS keybinding menu rebuilds reapply
the selected translations.

## Writing UI copy

Use `t("English source message")` for application-owned copy and `useLocale()`
in components that display it. Keep full sentences together. Interpolate
values through named slots: `t("Ask · {p0}", { p0: projectName })`. Values are
inserted once, kept verbatim, and rendered through React's normal escaping.
Use complete singular/plural messages rather than appending English suffixes.
Read `getLocale()` for Intl number/date formatting and include the locale in
memo dependencies when memoizing translated output.

Module-level UI option metadata uses getters so a selected language is not
frozen during module evaluation. Settings search accepts both the translated
labels and their English source labels. Identifiers, enum values, paths,
commands, code examples, project/session names, user messages, generated agent
answers, release-note bodies and raw provider errors retain their original
content. Operating-system dialogs use the OS language.

## Catalog maintenance and checks

- `node scripts/check-locales.mjs --extract` adds newly referenced source copy.
- `python scripts/translate-ui.py` explicitly refreshes missing translations
  of public UI copy through Google's machine-translation endpoint. This is a
  development helper, requires network access, and is never run by the app.
  It keeps interpolation slots and resumes existing catalogs. No user data or
  credentials are included. The endpoint is not a supported production API.
- Turkish editorial corrections live in `src/shared/i18n/tr-overrides.json` and
  are applied by that helper after generation. Other catalogs, and Turkish
  copy outside those overrides, are machine translations requiring editorial
  review before a public release.
- `node scripts/check-locales.mjs` validates source coverage, complete catalogs,
  nonempty translations and matching interpolation slots.
- `pnpm test src/shared/i18n/i18n.test.ts` checks persistence, system-language
  selection, window synchronization, interpolation, formatting and input state.
- `pnpm exec playwright test tests/browser/localization.spec.ts --project=chromium`
  checks the actual selector in all languages, Turkish search and narrow CJK UI.

The `localize-ui*.mjs` scripts document the initial syntax-aware migration. They
are not build steps. Do not run a migration over new UI without reviewing its
diff; add explicit translations when authoring components.

Source and browser validation do not establish installed desktop or macOS
acceptance. Use the documented local-update coordinator for a later authorized
build/install, then check native menu/tray labels on those machines.
