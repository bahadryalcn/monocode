import { useRemoteConnection } from "../model/useRemoteConnection";
import { RemoteLoadError } from "./RemoteLoadError";

/** Above a remote project's session: why the machine is out of reach and how to
 * reconnect, in the same card the Changes panel and file tree use. Shows
 * nothing while the machine is connected. */
export function RemoteConnectionBanner({ cwd, stale = false }: { cwd: string; stale?: boolean }) {
  const { status, error, lastSeen, reconnecting } = useRemoteConnection(cwd);
  // Not knowing yet is not a problem to report.
  if (status === "connected" || (status === "connecting" && !reconnecting)) return null;
  const since = lastSeen
    ? ` Last connected at ${new Date(lastSeen).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`
    : "";
  return (
    <div className="shrink-0 border-b border-stroke py-0.5">
      <RemoteLoadError
        cwd={cwd}
        stale={stale}
        failure={{
          kind: status === "outdated-host" ? "outdated" : "unreachable",
          message: `${error ?? "Reconnecting…"}${since}`,
        }}
      />
    </div>
  );
}
