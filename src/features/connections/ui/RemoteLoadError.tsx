import { useState } from "react";
import { Loader } from "../../../shared/ui/icons";
import { OPEN_CONNECTIONS_EVENT } from "../model/connections";
import type { RemoteFailure } from "../model/remoteFailure";
import { useRemoteConnection } from "../model/useRemoteConnection";

const ACTION =
  "shrink-0 rounded-md bg-content/8 px-2 py-0.5 text-[11px] text-content/80 hover:bg-content/15 hover:text-content disabled:opacity-40";

/** One compact, inline explanation of why a remote project's data could not be
 * loaded, with what the user can do about it. `stale` says older data is still
 * shown (dimmed) below it. */
export function RemoteLoadError({
  cwd,
  failure,
  stale = false,
  onRetry,
}: {
  cwd: string;
  failure: RemoteFailure;
  stale?: boolean;
  onRetry?: () => void;
}) {
  const { machine, status, reconnecting, reconnect } = useRemoteConnection(cwd);
  const [reconnectError, setReconnectError] = useState("");
  const name = machine?.name ?? "this machine";
  const title =
    failure.kind === "unreachable"
      ? `Can’t reach ${name}`
      : failure.kind === "outdated"
        ? `MonoCode Host on ${name} needs an update`
        : "Couldn’t load from the machine";
  const needsAuth = status === "needs-auth";
  const startReconnect = () => {
    setReconnectError("");
    void reconnect({ signIn: true }).then((result) => {
      if (!result.ok) setReconnectError(result.error);
    });
  };
  const openConnections = () => window.dispatchEvent(new Event(OPEN_CONNECTIONS_EVENT));
  return (
    <div
      role="alert"
      className="mx-2 my-1.5 flex flex-col gap-1 rounded-lg border border-stroke bg-content/5 px-2.5 py-2 text-[12px] leading-4"
    >
      <p className="font-medium text-content">{title}</p>
      <p className="break-words text-content/60">{failure.message}</p>
      {reconnectError && reconnectError !== failure.message ? (
        <p className="break-words text-content/60">Reconnecting failed: {reconnectError}</p>
      ) : null}
      {stale ? <p className="text-content/45">Showing what was last loaded.</p> : null}
      <div className="mt-0.5 flex flex-wrap gap-1.5">
        {failure.kind === "unreachable" && machine ? (
          <button
            type="button"
            className={`${ACTION} inline-flex items-center gap-1`}
            disabled={reconnecting}
            onClick={startReconnect}
          >
            {reconnecting ? <Loader className="size-3 animate-spin" aria-hidden="true" /> : null}
            {reconnecting ? "Reconnecting…" : needsAuth ? "Sign in and reconnect" : "Reconnect"}
          </button>
        ) : null}
        {failure.kind === "unreachable" || failure.kind === "outdated" ? (
          <button type="button" className={ACTION} onClick={openConnections}>
            Connection settings
          </button>
        ) : null}
        {failure.kind === "other" && onRetry ? (
          <button type="button" className={ACTION} onClick={onRetry}>
            Retry
          </button>
        ) : null}
      </div>
    </div>
  );
}
