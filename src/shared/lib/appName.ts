import { getName } from "@tauri-apps/api/app";

export const FALLBACK_APP_NAME = "MonoCode";

let cachedName = FALLBACK_APP_NAME;

// The product name differs between the official ("MonoCode"), fork
// ("MonoCode Fork") and dev ("MonoCode Dev") builds. Warm the cache once at
// startup; callers that cannot await read it through appName().
const resolved: Promise<string> = (async () => {
  try {
    const name = (await getName()).trim();
    if (name) cachedName = name;
  } catch {
    // Outside Tauri (tests, browser preview) the fallback stays.
  }
  return cachedName;
})();

/** Product name, resolved at runtime. Falls back to "MonoCode" until known. */
export function appName(): string {
  return cachedName;
}

/** Resolves once the runtime lookup has settled. */
export function loadAppName(): Promise<string> {
  return resolved;
}
