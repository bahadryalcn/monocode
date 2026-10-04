import { ask } from "@tauri-apps/plugin-dialog";
import { Loader, Pencil, Plus, Trash2 } from "../../../shared/ui/icons";
import { useEffect, useState, type FormEvent } from "react";
import { HarnessIcon } from "../../sessions/ui/HarnessIcon";

import { loginHarness } from "../../../integrations/harness/core/auth";

import { HARNESS_TITLE } from "../../sessions/model/session";

import {
  newProviderAccount,
  providerAccounts,
  PROVIDER_ACCOUNT_PROVIDERS,
  removeProviderAccount,
  renameProviderAccount,
  saveProviderAccount,
  subscribeProviderAccounts,
  type ProviderAccount,
  type ProviderAccountProvider,
} from "../../providers/model/providerAccounts";
import { removeProviderAccountCredentials } from "../../providers/model/providerAccountCredentials";
import {
  identityKey,
  identityOrganizationTag,
  useProviderAccountIdentities,
} from "../../providers/model/providerAccountIdentity";
import { ProviderAccountSubtitle } from "../../providers/ui/ProviderAccountSubtitle";

import {
  accountStatus,
  accountUsageKey,
  needsProviderLogin,
  useProviderAccountUsage,
} from "../../providers/model/accountUsage";
import type { ProviderRateLimits } from "../../providers/model/rateLimits";
import {
  clearCachedRateLimits,
  loadRateLimits,
} from "../../providers/model/rateLimitsCache";
import {
  AccountStatusLabel,
  AccountUsageMeters,
  AccountUsageRefresh,
} from "../../providers/ui/ProviderAccountUsage";

import { Group } from "./settingsControls";

export type AccountEditor = {
  provider: ProviderAccountProvider;
  accountId?: string;
  label: string;
};

export function ProviderAccountsSettings() {
  const [version, setVersion] = useState(0);
  const [editor, setEditor] = useState<AccountEditor | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () => subscribeProviderAccounts(() => setVersion((value) => value + 1)),
    [],
  );

  const startAdd = (provider: ProviderAccountProvider) => {
    setError(null);
    setEditor({ provider, label: "" });
  };

  const startRename = (account: ProviderAccount) => {
    setError(null);
    setEditor({
      provider: account.provider,
      accountId: account.id,
      label: account.label,
    });
  };

  const submitEditor = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editor || !editor.label.trim() || working) return;
    const key = editor.accountId
      ? `rename:${editor.provider}:${editor.accountId}`
      : `add:${editor.provider}`;
    setWorking(key);
    setError(null);
    try {
      if (editor.accountId) {
        renameProviderAccount(editor.provider, editor.accountId, editor.label);
      } else {
        const account = newProviderAccount(editor.provider, editor.label);
        await loginHarness(editor.provider, account.id);
        saveProviderAccount(account);
      }
      setEditor(null);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not save this account",
      );
    } finally {
      setWorking(null);
    }
  };

  const signInAccount = async (account: ProviderAccount) => {
    if (working) return;
    setWorking(`signin:${account.provider}:${account.id}`);
    setError(null);
    try {
      await (account.isDefault
        ? loginHarness(account.provider)
        : loginHarness(account.provider, account.id));
      const limits = await loadRateLimits(account.provider, account.id, true);
      if (limits.status === "error" || needsProviderLogin(limits)) {
        throw new Error(
          limits.error ||
            `${HARNESS_TITLE[account.provider]} sign-in could not be verified`,
        );
      }
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not complete sign-in",
      );
    } finally {
      setWorking(null);
    }
  };

  const removeAccount = async (account: ProviderAccount) => {
    if (account.isDefault || working) return;
    const confirmed = await ask(
      `Remove “${account.label}”? Its stored credentials will be deleted and any running turns for this account will stop. Existing conversations stay in history, but cannot continue until you switch accounts.`,
      {
        title: `Remove ${HARNESS_TITLE[account.provider]} account`,
        kind: "warning",
        okLabel: "Remove account",
        cancelLabel: "Cancel",
      },
    );
    if (!confirmed) return;
    const key = `remove:${account.provider}:${account.id}`;
    setWorking(key);
    setError(null);
    try {
      await removeProviderAccountCredentials(account.provider, account.id);
      removeProviderAccount(account.provider, account.id);
      clearCachedRateLimits(account.provider, account.id);
      if (
        editor?.provider === account.provider &&
        editor.accountId === account.id
      ) {
        setEditor(null);
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not remove this account",
      );
    } finally {
      setWorking(null);
    }
  };

  const identities = useProviderAccountIdentities(
    PROVIDER_ACCOUNT_PROVIDERS.flatMap(providerAccounts),
    version,
  );
  const usage = useProviderAccountUsage(version);

  return (
    <Group
      id="provider-accounts"
      title="Accounts"
      description="Separate sign-ins per provider. Switch accounts from the usage control in the footer."
      action={<AccountUsageRefresh usage={usage} />}
    >
      <div className="max-h-[460px] overflow-y-auto">
        {PROVIDER_ACCOUNT_PROVIDERS.map((provider) => {
          const accounts = providerAccounts(provider);
          const adding = editor?.provider === provider && !editor.accountId;
          return (
            <div
              key={provider}
              className="border-b border-content/5 last:border-b-0"
            >
              <div className="flex items-center gap-4 px-4 py-3.5">
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                  <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-content/[0.05] ring-1 ring-inset ring-content/[0.06]">
                    <HarnessIcon harness={provider} className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-content">
                      {HARNESS_TITLE[provider]}
                    </div>
                    <div className="mt-0.5 text-[11px] text-content/40">
                      {accounts.length}{" "}
                      {accounts.length === 1 ? "account" : "accounts"}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={Boolean(working)}
                  onClick={() => startAdd(provider)}
                  className="flex shrink-0 items-center gap-1.5 rounded-md border border-content/10 px-2.5 py-1 text-[12px] text-content/70 transition-transform duration-150 hover:bg-content/10 hover:text-content active:scale-[0.97] disabled:cursor-default disabled:opacity-40"
                >
                  <Plus className="size-3.5" strokeWidth={1.75} aria-hidden />
                  Add account
                </button>
              </div>
              <div className="border-t border-content/5 bg-content/[0.015] pl-10">
                {accounts.map((account) => {
                  const editing =
                    editor?.provider === provider &&
                    editor.accountId === account.id;
                  const removing =
                    working === `remove:${provider}:${account.id}`;
                  const signingIn =
                    working === `signin:${provider}:${account.id}`;
                  const identity = identities[identityKey(account)];
                  const orgTag = identityOrganizationTag(identity);
                  const limits = usage.usage[accountUsageKey(account)];
                  return editing ? (
                    <ProviderAccountEditor
                      key={account.id}
                      editor={editor}
                      working={Boolean(working)}
                      onLabel={(label) =>
                        setEditor((current) =>
                          current ? { ...current, label } : current,
                        )
                      }
                      onCancel={() => setEditor(null)}
                      onSubmit={submitEditor}
                    />
                  ) : (
                    <div
                      key={account.id}
                      className="flex h-12 items-center gap-3 border-b border-content/5 px-4 py-2 last:border-b-0"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate text-[12px] text-content/85">
                            {account.label}
                          </span>
                          {orgTag ? (
                            <span className="max-w-[8rem] shrink-0 truncate rounded bg-content/[0.07] px-1 text-[9px] leading-4 text-content/50">
                              {orgTag}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-0.5 flex min-w-0 items-center gap-2.5 text-[10px]">
                          <AccountStatusLabel
                            status={accountStatus(limits, usage.now)}
                            className="shrink-0"
                          />
                          <ProviderAccountSubtitle
                            identity={identity}
                            fallback={
                              account.isDefault
                                ? "Provider CLI profile"
                                : "Isolated profile"
                            }
                            className="truncate text-content/30"
                          />
                        </div>
                      </div>
                      <AccountUsageMeters limits={limits} now={usage.now} />
                      <div className="flex min-w-24 shrink-0 items-center justify-end gap-1">
                        {signingIn || (limits && canSignIn(limits)) ? (
                          <button
                            type="button"
                            disabled={Boolean(working)}
                            aria-label={`Sign in to ${account.label}`}
                            onClick={() => void signInAccount(account)}
                            className="mr-1 flex h-6 shrink-0 items-center gap-1.5 rounded-md border border-content/10 px-2 text-[11px] text-content/70 transition-transform duration-150 hover:bg-content/10 hover:text-content active:scale-[0.97] disabled:cursor-default disabled:opacity-40"
                          >
                            {signingIn ? (
                              <Loader
                                className="size-3 animate-spin"
                                aria-hidden
                              />
                            ) : null}
                            {signingIn ? "Signing in…" : "Sign in"}
                          </button>
                        ) : null}
                        {account.isDefault ? (
                          <span className="mr-1 text-[10px] font-medium uppercase tracking-wide text-content/30">
                            Default
                          </span>
                        ) : null}
                        <button
                          type="button"
                          disabled={Boolean(working)}
                          aria-label={`Rename ${account.label}`}
                          title="Rename account"
                          onClick={() => startRename(account)}
                          className="grid size-7 place-items-center rounded-md text-content/40 transition-transform duration-150 hover:bg-content/10 hover:text-content active:scale-[0.96] disabled:opacity-35"
                        >
                          <Pencil className="size-3.5" strokeWidth={1.75} />
                        </button>
                        {!account.isDefault ? (
                          <button
                            type="button"
                            disabled={Boolean(working)}
                            aria-label={`Remove ${account.label}`}
                            title="Remove account"
                            onClick={() => void removeAccount(account)}
                            className="grid size-7 place-items-center rounded-md text-content/35 transition-transform duration-150 hover:bg-red-400/10 hover:text-red-400 active:scale-[0.96] disabled:opacity-35"
                          >
                            {removing ? (
                              <Loader className="size-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="size-3.5" strokeWidth={1.75} />
                            )}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
                {adding && editor ? (
                  <ProviderAccountEditor
                    editor={editor}
                    working={Boolean(working)}
                    onLabel={(label) =>
                      setEditor((current) =>
                        current ? { ...current, label } : current,
                      )
                    }
                    onCancel={() => setEditor(null)}
                    onSubmit={submitEditor}
                  />
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      {error ? (
        <p
          className="border-t border-content/5 px-4 py-2.5 text-[11px] leading-4 text-red-400"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </Group>
  );
}

/** Sign-in can fix this account; a missing CLI needs an install first. */
export function canSignIn(limits: ProviderRateLimits): boolean {
  return (
    needsProviderLogin(limits) &&
    !limits.error?.toLowerCase().includes("cli not found")
  );
}

export function ProviderAccountEditor({
  editor,
  working,
  onLabel,
  onCancel,
  onSubmit,
}: {
  editor: AccountEditor;
  working: boolean;
  onLabel: (label: string) => void;
  onCancel: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const adding = !editor.accountId;
  return (
    <form
      className="flex h-12 items-center border-b border-content/5 px-4 py-2 last:border-b-0"
      onSubmit={onSubmit}
    >
      <div
        data-provider-account-editor-field
        className="flex items-center pr-1 h-8 min-w-0 flex-1 overflow-hidden rounded-md border border-content/10 bg-content/[0.04] focus-within:border-accent/45"
      >
        <label className="h-full min-w-0 flex-1">
          <span className="sr-only">Account name</span>
          <input
            autoFocus
            type="text"
            maxLength={48}
            value={editor.label}
            disabled={working}
            placeholder="Work or Personal"
            aria-label={`${adding ? "New" : "Rename"} ${HARNESS_TITLE[editor.provider]} account`}
            onChange={(event) => onLabel(event.target.value)}
            className="h-full w-full bg-transparent px-2.5 text-[12px] text-content outline-none placeholder:text-content/25 disabled:opacity-50"
          />
        </label>
        <button
          type="button"
          disabled={working}
          onClick={onCancel}
          className="flex h-6 shrink-0 items-center rounded-[4.5px] bg-content/[0.05] px-2.5 text-[11px] text-content/45 transition-transform duration-150 hover:bg-content/10 hover:text-content active:scale-[0.97] disabled:opacity-40"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={working || !editor.label.trim()}
          className="ml-1 flex h-6 shrink-0 items-center gap-1.5 rounded-[4.5px] bg-content px-2.5 text-[11px] font-medium text-background-base transition-transform duration-150 hover:bg-content/85 active:scale-[0.97] disabled:cursor-default disabled:opacity-40"
        >
          {working ? <Loader className="size-3 animate-spin" /> : null}
          {adding
            ? working
              ? "Waiting for browser…"
              : "Sign in and add"
            : "Save"}
        </button>
      </div>
    </form>
  );
}