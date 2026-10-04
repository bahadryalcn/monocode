import {
  loadProjectProviderSettings,
  normalizeProviderDefaults,
  type ProviderSessionDefaults,
} from "./projectProviders";
import type { HarnessId } from "./session";

const KEY = "monocode.providerSessionDefaults.v1";
const CHANGE = "monocode:provider-session-defaults";

export function loadGlobalSessionDefaults(): Partial<
  Record<HarnessId, ProviderSessionDefaults>
> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const out: Partial<Record<HarnessId, ProviderSessionDefaults>> = {};
    for (const [harness, entry] of Object.entries(value)) {
      if (entry && typeof entry === "object" && !Array.isArray(entry)) {
        out[harness as HarnessId] = normalizeProviderDefaults(entry);
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function providerSessionDefaults(
  harness: HarnessId,
  cwd?: string,
): ProviderSessionDefaults {
  return {
    ...loadGlobalSessionDefaults()[harness],
    ...loadProjectProviderSettings(cwd).defaults?.[harness],
  };
}

export function saveGlobalSessionDefaults(
  harness: HarnessId,
  defaults: ProviderSessionDefaults,
): void {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        ...loadGlobalSessionDefaults(),
        [harness]: normalizeProviderDefaults(defaults),
      }),
    );
  } catch {
    // Private mode / quota.
  }
  window.dispatchEvent(new CustomEvent(CHANGE));
}

export function subscribeProviderSessionDefaults(
  listener: () => void,
): () => void {
  const storage = (event: StorageEvent) => {
    if (event.key === KEY || event.key === null) listener();
  };
  window.addEventListener(CHANGE, listener);
  window.addEventListener("storage", storage);
  return () => {
    window.removeEventListener(CHANGE, listener);
    window.removeEventListener("storage", storage);
  };
}

export function providerSessionDefaultsSnapshot(): string {
  return JSON.stringify(loadGlobalSessionDefaults());
}
