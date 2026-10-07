import { useEffect, useState } from "react";
import { RefreshCw } from "../../../shared/ui/icons";
import { WORKSPACE_REFRESH_EVENT } from "../../../app/shell/WorkspaceControls";
import {
  providerAccounts,
  subscribeProviderAccounts,
} from "../../providers/model/providerAccounts";
import {
  loadRateLimits,
  useCachedRateLimits,
} from "../../providers/model/rateLimitsCache";
import {
  clampUsedPercent,
  formatResetCountdown,
  type RateLimitProvider,
} from "../../providers/model/rateLimits";
import { HarnessIcon } from "../../sessions/ui/HarnessIcon";
import { UsageOverview } from "./UsageOverview";

export function UsagePage() {
  const [version, setVersion] = useState(0);
  const [refresh, setRefresh] = useState(0);
  useEffect(
    () => subscribeProviderAccounts(() => setVersion((v) => v + 1)),
    [],
  );
  useEffect(() => {
    const reload = () => setRefresh((v) => v + 1);
    window.addEventListener(WORKSPACE_REFRESH_EVENT, reload);
    return () => window.removeEventListener(WORKSPACE_REFRESH_EVENT, reload);
  }, []);
  return (
    <div key={version}>
      <div className="mb-6 flex items-center justify-between gap-3">
        <p className="text-xs text-content/50">
          Account limits and remaining capacity on this machine.
        </p>
        <button
          type="button"
          aria-label="Refresh usage"
          title="Refresh usage"
          onClick={() => setRefresh((v) => v + 1)}
          className="grid size-8 place-items-center rounded-md border border-stroke hover:bg-content/10"
        >
          <RefreshCw className="size-3.5" />
        </button>
      </div>
      {(["codex", "claude"] as const).map((provider) => (
        <section key={provider} className="mb-7">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <HarnessIcon harness={provider} className="size-4" />
            {provider === "codex" ? "Codex" : "Claude"}
          </h2>
          <div className="space-y-3">
            {providerAccounts(provider).map((account) => (
              <AccountLimits
                key={account.id}
                provider={provider}
                accountId={account.id}
                label={account.label}
                refresh={refresh}
              />
            ))}
          </div>
        </section>
      ))}
      <UsageOverview key={refresh} />
    </div>
  );
}

function AccountLimits({
  provider,
  accountId,
  label,
  refresh,
}: {
  provider: RateLimitProvider;
  accountId: string;
  label: string;
  refresh: number;
}) {
  const limits = useCachedRateLimits(provider, accountId);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    void loadRateLimits(provider, accountId, refresh > 0);
  }, [provider, accountId, refresh]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const windows = (["session", "weekly", "monthly"] as const).flatMap((kind) =>
    limits[kind] ? [{ kind, window: limits[kind]! }] : [],
  );
  return (
    <div className="space-y-3">
      {windows.map(({ kind, window }) => {
        const remaining = 100 - clampUsedPercent(window.usedPercent);
        return (
          <div
            key={kind}
            className="grid gap-4 rounded-xl border border-stroke p-4 sm:grid-cols-[180px_1fr]"
          >
            <div>
              <h3 className="text-xs font-semibold capitalize">{kind}</h3>
              <p className="mt-2">
                <strong className="text-3xl font-semibold tabular-nums">
                  {Math.round(remaining)}%
                </strong>
                <span className="ml-2 text-xs text-content/50">left</span>
              </p>
            </div>
            <div className="flex flex-col justify-center gap-2">
              <div
                role="meter"
                aria-label={`${label} ${kind} remaining`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={remaining}
                className="h-5 overflow-hidden rounded-full bg-content/10"
              >
                <div
                  className={`h-full rounded-full ${provider === "claude" ? "bg-orange-400/40" : "bg-content/40"}`}
                  style={{ width: `${remaining}%` }}
                />
              </div>
              <div className="flex flex-wrap justify-between gap-2 text-xs text-content/60">
                <span>{label}</span>
                <span>
                  {window.resetsAt == null
                    ? "Reset time unavailable"
                    : formatResetCountdown(window.resetsAt - now)}
                </span>
              </div>
            </div>
          </div>
        );
      })}
      {limits.error ? (
        <p role="status" className="text-xs text-content/60">
          {label}: {limits.error}
        </p>
      ) : null}
      {!windows.length && !limits.error ? (
        <p className="rounded-xl border border-stroke p-4 text-xs text-content/50">
          {label}:{" "}
          {limits.status === "fetching" || limits.status === "idle"
            ? "Loading account limits…"
            : "Account limits unavailable."}
        </p>
      ) : null}
    </div>
  );
}
