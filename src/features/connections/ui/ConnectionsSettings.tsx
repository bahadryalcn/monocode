import { PRODUCT_IDENTITY } from "../../../shared/lib/productIdentity";
import { invoke } from "@tauri-apps/api/core";
import { RemoteOutboxNotice } from "./RemoteOutboxNotice";
import { RemoteDataStatus } from "./RemoteDataStatus";
import { useEffect, useRef, useState } from "react";
import {
  Internet,
  Loader,
  Pencil,
  Plus,
  Trash2,
} from "../../../shared/ui/icons";
import {
  connectMachine,
  disconnectMachine,
  recordRemoteCapabilities,
  refreshRemoteMachines,
  remoteRequest,
  subscribeEditRequests,
  subscribeReconnectRequests,
  takeEditRequest,
  takeReconnectRequest,
  updateMachine,
  useRemoteMachines,
} from "../model/connections";
import {
  draftFromMachine,
  editImpact,
  hostnameSuggestion,
  parseMachineDraft,
} from "../model/machineEdit";
import { isLocalSyncMachine } from "../model/localSync";
import { syncNow } from "../../sync/model/syncClient";
import { describeSyncStatus } from "../../sync/model/syncStatusText";
import { useSyncStatus } from "../../sync/model/useSyncStatus";
import { notifyRemoteRecovered } from "../model/remoteHealth";
import {
  REMOTE_PROVIDERS,
  type HostDescriptor,
  type RemoteMachine,
  type SshSetup,
} from "../model/protocol";

const input =
  "w-full rounded-lg border border-content/15 bg-content/3 px-3 py-2 text-[13px] outline-none focus:border-content/35";
const button =
  "rounded-lg bg-selection px-3 py-2 text-[13px] font-medium hover:bg-selection-hover disabled:opacity-40";

function SyncLine({ machineId }: { machineId: string }) {
  const sync = useSyncStatus(machineId);
  const failed = sync.state === "error";
  return (
    <div className="mt-1 flex items-center gap-2 text-[12px]">
      <span
        className={`min-w-0 truncate ${failed ? "text-red-400" : "text-content/50"}`}
        title={sync.lastError}
      >
        {describeSyncStatus(sync, Date.now())}
      </span>
      <button
        className="shrink-0 rounded px-1.5 py-0.5 text-content/60 hover:bg-selection hover:text-content disabled:opacity-40"
        disabled={sync.state === "syncing"}
        onClick={() => void syncNow(machineId)}
      >
        Sync now
      </button>
    </div>
  );
}

export function ConnectionsSettings() {
  const {
    machines,
    loaded,
    loading,
    error: loadError,
    refresh,
  } = useRemoteMachines();
  const [adding, setAdding] = useState(false);
  // The machine whose definition the form edits; none when it adds one.
  const [editing, setEditing] = useState<RemoteMachine>();
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [port, setPort] = useState("");
  const [alternate, setAlternate] = useState("");
  const [jobId, setJobId] = useState<string>();
  const [job, setJob] = useState<SshSetup>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [answer, setAnswer] = useState("");
  const [answering, setAnswering] = useState(false);
  const [status, setStatus] = useState<Record<string, string>>({});
  const [needsUpdate, setNeedsUpdate] = useState<Record<string, boolean>>({});
  const [updatingMachine, setUpdatingMachine] = useState<string>();
  const [removing, setRemoving] = useState<string>();
  const [revoking, setRevoking] = useState(false);
  const [url, setUrl] = useState("http://127.0.0.1:3775");
  const [token, setToken] = useState("");
  const alive = useRef(true);
  const currentJob = useRef<string | undefined>(undefined);
  const submitting = useRef(false);
  // The running connection follows an edit, so its outcome is worded for one.
  const afterEdit = useRef(false);
  const progress = useRef<HTMLDivElement>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (currentJob.current)
        void invoke("remote_ssh_cancel", { jobId: currentJob.current }).catch(
          () => {},
        );
    };
  }, []);
  useEffect(() => {
    if (!jobId) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await invoke<SshSetup>("remote_ssh_poll", { jobId });
        if (disposed) return;
        setJob(next);
        if (next.done) {
          currentJob.current = undefined;
          submitting.current = false;
          setBusy(false);
          setJobId(undefined);
          setAnswer("");
          if (next.error)
            setError(
              afterEdit.current
                ? `${next.error}

The new address is saved. Edit it again, or choose Reconnect to retry.`
                : next.error,
            );
          else if (next.machine) {
            setAdding(false);
            setEditing(undefined);
            setTarget("");
            setName("");
            setPort("");
            setAlternate("");
            setNotice(
              afterEdit.current
                ? `${next.machine.name} is connected through its new address.`
                : updatingMachine
                  ? `${next.machine.name} was updated and reconnected.`
                  : `${next.machine.name} is connected. To work on it, click + next to Projects in the project rail and choose Open folder on a machine.`,
            );
            setUpdatingMachine(undefined);
            setStatus((current) => ({
              ...current,
              [next.machine!.id]: "Connected",
            }));
            refreshRemoteMachines();
            // Views that were waiting on this machine reload now.
            notifyRemoteRecovered(next.machine.environmentId);
          }
          afterEdit.current = false;
          return;
        }
      } catch (reason) {
        if (disposed) return;
        setError(String(reason));
        void invoke("remote_ssh_cancel", { jobId }).catch(() => {});
        currentJob.current = undefined;
        submitting.current = false;
        setBusy(false);
        setJobId(undefined);
        return;
      }
      timer = setTimeout(() => void poll(), 350);
    };
    void poll();
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [jobId, updatingMachine]);
  useEffect(() => {
    setAnswer("");
    setAnswering(false);
    if (job?.prompt)
      progress.current?.scrollIntoView?.({
        block: "nearest",
        behavior: "smooth",
      });
  }, [job?.prompt?.id]);
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const check = async () => {
      if (!busy)
        await Promise.all(
          machines.map(async (machine) => {
            let label = "Connected";
            try {
              const host = await remoteRequest<HostDescriptor>(
                machine.id,
                "environment.describe",
                { supportedProviders: REMOTE_PROVIDERS },
              );
              if (host.environmentId !== machine.environmentId)
                throw new Error("Host identity changed");
              recordRemoteCapabilities(host.environmentId, host.capabilities);
              if (!host.providers.length)
                label = "Connected · install a supported provider on the host";
              const update =
                !host.capabilities?.includes("workspace.run") ||
                !host.capabilities?.includes("git.worktreeCreate");
              if (update)
                label =
                  "Connected · host update needed for Explorer and Changes";
              if (!disposed)
                setNeedsUpdate((current) => ({
                  ...current,
                  [machine.id]: update,
                }));
            } catch {
              label = "Offline · reconnect to check access";
            }
            if (!disposed)
              setStatus((current) => ({ ...current, [machine.id]: label }));
          }),
        );
      if (!disposed) timer = setTimeout(() => void check(), 10_000);
    };
    void check();
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [machines, busy]);
  const begin = async (
    machine?: RemoteMachine,
    upgrade = false,
    edited = false,
  ) => {
    if (submitting.current) return;
    const parsed = machine
      ? undefined
      : parseMachineDraft({ name, target, port, alternate });
    if (parsed && !parsed.ok) return setError(parsed.error);
    submitting.current = true;
    afterEdit.current = edited;
    setBusy(true);
    setError("");
    setNotice("");
    setJob(undefined);
    setUpdatingMachine(upgrade ? machine?.id : undefined);
    try {
      const id = machine
        ? await invoke<string>("remote_ssh_reconnect", {
            machineId: machine.id,
            ...(upgrade ? { upgrade: true } : {}),
          })
        : await invoke<string>("remote_ssh_begin", {
            target: target.trim(),
            name: name.trim(),
            port: port ? Number(port) : null,
            alternate: parsed?.ok ? parsed.value.alternate : null,
          });
      if (!alive.current) {
        await invoke("remote_ssh_cancel", { jobId: id });
        return;
      }
      currentJob.current = id;
      setJobId(id);
    } catch (reason) {
      submitting.current = false;
      afterEdit.current = false;
      if (alive.current) {
        setError(String(reason));
        setBusy(false);
      }
    }
  };
  const startEdit = (machine: RemoteMachine) => {
    const draft = draftFromMachine(machine);
    setEditing(machine);
    setName(draft.name);
    setTarget(draft.target);
    setPort(draft.port);
    setAlternate(draft.alternate ?? "");
    setAdding(true);
    setError("");
    setNotice("");
  };
  const closeForm = () => {
    setAdding(false);
    setEditing(undefined);
    setTarget("");
    setName("");
    setPort("");
    setAlternate("");
  };
  const startAdd = () => {
    closeForm();
    setAdding(true);
    setJob(undefined);
    setError("");
    setNotice("");
    setRemoving(undefined);
  };
  // Saving is the user's own action, so it connects even when automatic
  // reconnecting is off. The connection runs as a setup job, the same one
  // Reconnect uses, which is where a new host key or password is answered.
  const save = async () => {
    if (!editing || busy) return;
    const parsed = parseMachineDraft({ name, target, port, alternate });
    if (!parsed.ok) return setError(parsed.error);
    const impact = editImpact(editing, parsed.value);
    if (!impact.changed) return closeForm();
    setBusy(true);
    setError("");
    try {
      const saved = await updateMachine(
        editing,
        parsed.value,
        impact.reconnect,
      );
      closeForm();
      setBusy(false);
      if (impact.reconnect) await begin(saved, false, true);
      else setNotice(`${saved.name} was renamed.`);
    } catch (reason) {
      setBusy(false);
      setError(String(reason));
    }
  };
  // A view that cannot reach a machine asks for its address to be edited here.
  useEffect(() => {
    const start = () => {
      const machine = takeEditRequest(machines);
      if (machine?.ssh) startEdit(machine);
    };
    start();
    return subscribeEditRequests(start);
    // `startEdit` only sets state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machines]);
  // A view that cannot reach a machine asks for it to be reconnected here, where
  // the SSH prompts are answered.
  useEffect(() => {
    const start = () => {
      const machine = takeReconnectRequest(machines);
      if (machine?.ssh) void begin(machine);
    };
    start();
    return subscribeReconnectRequests(start);
    // `begin` only reads refs and state setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machines]);
  const respond = async (value: string) => {
    if (!jobId || !job?.prompt || answering) return;
    setAnswering(true);
    setError("");
    try {
      await invoke("remote_ssh_answer", {
        jobId,
        promptId: job.prompt.id,
        answer: value,
      });
      setAnswer("");
    } catch (reason) {
      setError(String(reason));
      setAnswering(false);
    }
  };
  const remove = async (machine: RemoteMachine, revoke: boolean) => {
    setError("");
    setNotice("");
    setRevoking(true);
    try {
      if (revoke) {
        try {
          await remoteRequest(machine.id, "devices.revokeSelf");
        } catch (reason) {
          throw new Error(
            `Could not revoke access, so ${machine.name} was not removed: ${String(reason)}. Reconnect and try again, or remove it from this desktop only and revoke it on the host with imece-host devices and imece-host revoke <device-id>.`,
          );
        }
      }
      await disconnectMachine(machine.id);
      setRemoving(undefined);
      setNotice(
        revoke
          ? `${machine.name} was removed and this desktop's access was revoked. The host and its sessions keep running.`
          : `${machine.name} was removed from this desktop. The host and its sessions keep running, and it still accepts this desktop's credential.`,
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      if (alive.current) setRevoking(false);
    }
  };
  const suggestion = hostnameSuggestion(target, editing?.name ?? "");
  const draft = parseMachineDraft({ name, target, port });
  const saveLabel =
    editing && draft.ok && !editImpact(editing, draft.value).reconnect
      ? "Save"
      : "Save and reconnect";
  return (
    <div data-setting-id="remote-machines" className="flex flex-col gap-5">
      <RemoteOutboxNotice />
      <RemoteDataStatus
        label="machines"
        state={{
          phase: loading
            ? machines.length
              ? "refreshing"
              : "loading"
            : loadError
              ? "error"
              : machines.length
                ? "ready"
                : "empty",
          error: loadError,
        }}
        onRefresh={refresh}
      />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold text-content">
            Your machines
          </h2>
          <p className="mt-1 text-[12px] leading-relaxed text-content/45">
            Run agents on another computer and return to them from your laptop.
            The host keeps working when you close {PRODUCT_IDENTITY.displayName}{" "}
            here.
          </p>
        </div>
        {(!adding || editing) && (
          <button
            className={`${button} flex shrink-0 items-center gap-2`}
            disabled={busy}
            onClick={startAdd}
          >
            <Plus className="size-4" /> Add machine
          </button>
        )}
      </div>
      {machines.length > 0 ? (
        <div className="divide-y divide-stroke overflow-hidden rounded-xl border border-stroke">
          {machines.map((machine) => (
            <div key={machine.id}>
              <div className="flex flex-wrap items-center gap-3 px-4 py-4">
                <Internet className="size-5 shrink-0 text-content/45" />
                <div className="min-w-0 flex-1 basis-48">
                  <div className="truncate text-[13px] font-medium">
                    {machine.name}
                  </div>
                  {machine.ssh?.alternate && (
                    <div className="mt-1 break-all text-[12px] text-content/60">
                      Other address · {machine.ssh.alternate}
                    </div>
                  )}
                  <div className="mt-1 truncate text-[12px] text-content/45">
                    {isLocalSyncMachine(machine)
                      ? `Syncs projects and groups with the ${PRODUCT_IDENTITY.displayName} on this computer`
                      : machine.ssh
                        ? `SSH · ${machine.ssh.target}${machine.ssh.port ? ` · port ${machine.ssh.port}` : ""}`
                        : machine.endpoint}
                  </div>
                  <div className="mt-1 text-[12px] text-content/50">
                    {status[machine.id] ?? "Checking connection…"}
                  </div>
                  <SyncLine machineId={machine.id} />
                  {machine.ssh && needsUpdate[machine.id] ? (
                    <div className="mt-1 text-[11px] text-content/45">
                      Updating restarts the host and interrupts active agent
                      turns.
                    </div>
                  ) : null}
                </div>
                {machine.ssh && (
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {needsUpdate[machine.id] ? (
                      <button
                        className={button}
                        disabled={busy}
                        title="Downloads the matching host package and restarts the host; active agent turns will be interrupted"
                        onClick={() => void begin(machine, true)}
                      >
                        Update Host
                      </button>
                    ) : null}
                    <button
                      className={button}
                      disabled={busy}
                      onClick={() => void begin(machine)}
                    >
                      Reconnect
                    </button>
                    <button
                      className="rounded p-2 text-content/40 hover:bg-selection hover:text-content disabled:opacity-40"
                      disabled={busy}
                      aria-label={`Edit ${machine.name}`}
                      title="Edit name and address…"
                      onClick={() => startEdit(machine)}
                    >
                      <Pencil className="size-4" />
                    </button>
                  </div>
                )}
                <button
                  disabled={busy || revoking}
                  className="rounded p-2 text-content/40 hover:bg-selection hover:text-content disabled:opacity-40"
                  aria-label={`Remove ${machine.name}`}
                  title="Remove connection…"
                  onClick={() => {
                    setError("");
                    setRemoving(machine.id);
                  }}
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
              {removing === machine.id && (
                <div
                  role="group"
                  aria-label={`Confirm removing ${machine.name}`}
                  className="flex flex-col gap-3 border-t border-stroke bg-content/3 px-4 py-4 text-[12px] leading-relaxed text-content/60"
                >
                  <p className="text-[13px] font-medium text-content">
                    Remove {machine.name} from this desktop?
                  </p>
                  {isLocalSyncMachine(machine) ? (
                    <p>
                      Removing this stops syncing projects and groups with the{" "}
                      {PRODUCT_IDENTITY.displayName} on this computer. It is
                      created again automatically the next time{" "}
                      {PRODUCT_IDENTITY.displayName} starts.
                    </p>
                  ) : (
                    <p>
                      This closes this desktop’s connection to the machine. It
                      does not stop the host, and its sessions keep running and
                      stay on that machine. You can add it again later.
                    </p>
                  )}
                  <p>
                    Removing alone leaves this desktop’s credential valid on the
                    host. Revoke access to invalidate it first; the machine must
                    be reachable.
                  </p>
                  <p>
                    To stop the host and turn off its background service, run{" "}
                    <code className="rounded bg-content/10 px-1">
                      ~/.imece-host/bin/imece-host service uninstall
                    </code>{" "}
                    on that machine (
                    <code className="rounded bg-content/10 px-1">
                      %USERPROFILE%\.imece-host\bin\imece-host.cmd service
                      uninstall
                    </code>{" "}
                    on Windows). Its sessions and history are kept.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className={button}
                      disabled={revoking}
                      onClick={() => void remove(machine, true)}
                    >
                      Revoke access and remove
                    </button>
                    <button
                      className={button}
                      disabled={revoking}
                      onClick={() => void remove(machine, false)}
                    >
                      Remove from this desktop only
                    </button>
                    <button
                      className="px-3 py-2 text-[13px] text-content/50"
                      disabled={revoking}
                      onClick={() => setRemoving(undefined)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : loaded && !loading && !loadError && !adding ? (
        <div className="rounded-xl border border-dashed border-content/15 px-5 py-8 text-center text-[13px] text-content/45">
          Add your always-on Windows, Mac, or Linux machine to get started.
        </div>
      ) : null}
      {adding && (
        <form
          key={editing?.id ?? "new-machine"}
          aria-label={editing ? `Edit ${editing.name}` : "Add a new machine"}
          className="flex flex-col gap-4 rounded-xl border border-stroke p-5"
          onSubmit={(event) => {
            event.preventDefault();
            void (editing ? save() : begin());
          }}
        >
          <div className="flex items-center justify-between">
            <h3 className="text-[14px] font-medium">
              {editing ? `Edit ${editing.name}` : "Add a new machine"}
            </h3>
            <span className="rounded bg-selection px-2 py-1 text-[11px] text-content/60">
              SSH
            </span>
          </div>
          <p className="text-[12px] leading-relaxed text-content/65">
            {editing
              ? "Changes apply to this machine. To connect a different computer, choose Add machine."
              : "Connect a different computer with its own SSH address. Existing machines stay saved."}
          </p>
          <label className="flex flex-col gap-1.5 text-[12px] text-content/65">
            SSH address
            <input
              autoFocus
              required
              disabled={busy}
              className={input}
              value={target}
              onChange={(event) => setTarget(event.target.value)}
              placeholder="user@my-mac-mini or an SSH alias"
              autoComplete="off"
              spellCheck={false}
            />
            <span className="text-[11px] leading-relaxed text-content/45">
              A hostname works too, such as a Mac's Bonjour name (
              <code className="rounded bg-content/10 px-1">
                user@MacBook-Pro.local
              </code>
              ) or an alias from{" "}
              <code className="rounded bg-content/10 px-1">~/.ssh/config</code>.
              Then the address does not need editing when the IP changes.
            </span>
            {suggestion && (
              <button
                type="button"
                disabled={busy}
                className="self-start rounded-md bg-content/8 px-2 py-1 text-[11px] text-content/80 hover:bg-content/15 hover:text-content disabled:opacity-40"
                title="Fills the address. Nothing is saved or tested until you save."
                onClick={() => setTarget(suggestion)}
              >
                Use {suggestion} instead of the IP
              </button>
            )}
          </label>
          <label className="flex flex-col gap-1.5 text-[12px] text-content/65">
            Other address (optional)
            <input
              disabled={busy}
              className={input}
              value={alternate}
              onChange={(event) => setAlternate(event.target.value)}
              placeholder="Optional, e.g. user@100.64.0.5 (Tailscale)"
              autoComplete="off"
              spellCheck={false}
            />
            <span className="text-[11px] leading-relaxed text-content/45">
              Optional fallback for this same machine, such as its Tailscale
              address. If the first address cannot connect,{" "}
              {PRODUCT_IDENTITY.displayName} automatically tries this one. Both
              addresses stay saved and use the same SSH port. The other address
              is checked against this machine's known host key.
            </span>
          </label>
          <label className="flex flex-col gap-1.5 text-[12px] text-content/65">
            Name (optional)
            <input
              disabled={busy}
              className={input}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Optional, e.g. Home Mac mini"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
            />
          </label>
          <details className="text-[12px] text-content/50">
            <summary className="cursor-pointer">Advanced</summary>
            <label className="mt-3 flex max-w-40 flex-col gap-1.5">
              SSH port
              <input
                disabled={busy}
                type="number"
                min={1}
                max={65535}
                className={input}
                value={port}
                onChange={(event) => setPort(event.target.value)}
                placeholder="From SSH config"
              />
            </label>
          </details>
          {editing ? (
            <p className="text-[12px] leading-relaxed text-content/45">
              Saving a new address closes the current connection and connects to
              it. If this computer has not connected to that address before, SSH
              asks you here whether to trust its host key. The machine's
              projects, sessions and history stay linked to it. If the address
              turns out to be another machine, the change stays saved so you can
              fix it; nothing is installed there.
            </p>
          ) : (
            <>
              <p className="text-[12px] leading-relaxed text-content/45">
                {PRODUCT_IDENTITY.displayName} installs and starts its
                background host, then connects securely. Your SSH keys and
                config are used automatically. Enable SSH on the host and sign
                in to Codex or Claude Code there. On Windows and Mac, keep the
                host’s desktop account signed in and the machine awake. Locking
                the desktop is fine.
              </p>
              <p className="text-[12px] leading-relaxed text-content/45">
                On Linux, setup installs a systemd user service and turns on
                lingering for your account (
                <code className="rounded bg-content/10 px-1">
                  loginctl enable-linger
                </code>
                ), so the host and your other user services keep running after
                you log out. The host keeps running until you stop it on that
                machine; removing it here only disconnects this desktop.
              </p>
            </>
          )}
          {error && (
            <p
              role="alert"
              className="whitespace-pre-wrap break-words rounded-lg bg-red-500/5 p-3 text-[12px] leading-relaxed text-red-400"
            >
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={busy}
              className="px-3 py-2 text-[13px] text-content/50"
              onClick={closeForm}
            >
              Cancel
            </button>
            <button className={button} disabled={busy || !target.trim()}>
              {editing
                ? busy
                  ? "Saving…"
                  : saveLabel
                : busy
                  ? "Connecting…"
                  : "Connect"}
            </button>
          </div>
        </form>
      )}
      {busy && jobId && (
        <div
          className="flex flex-col gap-3 rounded-xl border border-stroke p-5"
          role="status"
          ref={progress}
        >
          <div className="flex items-center gap-2 text-[13px]">
            <Loader className="size-4 animate-spin" />
            {job?.message ?? "Starting connection…"}
          </div>
          {job?.prompt && (
            <form
              className="flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                void respond(job.prompt!.confirm ? "yes" : answer);
              }}
            >
              <p className="whitespace-pre-wrap break-words text-[12px] leading-relaxed text-content/70">
                {job.prompt.message}
              </p>
              {!job.prompt.confirm && (
                <input
                  key={job.prompt.id}
                  autoFocus
                  type="password"
                  aria-label="SSH password or passphrase"
                  autoComplete="off"
                  disabled={answering}
                  className={input}
                  value={answer}
                  onChange={(event) => setAnswer(event.target.value)}
                />
              )}
              <div className="flex gap-2">
                <button className={button} disabled={answering}>
                  {job.prompt.confirm ? "Trust host and continue" : "Continue"}
                </button>
                {job.prompt.confirm && (
                  <button
                    type="button"
                    className={button}
                    disabled={answering}
                    onClick={() => void respond("no")}
                  >
                    Reject
                  </button>
                )}
              </div>
            </form>
          )}
          <button
            type="button"
            className="self-start text-[12px] text-content/50 hover:text-content"
            onClick={() => {
              if (jobId)
                void invoke("remote_ssh_cancel", { jobId }).catch((reason) =>
                  setError(String(reason)),
                );
            }}
          >
            Cancel connection
          </button>
        </div>
      )}
      {error && !adding && (
        <p
          role="alert"
          className="whitespace-pre-wrap break-words rounded-lg bg-red-500/5 p-3 text-[12px] leading-relaxed text-red-400"
        >
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-[13px] text-emerald-500">
          {notice}
        </p>
      )}
      <details className="text-[12px] text-content/45">
        <summary className="cursor-pointer">
          Connect to an existing host by URL
        </summary>
        <form
          className="mt-4 flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (busy) return;
            setBusy(true);
            setError("");
            void connectMachine("", url, token)
              .then((machine) => {
                setToken("");
                setNotice(`${machine.name} is connected.`);
              })
              .catch((reason) => setError(String(reason)))
              .finally(() => setBusy(false));
          }}
        >
          <label>
            Host URL
            <input
              required
              disabled={busy}
              className={`${input} mt-1`}
              value={url}
              onChange={(event) => setUrl(event.target.value)}
            />
          </label>
          <label>
            Device token
            <input
              required
              disabled={busy}
              type="password"
              autoComplete="off"
              className={`${input} mt-1`}
              value={token}
              onChange={(event) => setToken(event.target.value)}
            />
          </label>
          <button className={`${button} self-start`} disabled={busy}>
            Connect by URL
          </button>
        </form>
      </details>
    </div>
  );
}
