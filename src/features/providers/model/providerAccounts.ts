import { pathKey } from "../../../shared/lib/paths";
import type { HarnessId } from "../../sessions/model/session";

const LEGACY_ACCOUNTS_KEY = "monocode.providerAccounts.v1";
const ACCOUNTS_KEY = "monocode.providerAccounts.v2";
const SELECTIONS_KEY = "monocode.providerAccountSelections.v1";
const CHANGE_EVENT = "monocode-provider-accounts-changed";

export const DEFAULT_PROVIDER_ACCOUNT_ID = "default";
const DEFAULT_PROVIDER_ACCOUNT_LABEL = "Default account";

/** Legacy sessions predate persisted account ids and belong to the default profile. */
export function sameProviderAccountId(
  left: string | undefined,
  right: string | undefined,
): boolean {
  return (
    (left ?? DEFAULT_PROVIDER_ACCOUNT_ID) ===
    (right ?? DEFAULT_PROVIDER_ACCOUNT_ID)
  );
}

/** Providers whose CLIs support isolated, locally named account profiles. */
export const PROVIDER_ACCOUNT_PROVIDERS = [
  "claude",
  "codex",
] as const satisfies readonly HarnessId[];

export type ProviderAccountProvider =
  (typeof PROVIDER_ACCOUNT_PROVIDERS)[number];

export function supportsProviderAccounts(
  provider: HarnessId,
): provider is ProviderAccountProvider {
  return PROVIDER_ACCOUNT_PROVIDERS.some((candidate) => candidate === provider);
}

export type ProviderAccount = {
  id: string;
  provider: ProviderAccountProvider;
  label: string;
  isDefault?: boolean;
};

type StoredAccounts = Partial<
  Record<ProviderAccountProvider, ProviderAccount[]>
>;
type StoredSelections = Record<
  string,
  Partial<Record<ProviderAccountProvider, string>>
>;

export function providerAccounts(
  provider: ProviderAccountProvider,
): ProviderAccount[] {
  const managed = readRecord<StoredAccounts>(ACCOUNTS_KEY);
  const stored = readRecord<StoredAccounts>(LEGACY_ACCOUNTS_KEY);
  const authoritative = Array.isArray(managed[provider]);
  const seen = new Set<string>();
  if (authoritative) stored[provider] = managed[provider];
  const accounts = Array.isArray(stored[provider]) ? stored[provider] : [];
  let defaultLabel = DEFAULT_PROVIDER_ACCOUNT_LABEL;
  let foundDefault = false;
  const profiles = accounts.flatMap((account) => {
    const id = validAccountId(account?.id) ? account.id : "";
    const label = cleanLabel(account?.label);
    if (!authoritative && id === DEFAULT_PROVIDER_ACCOUNT_ID) {
      if (label && !foundDefault) {
        defaultLabel = label;
        foundDefault = true;
      }
      return [];
    }
    if (!id || !label || seen.has(id)) {
      return [];
    }
    seen.add(id);
    return [
      {
        id,
        provider,
        label,
        ...(authoritative && account.isDefault ? { isDefault: true } : {}),
      },
    ];
  });
  if (authoritative) {
    const defaultId =
      profiles.find((account) => account.isDefault)?.id ?? profiles[0]?.id;
    return profiles.map(({ isDefault: _default, ...account }) =>
      account.id === defaultId ? { ...account, isDefault: true } : account,
    );
  }
  return [
    {
      id: DEFAULT_PROVIDER_ACCOUNT_ID,
      provider,
      label: defaultLabel,
      isDefault: true,
    },
    ...profiles,
  ];
}

export function newProviderAccount(
  provider: ProviderAccountProvider,
  label: string,
): ProviderAccount {
  return {
    id: `account-${crypto.randomUUID()}`,
    provider,
    label:
      cleanLabel(label) || `Account ${providerAccounts(provider).length + 1}`,
  };
}

export function saveProviderAccount(account: ProviderAccount): void {
  if (
    account.id === DEFAULT_PROVIDER_ACCOUNT_ID ||
    !validAccountId(account.id)
  ) {
    return;
  }
  const label = cleanLabel(account.label);
  if (!label) return;
  const stored = readRecord<StoredAccounts>(ACCOUNTS_KEY);
  const accounts = providerAccounts(account.provider);
  const next = accounts.filter((entry) => entry.id !== account.id);
  stored[account.provider] = serializeProviderAccounts([
    ...next,
    {
      id: account.id,
      provider: account.provider,
      label,
      ...(next.length === 0 ||
      accounts.find((entry) => entry.id === account.id)?.isDefault
        ? { isDefault: true }
        : {}),
    },
  ]);
  writeJson(ACCOUNTS_KEY, stored);
  announceChange();
}

export function renameProviderAccount(
  provider: ProviderAccountProvider,
  accountId: string,
  label: string,
): ProviderAccount | null {
  if (!validAccountId(accountId)) return null;
  const nextLabel = cleanLabel(label);
  if (!nextLabel) return null;
  const accounts = providerAccounts(provider);
  const target = accounts.find((account) => account.id === accountId);
  if (!target) return null;
  const renamed = { ...target, label: nextLabel };
  const stored = readRecord<StoredAccounts>(ACCOUNTS_KEY);
  stored[provider] = serializeProviderAccounts(
    accounts.map((account) => (account.id === accountId ? renamed : account)),
  );
  writeJson(ACCOUNTS_KEY, stored);
  announceChange();
  return renamed;
}

/** Remove account metadata after native credential cleanup has succeeded. */
export function removeProviderAccount(
  provider: ProviderAccountProvider,
  accountId: string,
): boolean {
  if (!validAccountId(accountId)) {
    return false;
  }
  const accounts = providerAccounts(provider);
  if (!accounts.some((account) => account.id === accountId)) return false;
  const stored = readRecord<StoredAccounts>(ACCOUNTS_KEY);
  stored[provider] = serializeProviderAccounts(
    accounts.filter((account) => account.id !== accountId),
  );
  writeJson(ACCOUNTS_KEY, stored);

  const selections = readRecord<StoredSelections>(SELECTIONS_KEY);
  for (const [key, selection] of Object.entries(selections)) {
    if (!isRecord(selection) || selection[provider] !== accountId) continue;
    const nextSelection = { ...selection };
    delete nextSelection[provider];
    if (Object.keys(nextSelection).length === 0) delete selections[key];
    else selections[key] = nextSelection;
  }
  writeJson(SELECTIONS_KEY, selections);
  announceChange();
  return true;
}

function serializeProviderAccounts(
  accounts: ProviderAccount[],
): ProviderAccount[] {
  return accounts.flatMap((account) => {
    const label = cleanLabel(account.label);
    if (!label) return [];
    return [
      {
        id: account.id,
        provider: account.provider,
        label,
        ...(account.isDefault ? { isDefault: true } : {}),
      },
    ];
  });
}

/** Change the fallback for new sessions without moving credentials or existing selections. */
export function setDefaultProviderAccount(
  provider: ProviderAccountProvider,
  accountId: string,
): void {
  const accounts = providerAccounts(provider);
  if (!accounts.some((account) => account.id === accountId))
    throw new Error("Account no longer exists");
  const stored = readRecord<StoredAccounts>(ACCOUNTS_KEY);
  stored[provider] = serializeProviderAccounts(
    accounts.map(({ isDefault: _default, ...account }) =>
      account.id === accountId ? { ...account, isDefault: true } : account,
    ),
  );
  writeJson(ACCOUNTS_KEY, stored);
  announceChange();
}

export function providerAccountExists(
  provider: ProviderAccountProvider,
  accountId: string | undefined,
): boolean {
  return providerAccounts(provider).some(
    (account) => account.id === (accountId ?? DEFAULT_PROVIDER_ACCOUNT_ID),
  );
}

export function selectedProviderAccountId(
  provider: ProviderAccountProvider,
  project: string | undefined,
): string {
  const selections = readRecord<StoredSelections>(SELECTIONS_KEY);
  const id = selections[selectionKey(project)]?.[provider];
  return providerAccounts(provider).some((account) => account.id === id)
    ? id!
    : (providerAccounts(provider).find((account) => account.isDefault)?.id ??
        DEFAULT_PROVIDER_ACCOUNT_ID);
}

export function selectProviderAccount(
  provider: ProviderAccountProvider,
  project: string | undefined,
  accountId: string,
): void {
  if (!providerAccounts(provider).some((account) => account.id === accountId)) {
    return;
  }
  const selections = readRecord<StoredSelections>(SELECTIONS_KEY);
  const key = selectionKey(project);
  selections[key] = { ...selections[key], [provider]: accountId };
  writeJson(SELECTIONS_KEY, selections);
  announceChange();
}

export function providerAccountLabel(
  provider: ProviderAccountProvider,
  accountId: string | undefined,
): string {
  return (
    providerAccounts(provider).find(
      (account) => account.id === (accountId ?? DEFAULT_PROVIDER_ACCOUNT_ID),
    )?.label ??
    (accountId && accountId !== DEFAULT_PROVIDER_ACCOUNT_ID
      ? "Removed account"
      : "Default account")
  );
}

export function subscribeProviderAccounts(listener: () => void): () => void {
  const local = () => listener();
  const storage = (event: StorageEvent) => {
    if (
      event.key === null ||
      event.key === ACCOUNTS_KEY ||
      event.key === LEGACY_ACCOUNTS_KEY ||
      event.key === SELECTIONS_KEY
    )
      listener();
  };
  window.addEventListener(CHANGE_EVENT, local);
  window.addEventListener("storage", storage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, local);
    window.removeEventListener("storage", storage);
  };
}

function selectionKey(project: string | undefined): string {
  return pathKey(project?.trim() || "~");
}

function cleanLabel(value: unknown): string {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, 48)
    : "";
}

function validAccountId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 80 &&
    /^[A-Za-z0-9_-]+$/.test(value)
  );
}

function readRecord<T>(key: string): T {
  const value = readJson<unknown>(key, {});
  return isRecord(value) ? (value as T) : ({} as T);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}

function announceChange(): void {
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
