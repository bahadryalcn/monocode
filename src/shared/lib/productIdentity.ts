/**
 * Frontend brand defaults for imc code.
 * Native product names still resolve through appName(); package identifiers,
 * storage keys, host services and update channels are deliberately configured
 * separately so changing presentation cannot redirect existing user data.
 * Keep this module dependency-free for the startup recovery screen.
 */
export const PRODUCT_IDENTITY = Object.freeze({
  displayName: "imc code",
  logoSrc: "/brand/imece-mark.png",
  repositoryUrl: null as string | null,
  /** Optional GitHub release page; bundled notes remain available offline. */
  releaseNotesUrl: null as string | null,
  updaterEnabled: false as boolean,
});
