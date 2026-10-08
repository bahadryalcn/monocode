import { getName } from "@tauri-apps/api/app";
import { PRODUCT_IDENTITY } from "./productIdentity";

export const FALLBACK_APP_NAME: string = PRODUCT_IDENTITY.displayName;

let cachedName = FALLBACK_APP_NAME;

// Native builds may have distinct product names. Warm the cache once at
// startup; callers that cannot await read it through appName().
const resolved: Promise<string> = (async () => {
  try {
    const name = (await getName()).trim();
    // Native package metadata stays compatible until the installer migration.
    // Adapt only known legacy product names; custom runtime names remain intact.
    if (name === "MonoCode" || name === "Imece" || name === "imc") cachedName = PRODUCT_IDENTITY.displayName;
    else if (name === "MonoCode Dev" || name === "Imece Dev" || name === "imc Dev") cachedName = `${PRODUCT_IDENTITY.displayName} Dev`;
    else if (name === "MonoCode Fork" || name === "imc Fork") cachedName = `${PRODUCT_IDENTITY.displayName} Fork`;
    else if (name) cachedName = name;
  } catch {
    // Outside Tauri (tests, browser preview) the fallback stays.
  }
  return cachedName;
})();

/** Runtime product name, using the frontend brand default until known. */
export function appName(): string {
  return cachedName;
}

/** Resolves once the runtime lookup has settled. */
export function loadAppName(): Promise<string> {
  return resolved;
}
