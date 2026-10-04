import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { RemoteOutboxNotice } from "./RemoteOutboxNotice";
import { useRemoteOutboxIssues } from "../model/remoteOutbox";
import type { SessionPaneProps } from "../../sessions/ui/SessionPane";
import type {
  Attachment,
  Block,
  ComposerTurnOptions,
  HarnessId,
  RuntimeMode,
  Session,
  WorkspaceMode,
  PlanBuildTarget,
} from "../../sessions/model/session";
import { uploadRemoteAttachments } from "../model/remoteAttachments";
import { temporaryWorktreeBranchName } from "../../source-control/model/worktrees";
import type { AgentModel } from "../../sessions/model/models";
import { isModelEnabled } from "../../sessions/model/models";
import { remoteSessionPollDelay } from "../model/remotePollingPolicy";
import {
  ModelSourceContext,
  type ModelSource,
} from "../../sessions/ui/modelSource";
import { notifyGitChanged } from "../../../platform/tauri/fs";
import type { Worktree } from "../../source-control/model/worktrees";
import { useProjectBranchesState } from "../../source-control/hooks/useProjectBranches";
import { registerRemoteSessionActions } from "../model/remoteSessionActions";
import { HOST_UPDATE_NOTICE, SESSION_SHELL } from "../model/remoteCapabilities";
import {
  parseShellCommand,
  SHELL_FOLLOW_UP_PROMPT,
} from "../../sessions/model/shellRun";
import { loadResumeAtReset } from "../../settings/model/settings";
import {
  clearPendingRemoteCommand,
  loadRemoteSession,
  OPEN_CONNECTIONS_EVENT,
  pendingRemoteCommand,
  pendingRemoteFollowup,
  rememberRemotePendingWorktree,
  rememberRemoteSession,
  REMOTE_HISTORY_CHANGE,
  remoteRequest,
  reportRemoteMachineStatus,
  remotePendingWorktree,
  remoteSessionFor,
  savePendingRemoteCommand,
  useRemoteMachines,
} from "../model/connections";
import {
  blocksSending,
  needsSignIn,
  sendAfterReconnect,
} from "../model/remoteConnection";
import { CONTINUE_PROMPT } from "../../sessions/model/inFlight";
import {
  nextRemoteQueuedMessage,
  queueSessionFields,
  shouldQueueRemoteMessage,
} from "../model/remoteQueue";
import { remoteTurnInterrupted } from "../model/remoteRecovery";
import { forgetRemoteQueue, useRemoteQueue } from "../model/useRemoteQueue";
import { useRemoteRecovery } from "../model/useRemoteRecovery";
import {
  reportRemoteConnection,
  subscribeRemoteRecovered,
} from "../model/remoteHealth";
import { useRemoteConnection } from "../model/useRemoteConnection";
import { RemoteConnectionBanner } from "./RemoteConnectionBanner";
import {
  parseRemotePath,
  remotePath,
  remoteProjectFor,
  type RemoteProject,
} from "../model/remoteProjects";
import {
  carryModelSettings,
  findRemoteModel,
  remoteModelControls,
  sameModelSettings,
} from "../model/remoteModels";
import {
  isRemoteProvider,
  REMOTE_PROVIDERS,
  requireHostDescriptor,
  type CommandReceipt,
  type HostCommand,
  type HostDescriptor,
  type HostModelCatalog,
  type HostSession,
  type HostWorktree,
  type RemoteAttachment,
  type RemoteMachine,
  type RemoteProvider,
} from "../model/protocol";

export type RemoteSessionOverrides = Partial<SessionPaneProps> & {
  remoteSession: boolean;
  remoteFeatures: { attachments: boolean; plan: boolean; draft: boolean };
  remoteSessionLoading: boolean;
  remoteSessionStarted: boolean;
  /** The host recorded that this chat's last turn was lost; Continue is offered. */
  interruptedTurn: boolean;
  sendBlockedReason?: string;
  allowedModelHarnesses: readonly HarnessId[];
};

type Configuration = {
  harness: RemoteProvider;
  model: string;
  settings: Record<string, string>;
  mode: RuntimeMode;
};

type OptimisticTurn = {
  commandId: string;
  text: string;
  attachments: Attachment[];
  intent: "default" | "plan" | "build";
  draft?: boolean;
  draftBlockId?: string;
  planBlockId?: string;
  startedAt: number;
  turnModel: NonNullable<Block["turnModel"]>;
};

const noop = () => {};
const cachedSessionSnapshots = new Map<string, HostSession>();
const cachedDescriptors = new Map<string, HostDescriptor>();
const cachedCatalogs = new Map<string, HostModelCatalog>();
const snapshotKey = (machineId: string, sessionId: string) =>
  `${machineId}:${sessionId}`;
const catalogKey = (machineId: string, projectId: string) =>
  JSON.stringify([machineId, projectId]);
function rememberSessionSnapshot(key: string, snapshot: HostSession) {
  cachedSessionSnapshots.delete(key);
  cachedSessionSnapshots.set(key, snapshot);
  if (cachedSessionSnapshots.size > 8)
    cachedSessionSnapshots.delete(cachedSessionSnapshots.keys().next().value!);
}

/** Fetches a host conversation into the snapshot cache, so its tab opens with
 * the transcript already laid out, as a local session read from disk does. */
export async function preloadRemoteSession(
  machineId: string,
  sessionId: string,
): Promise<void> {
  const key = snapshotKey(machineId, sessionId);
  if (cachedSessionSnapshots.has(key)) return;
  rememberSessionSnapshot(key, await loadRemoteSession(machineId, sessionId));
}

/** A tab in a project on another machine. The host owns the session; this
 * renders the normal session pane with actions routed to the host. */
export function RemoteSession({
  shell,
  visible,
  onSnapshot,
  onOpenFile,
  onOpenDiff,
  onOpenPlan,
  render,
}: {
  /** The tab's local session, which provides its ID and new-session defaults. */
  shell: Session;
  visible: boolean;
  onSnapshot?: (shellId: string, snapshot?: HostSession) => void;
  onOpenFile: SessionPaneProps["onOpenFile"];
  onOpenDiff: SessionPaneProps["onOpenDiff"];
  onOpenPlan: SessionPaneProps["onOpenPlan"];
  render: (overrides: RemoteSessionOverrides) => ReactNode;
}) {
  const project = remoteProjectFor(shell.cwd);
  const { machines, loaded } = useRemoteMachines(!!project);
  const machine = project
    ? machines.find((entry) => entry.environmentId === project.environmentId)
    : undefined;
  if (!project || !machine)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-[13px] text-content/60">
          {!project
            ? "This project’s machine details are missing. Add the project again from the project rail."
            : loaded
              ? "The machine for this project isn’t connected on this computer."
              : "Connecting to the machine…"}
        </p>
        {project && loaded ? (
          <button
            type="button"
            className="rounded-lg bg-selection px-3 py-1.5 text-[12px] hover:bg-selection-hover"
            onClick={() =>
              window.dispatchEvent(new Event(OPEN_CONNECTIONS_EVENT))
            }
          >
            Manage machines
          </button>
        ) : null}
      </div>
    );
  return (
    <ConnectedRemoteSession
      key={`${machine.id}:${shell.id}`}
      shell={shell}
      visible={visible}
      onSnapshot={onSnapshot}
      onOpenFile={onOpenFile}
      onOpenDiff={onOpenDiff}
      onOpenPlan={onOpenPlan}
      machine={machine}
      project={project}
      render={render}
    />
  );
}

function ConnectedRemoteSession({
  shell,
  visible,
  onSnapshot,
  onOpenFile,
  onOpenDiff,
  onOpenPlan,
  machine,
  project,
  render,
}: {
  shell: Session;
  visible: boolean;
  onSnapshot?: (shellId: string, snapshot?: HostSession) => void;
  onOpenFile: SessionPaneProps["onOpenFile"];
  onOpenDiff: SessionPaneProps["onOpenDiff"];
  onOpenPlan: SessionPaneProps["onOpenPlan"];
  machine: RemoteMachine;
  project: RemoteProject;
  render: (overrides: RemoteSessionOverrides) => ReactNode;
}) {
  const [descriptor, setDescriptor] = useState<HostDescriptor | undefined>(() =>
    cachedDescriptors.get(machine.id),
  );
  const [online, setOnline] = useState(false);
  const connection = useRemoteConnection(project.key);
  const [error, setError] = useState("");
  const [sessionId, setSessionId] = useState(() => remoteSessionFor(shell.id));
  const boundSession = useRef(sessionId);
  const bindingVersion = useRef(0);
  const deletingSession = useRef<string | undefined>(undefined);
  useEffect(() => {
    const changed = () => {
      const next = remoteSessionFor(shell.id);
      if (next !== boundSession.current) {
        bindingVersion.current++;
        boundSession.current = next;
        setStarting(undefined);
        setUnseenSend(undefined);
        setChanges(undefined);
        applied.current = undefined;
        setError("");
        setRemovingDraft(undefined);
        preparingRef.current = false;
        setSnapshot(
          next
            ? cachedSessionSnapshots.get(snapshotKey(machine.id, next))
            : undefined,
        );
      }
      setPending(
        pendingRemoteCommand(
          project.key,
          machine.environmentId,
          next ?? null,
          shell.id,
        ),
      );
      setSessionId(next);
    };
    window.addEventListener(REMOTE_HISTORY_CHANGE, changed);
    changed();
    return () => window.removeEventListener(REMOTE_HISTORY_CHANGE, changed);
  }, [shell.id, machine.id]);
  const [snapshot, setSnapshot] = useState<HostSession | undefined>(() =>
    sessionId
      ? cachedSessionSnapshots.get(snapshotKey(machine.id, sessionId))
      : undefined,
  );
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const [refresh, setRefresh] = useState(0);
  const [catalog, setCatalog] = useState<HostModelCatalog | undefined>(() =>
    cachedCatalogs.get(catalogKey(machine.id, project.projectId)),
  );
  const [catalogError, setCatalogError] = useState("");
  const [catalogRefresh, setCatalogRefresh] = useState(0);
  const [selectedCwd, setSelectedCwd] = useState(
    () => remotePendingWorktree(shell.id) ?? project.cwd,
  );
  const [draftWorkspaceMode, setDraftWorkspaceMode] =
    useState<WorkspaceMode>("current");
  const [draftWorktreeBase, setDraftWorktreeBase] = useState("HEAD");
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const preparingRef = useRef(false);
  const [unseenSend, setUnseenSend] = useState<
    Pick<
      OptimisticTurn,
      | "commandId"
      | "text"
      | "startedAt"
      | "turnModel"
      | "attachments"
      | "draftBlockId"
    > & {
      sessionId: string;
    }
  >();
  // A first message waits here while its session is created on the host.
  const [starting, setStarting] = useState<
    OptimisticTurn & { failed?: boolean }
  >();
  const [pending, setPending] = useState(() =>
    pendingRemoteCommand(
      project.key,
      machine.environmentId,
      sessionId ?? null,
      shell.id,
    ),
  );
  const [draft, setDraft] = useState<Configuration>(() => ({
    harness: isRemoteProvider(shell.harness) ? shell.harness : "codex",
    model: shell.model,
    settings: shell.modelSettings ?? {},
    mode: shell.runtimeMode,
  }));
  // Changes to a started session, applied when it is idle.
  const [changes, setChanges] = useState<Configuration>();
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    setPending(
      pendingRemoteCommand(
        project.key,
        machine.environmentId,
        sessionId ?? null,
        shell.id,
      ),
    );
  }, [project.key, machine.environmentId, sessionId]);

  const hostSession =
    snapshot && snapshot.session.id === sessionId
      ? snapshot.session
      : undefined;
  useEffect(() => {
    if (hostSession) rememberRemotePendingWorktree(shell.id);
  }, [hostSession?.id, shell.id]);
  const executionCwd = hostSession?.cwd ?? selectedCwd;
  const { branches } = useProjectBranchesState(
    remotePath(machine.environmentId, executionCwd),
    online,
  );
  const activeSessionId = hostSession?.id ?? sessionId;
  const hasHostBlock = (commandId: string) =>
    !!hostSession?.blocks.some((block) => block.id === commandId);
  const unseenActive =
    !!unseenSend &&
    unseenSend.sessionId === activeSessionId &&
    !hasHostBlock(unseenSend.commandId);
  const startingActive =
    !!starting && !starting.failed && !hasHostBlock(starting.commandId);
  const pendingSendActive =
    (pending?.type === "send" || pending?.type === "compact") &&
    pending.sessionId === activeSessionId &&
    !hasHostBlock(pending.commandId);
  const busy =
    (!!hostSession && snapshot?.status === "running") ||
    unseenActive ||
    (startingActive && !starting?.draft) ||
    pendingSendActive;
  // Follow-ups sent while a turn runs wait here, on this computer, and go out
  // one by one when it ends. Keyed by the host's session id.
  const queue = useRemoteQueue(activeSessionId);
  // An accepted turn stays on screen until a sync shows the host's copy, so
  // the transcript never drops it for a moment in between.
  useEffect(() => {
    if (starting && !starting.failed && hasHostBlock(starting.commandId))
      setStarting(undefined);
  }, [hostSession, starting]);
  // A draft being removed leaves the transcript at once, as it does locally,
  // and returns if the host turns the removal down.
  const [removingDraft, setRemovingDraft] = useState<string>();
  useEffect(() => {
    if (
      removingDraft &&
      !hostSession?.blocks.some((block) => block.id === removingDraft)
    )
      setRemovingDraft(undefined);
  }, [hostSession, removingDraft]);
  useEffect(() => {
    if (
      unseenSend &&
      hostSession?.id === unseenSend.sessionId &&
      hostSession.blocks.some((block) => block.id === unseenSend.commandId)
    )
      setUnseenSend((current) =>
        current?.commandId === unseenSend.commandId ? undefined : current,
      );
  }, [hostSession, unseenSend]);

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    let failed = 0;
    let polling = false;
    const version = bindingVersion.current;
    const stale = () =>
      disposed ||
      version !== bindingVersion.current ||
      (!!sessionId && deletingSession.current === sessionId);
    // Every request carries the expected host identity; describe again only
    // after a failure, when the host may have been replaced.
    let described = false;
    const poll = async () => {
      if (disposed || polling) return;
      polling = true;
      let active = false;
      try {
        if (!described) {
          const host = requireHostDescriptor(
            await remoteRequest<HostDescriptor>(
              machine.id,
              "environment.describe",
              { supportedProviders: REMOTE_PROVIDERS },
            ),
          );
          if (host.environmentId !== machine.environmentId)
            throw new Error(
              "Host identity changed. Reconnect this machine before continuing.",
            );
          if (stale()) return;
          cachedDescriptors.set(machine.id, host);
          setDescriptor(host);
          described = true;
        }
        const known =
          snapshotRef.current?.session.id === sessionId
            ? snapshotRef.current
            : undefined;
        const next = sessionId
          ? await loadRemoteSession(machine.id, sessionId, known)
          : undefined;
        if (stale()) return;
        if (next && next.projectId !== project.projectId)
          throw new Error("This session belongs to a different host project");
        setOnline(true);
        reportRemoteMachineStatus(machine.id, true);
        // A catalog request that failed while offline is retried on recovery.
        if (failed) setCatalogRefresh((value) => value + 1);
        failed = 0;
        if (next && sessionId)
          rememberSessionSnapshot(snapshotKey(machine.id, sessionId), next);
        setSnapshot(next);
        if (next) onSnapshot?.(shell.id, next);
        // A `!command` still running on the host changes the transcript too.
        active =
          next?.status === "running" ||
          !!next?.session.blocks.some((block) => block.shell?.running);
      } catch (reason) {
        if (stale()) return;
        setOnline(false);
        reportRemoteMachineStatus(machine.id, false, reason);
        described = false;
        failed++;
      } finally {
        polling = false;
      }
      if (!disposed)
        timer = setTimeout(
          () => void poll(),
          remoteSessionPollDelay(active, visible, document.hidden, failed),
        );
    };
    const onVisibility = () => {
      clearTimeout(timer);
      if (polling) return; // The current read schedules with the new visibility.
      if (!document.hidden) void poll();
      else
        timer = setTimeout(
          () => void poll(),
          remoteSessionPollDelay(
            snapshotRef.current?.status === "running",
            visible,
            true,
            failed,
          ),
        );
    };
    document.addEventListener("visibilitychange", onVisibility);
    void poll();
    return () => {
      disposed = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [
    machine.id,
    machine.environmentId,
    project.projectId,
    sessionId,
    refresh,
    visible,
    onSnapshot,
  ]);

  // When the machine comes back, the poll starts again at once instead of
  // waiting out its back-off, and re-attaches this session from its snapshot.
  useEffect(
    () =>
      subscribeRemoteRecovered(() => {
        setRefresh((value) => value + 1);
        setCatalogRefresh((value) => value + 1);
      }),
    [],
  );

  useEffect(() => {
    if (!descriptor) return;
    let disposed = false;
    void remoteRequest<HostModelCatalog>(machine.id, "models.list", {
      projectId: project.projectId,
    })
      .then((value) => {
        if (disposed) return;
        cachedCatalogs.set(catalogKey(machine.id, project.projectId), value);
        setCatalog(value);
        setCatalogError("");
      })
      .catch((reason) => {
        if (!disposed) setCatalogError(String(reason));
      });
    return () => {
      disposed = true;
    };
  }, [
    machine.id,
    descriptor?.environmentId,
    project.projectId,
    catalogRefresh,
  ]);

  const providers = useMemo(
    () => (descriptor?.providers ?? []).filter(isRemoteProvider),
    [descriptor],
  );
  // A new session starts with the tab's model when the host offers it, and
  // otherwise with the host's first model. Settings follow the host's entry:
  // the same id can differ between machines, such as `claude:opus` offering a
  // 1M context only on an account that has it.
  useEffect(() => {
    if (!online || sessionId || !catalog || !providers.length) return;
    const harness = providers.includes(draft.harness)
      ? draft.harness
      : providers[0];
    const models = (catalog.models[harness] ?? []).filter((model) => isModelEnabled(model.id));
    const model =
      findRemoteModel(models, draft.model) ??
      (harness === draft.harness ? undefined : models[0]) ??
      models[0];
    if (!model) return;
    setDraft((current) => {
      const settings = carryModelSettings(
        model.settings ?? [],
        current.settings,
      );
      return current.harness === harness &&
        current.model === model.id &&
        sameModelSettings(settings, current.settings)
        ? current
        : { ...current, harness, model: model.id, settings };
    });
  }, [online, catalog, providers, sessionId, draft.harness, draft.model]);

  const saved: Configuration | undefined = hostSession && {
    harness: hostSession.harness as RemoteProvider,
    model: hostSession.model,
    settings: hostSession.modelSettings ?? {},
    mode: hostSession.runtimeMode,
  };
  const configuration = saved ? (changes ?? saved) : draft;
  const updateConfiguration = (
    update: (current: Configuration) => Configuration,
  ) => {
    if (saved) setChanges(update(changes ?? saved));
    else setDraft(update);
  };

  const selectedTurnModel = (): NonNullable<Block["turnModel"]> => ({
    harness: configuration.harness,
    id: configuration.model,
    name:
      findRemoteModel(
        catalog?.models[configuration.harness] ?? [],
        configuration.model,
      )?.name ?? configuration.model.replace(/^[^:]+:/, ""),
  });
  const optimisticTurn = (
    text: string,
    attachments: Attachment[] = [],
    intent: "default" | "plan" | "build" = "default",
    draft = false,
    draftBlockId?: string,
    planBlockId?: string,
  ): OptimisticTurn => ({
    commandId: crypto.randomUUID(),
    text,
    attachments,
    intent,
    draft,
    draftBlockId,
    planBlockId,
    startedAt: Date.now(),
    turnModel: selectedTurnModel(),
  });

  const run = async (
    command: HostCommand,
    optimistic?: OptimisticTurn,
    followup?: HostCommand,
  ): Promise<CommandReceipt | undefined> => {
    if (sendingRef.current) return undefined;
    const version = bindingVersion.current;
    sendingRef.current = true;
    setSending(true);
    setError("");
    if (command.type === "send" || command.type === "compact")
      setUnseenSend((current) =>
        current?.commandId === command.commandId
          ? current
          : {
              sessionId: command.sessionId,
              commandId: command.commandId,
              text: command.type === "send" ? command.text : "/compact",
              attachments: optimistic?.attachments ?? [],
              startedAt: optimistic?.startedAt ?? Date.now(),
              turnModel: optimistic?.turnModel ?? selectedTurnModel(),
              draftBlockId:
                command.type === "send" ? command.draftBlockId : undefined,
            },
      );
    // Keep the original ID across disconnects and app restarts. An ambiguous
    // response is retried explicitly instead of silently sending a new prompt.
    try {
      savePendingRemoteCommand(
        project.key,
        machine.environmentId,
        command,
        shell.id,
        followup,
      );
      setPending(command);
      const receipt = await remoteRequest<CommandReceipt>(
        machine.id,
        "commands.dispatch",
        command,
        false,
        true,
      );
      if (command.type === "create") {
        const next = pendingRemoteFollowup(
          project.key,
          machine.environmentId,
          command.commandId,
        );
        if (next && next.type !== "create")
          savePendingRemoteCommand(
            project.key,
            machine.environmentId,
            { ...next, sessionId: receipt.sessionId },
            shell.id,
          );
        if (version === bindingVersion.current) openSession(receipt.sessionId);
      }
      clearPendingRemoteCommand(
        project.key,
        machine.environmentId,
        command.commandId,
      );
      if (!alive.current || version !== bindingVersion.current) return receipt;
      if (command.type === "draft") {
        // Accepted drafts are actionable before the next snapshot arrives.
        setSnapshot((current) => ({
          ...(current?.session.id === command.sessionId
            ? current
            : {
                projectId: project.projectId,
                revision: 0,
                updatedAt: Date.now(),
              }),
          status: "idle",
          session: {
            ...(current?.session.id === command.sessionId
              ? current.session
              : shell),
            id: command.sessionId,
            cwd: selectedCwd,
            harness: configuration.harness,
            model: configuration.model,
            modelSettings: configuration.settings,
            runtimeMode: configuration.mode,
            busy: false,
            blocks: [
              ...(current?.session.id === command.sessionId
                ? current.session.blocks
                : []
              ).filter(
                (block) => !block.draft && block.id !== command.commandId,
              ),
              {
                id: command.commandId,
                role: "user",
                text: command.text,
                draft: true,
                attachments: optimistic?.attachments ?? [],
              },
            ],
          },
        }));
        setStarting(undefined);
      }
      setPending(
        pendingRemoteCommand(
          project.key,
          machine.environmentId,
          command.type === "create" ? receipt.sessionId : (sessionId ?? null),
          shell.id,
        ),
      );
      setRefresh((value) => value + 1);
      return receipt;
    } catch (reason) {
      reportRemoteConnection(project.key, "session", reason);
      if (!alive.current || version !== bindingVersion.current)
        return undefined;
      const message = String(reason);
      if (message.includes("Host rejected request:")) {
        if (command.type === "send" || command.type === "compact")
          setUnseenSend((current) =>
            current?.commandId === command.commandId ? undefined : current,
          );
        clearPendingRemoteCommand(
          project.key,
          machine.environmentId,
          command.commandId,
        );
        setPending(
          pendingRemoteCommand(
            project.key,
            machine.environmentId,
            sessionId ?? null,
            shell.id,
          ),
        );
      }
      setError(message.replace(/^Error: /, ""));
      return undefined;
    } finally {
      sendingRef.current = false;
      if (alive.current) setSending(false);
    }
  };

  // A conversation that was only a draft goes with it, as a local one does,
  // and the tab starts over as a new conversation.
  const discardSession = async (id: string) => {
    const version = bindingVersion.current;
    deletingSession.current = id;
    try {
      await remoteRequest(machine.id, "sessions.delete", {
        projectId: project.projectId,
        sessionId: id,
      });
      cachedSessionSnapshots.delete(snapshotKey(machine.id, id));
      forgetRemoteQueue(id);
      if (!alive.current || version !== bindingVersion.current) return;
      setSnapshot(undefined);
      rememberRemoteSession(shell.id);
      onSnapshot?.(shell.id, undefined);
    } catch (reason) {
      if (!alive.current || version !== bindingVersion.current) return;
      deletingSession.current = undefined;
      setRefresh((value) => value + 1);
      setRemovingDraft(undefined);
      setError(String(reason).replace(/^Error: /, ""));
    }
  };

  const openSession = (id: string) => {
    boundSession.current = id;
    rememberRemoteSession(shell.id, id);
    setSessionId(id);
  };

  // Model, effort and permission changes apply directly, as locally. A
  // running turn keeps its settings; the change is sent once it finishes.
  const applying = useRef(false);
  // The last change the host accepted, until a sync reflects it.
  const applied = useRef<Configuration>(undefined);
  useEffect(() => {
    if (!changes || !saved || !hostSession) return;
    const same = (a: Configuration, b: Configuration) =>
      a.harness === b.harness &&
      a.model === b.model &&
      a.mode === b.mode &&
      sameModelSettings(a.settings, b.settings);
    if (same(changes, saved)) {
      applied.current = undefined;
      setChanges(undefined);
      return;
    }
    if (applied.current && same(changes, applied.current)) return;
    if (busy || !online || pending || applying.current) return;
    applying.current = true;
    const sent = changes;
    void run({
      type: "configure",
      commandId: crypto.randomUUID(),
      sessionId: hostSession.id,
      ...(descriptor?.capabilities.includes("sessions.harnessSwitch") ? { harness: changes.harness } : {}),
      model: changes.model,
      modelSettings: changes.settings,
      runtimeMode: changes.mode,
    })
      .then((receipt) => {
        if (receipt) applied.current = sent;
      })
      .finally(() => {
        applying.current = false;
      });
  });

  const dispatchTurn = async (
    id: string,
    turn: OptimisticTurn,
    uploaded?: RemoteAttachment[],
  ) => {
    const version = bindingVersion.current;
    const refs = turn.draftBlockId
      ? []
      : (uploaded ??
        (await uploadRemoteAttachments(machine.id, turn.attachments)));
    if (!alive.current || version !== bindingVersion.current) return undefined;
    return run(
      turn.draft
        ? {
            type: "draft",
            commandId: turn.commandId,
            sessionId: id,
            text: turn.text,
            attachments: refs,
          }
        : message(
            id,
            turn.text,
            turn.commandId,
            refs,
            turn.intent,
            turn.draftBlockId,
            turn.planBlockId,
          ),
      turn,
    );
  };

  const startSession = async (turn: OptimisticTurn) => {
    const version = bindingVersion.current;
    try {
      const uploaded = await uploadRemoteAttachments(
        machine.id,
        turn.attachments,
      );
      if (version !== bindingVersion.current) return;
      let worktreeCwd = selectedCwd;
      let autoWorktreeBranch: string | undefined;
      if (draftWorkspaceMode === "worktree") {
        try {
          const tree = await remoteRequest<HostWorktree>(
            machine.id,
            "git.worktreeCreate",
            {
              projectId: project.projectId,
              cwd: selectedCwd,
              branch: temporaryWorktreeBranchName(),
              base: draftWorktreeBase,
              existing: false,
            },
          );
          if (version !== bindingVersion.current) return;
          worktreeCwd = tree.path;
          autoWorktreeBranch = tree.branch ?? undefined;
          rememberRemotePendingWorktree(shell.id, tree.path);
          if (alive.current) {
            setSelectedCwd(tree.path);
            setDraftWorkspaceMode("current");
          }
        } catch (reason) {
          if (alive.current && version === bindingVersion.current) {
            setError(String(reason));
            setStarting({ ...turn, failed: true });
          }
          return;
        }
      }
      const followup: Exclude<HostCommand, { type: "create" }> = turn.draft
        ? {
            type: "draft",
            commandId: turn.commandId,
            sessionId: "",
            text: turn.text,
            attachments: uploaded,
          }
        : message(
            "",
            turn.text,
            turn.commandId,
            uploaded,
            turn.intent,
            turn.draftBlockId,
            turn.planBlockId,
          );
      const receipt = await run(
        {
          type: "create",
          commandId: crypto.randomUUID(),
          projectId: project.projectId,
          ...(worktreeCwd !== project.cwd ? { worktreeCwd } : {}),
          ...(autoWorktreeBranch ? { autoWorktreeBranch } : {}),
          harness: draft.harness,
          model: draft.model,
          modelSettings: draft.settings,
          runtimeMode: draft.mode,
        },
        turn,
        followup,
      );
      if (version !== bindingVersion.current) return;
      if (!receipt) {
        if (alive.current) setStarting({ ...turn, failed: true });
        return;
      }
      if (version !== bindingVersion.current) return;
      const sent = await run(
        { ...followup, sessionId: receipt.sessionId },
        turn,
      );
      if (alive.current && version === bindingVersion.current)
        if (!sent) setStarting({ ...turn, failed: true });
    } catch (reason) {
      if (alive.current && version === bindingVersion.current) {
        setError(String(reason));
        setStarting({ ...turn, failed: true });
      }
    } finally {
      preparingRef.current = false;
    }
  };

  const message = (
    id: string,
    text: string,
    commandId: string = crypto.randomUUID(),
    attachments: RemoteAttachment[] = [],
    intent: "default" | "plan" | "build" = "default",
    draftBlockId?: string,
    planBlockId?: string,
  ): Extract<HostCommand, { type: "send" | "compact" }> =>
    text.trim().toLowerCase() === "/compact" &&
    !attachments.length &&
    !draftBlockId &&
    intent === "default"
      ? {
          type: "compact",
          commandId,
          sessionId: id,
          resumeAtReset: loadResumeAtReset(),
        }
      : {
          type: "send",
          commandId,
          sessionId: id,
          resumeAtReset: loadResumeAtReset(),
          text,
          attachments,
          intent,
          ...(draftBlockId ? { draftBlockId } : {}),
          ...(planBlockId ? { planBlockId } : {}),
        };

  // Starts a turn whose optimistic bubble is already in `starting`. Gives up,
  // clearing it, when the session cannot take a message now.
  const launch = (turn: OptimisticTurn): boolean => {
    if (!hostSession) {
      if (sessionId || !draft.model) {
        preparingRef.current = false;
        setStarting(undefined);
        return false;
      }
      void startSession(turn);
      return true;
    }
    if (changes || hostSession.busy || pending || sendingRef.current) {
      preparingRef.current = false;
      setStarting(undefined);
      return false;
    }
    const version = bindingVersion.current;
    void dispatchTurn(hostSession.id, turn)
      .then((receipt) => {
        if (alive.current && version === bindingVersion.current)
          if (!receipt) setStarting({ ...turn, failed: true });
      })
      .catch((reason) => {
        if (alive.current && version === bindingVersion.current) {
          setError(String(reason));
          setStarting({ ...turn, failed: true });
        }
      })
      .finally(() => {
        preparingRef.current = false;
      });
    return true;
  };
  const launchRef = useRef(launch);
  launchRef.current = launch;
  const onlineRef = useRef(online);
  onlineRef.current = online;
  const onlineWaiters = useRef(new Set<() => void>());
  useEffect(() => {
    if (!online) return;
    onlineWaiters.current.forEach((wake) => wake());
    onlineWaiters.current.clear();
  }, [online]);
  /** Resolves once the poll has reached the machine, or false after a while. */
  const whenOnline = () =>
    onlineRef.current
      ? Promise.resolve(true)
      : new Promise<boolean>((resolve) => {
          const wake = () => {
            clearTimeout(timer);
            resolve(true);
          };
          const timer = setTimeout(() => {
            onlineWaiters.current.delete(wake);
            resolve(false);
          }, 10_000);
          onlineWaiters.current.add(wake);
        });
  // Send while the machine is out of reach: reconnect first, then send. The
  // composer has let go of the message, so when that fails it goes back there
  // (or stays here as a failed message with Try again); it is never dropped.
  const sendWhenConnected = async (
    turn: OptimisticTurn,
    options?: ComposerTurnOptions,
  ) => {
    const version = bindingVersion.current;
    const outcome = await sendAfterReconnect({
      status: connection.status,
      reconnect: () => connection.reconnect(),
      ready: whenOnline,
      send: () =>
        alive.current &&
        version === bindingVersion.current &&
        launchRef.current(turn),
    });
    if (outcome.sent || !alive.current || version !== bindingVersion.current)
      return;
    preparingRef.current = false;
    // The connection banner already says why a reconnect failed.
    if (outcome.failure === "offline") setError(outcome.error ?? "");
    if (options?.onSendRejected?.())
      setStarting((current) =>
        current?.commandId === turn.commandId ? undefined : current,
      );
    else setStarting({ ...turn, failed: true });
  };

  // `!commands` this window sent; the agent carries on once each one finishes.
  const shellFollowUps = useRef(new Set<string>());
  const dispatchShell = (id: string, command: string) => {
    const commandId = crypto.randomUUID();
    return remoteRequest<CommandReceipt>(
      machine.id,
      "commands.dispatch",
      {
        type: "shell",
        commandId,
        sessionId: id,
        line: command,
      },
      false,
      true,
    ).then(() => {
      shellFollowUps.current.add(commandId);
      if (alive.current) setRefresh((value) => value + 1);
    });
  };
  useEffect(() => {
    for (const id of [...shellFollowUps.current]) {
      const block = hostSession?.blocks.find((entry) => entry.id === id);
      if (!block?.shell || block.shell.running) continue;
      shellFollowUps.current.delete(id);
      submit(SHELL_FOLLOW_UP_PROMPT);
    }
  }, [hostSession]);

  /** Runs a `!command` on the host. It is not a turn: nothing is queued or
   * retried, and a refused one stays in the composer. */
  const runShell = (command: string): boolean => {
    if (!descriptor) {
      setError("This project’s machine isn’t connected yet.");
      return false;
    }
    if (!descriptor.capabilities.includes(SESSION_SHELL)) {
      setError(HOST_UPDATE_NOTICE);
      return false;
    }
    if (sendingRef.current || preparingRef.current) return false;
    const version = bindingVersion.current;
    const failed = (reason: unknown) => {
      reportRemoteConnection(project.key, "session", reason);
      if (alive.current && version === bindingVersion.current)
        setError(String(reason).replace(/^Error: /, ""));
    };
    setError("");
    if (hostSession) {
      void dispatchShell(hostSession.id, command).catch(failed);
      return true;
    }
    // A new conversation: the command needs a session to run in.
    if (sessionId || !draft.model) return false;
    if (draftWorkspaceMode === "worktree") {
      setError(
        "Send a message first to create the worktree, then run commands in it.",
      );
      return false;
    }
    preparingRef.current = true;
    void run({
      type: "create",
      commandId: crypto.randomUUID(),
      projectId: project.projectId,
      ...(selectedCwd !== project.cwd ? { worktreeCwd: selectedCwd } : {}),
      harness: draft.harness,
      model: draft.model,
      modelSettings: draft.settings,
      runtimeMode: draft.mode,
    })
      .then((receipt) =>
        receipt ? dispatchShell(receipt.sessionId, command) : undefined,
      )
      .catch(failed)
      .finally(() => {
        preparingRef.current = false;
      });
    return true;
  };

  const submit = (
    text: string,
    attachments: Attachment[] = [],
    options?: ComposerTurnOptions,
    asDraft = false,
    planBlockId?: string,
  ): boolean => {
    const shellCommand =
      asDraft || attachments.length || options?.draftBlockId || planBlockId
        ? undefined
        : parseShellCommand(text);
    if (shellCommand) return runShell(shellCommand);
    if (
      (text.trim() || attachments.length) &&
      shouldQueueRemoteMessage({
        busy,
        working: sending || preparingRef.current || !!pending,
        asDraft,
      })
    ) {
      // Before the saved queue is read, or without a session to key it by,
      // the composer keeps the message.
      if (!queue.loaded || !activeSessionId) return false;
      queue.enqueue({
        id: crypto.randomUUID(),
        text,
        attachments,
        intent: options?.intent,
      });
      return true;
    }
    if (
      sending ||
      preparingRef.current ||
      pending ||
      busy ||
      (!text.trim() && !attachments.length)
    )
      return false;
    const intent =
      options?.intent === "plan" || options?.intent === "build"
        ? options.intent
        : "default";
    const turn = optimisticTurn(
      text,
      attachments,
      intent,
      asDraft,
      options?.draftBlockId,
      planBlockId,
    );
    preparingRef.current = true;
    setStarting(turn);
    if (!online) {
      void sendWhenConnected(turn, options);
      return true;
    }
    return launch(turn);
  };

  const working = sending || !!pending;
  const queuedSession: Session = {
    ...(hostSession ?? shell),
    busy,
    ...queueSessionFields(queue.queue),
  };
  const nextQueued = nextRemoteQueuedMessage({
    session: queuedSession,
    loaded: queue.loaded,
    online,
    canSend: connection.canSend,
    working,
    changing: !!changes,
  });
  const [drainRetry, setDrainRetry] = useState(0);
  const submitRef = useRef(submit);
  submitRef.current = submit;
  // Send the head of the queue once the turn is over and the machine is
  // reachable. A held queue loses nothing: it simply waits for both.
  useEffect(() => {
    if (!nextQueued) return;
    const timer = setTimeout(() => {
      const accepted = submitRef.current(
        nextQueued.text,
        nextQueued.attachments,
        {
          intent: nextQueued.intent,
        },
      );
      if (accepted) queue.sent(nextQueued.id);
      else setDrainRetry((value) => value + 1);
    }, 0);
    return () => clearTimeout(timer);
  }, [nextQueued?.id, drainRetry]);

  // After a restart or a reconnect: a run this app saw working that the host
  // now reports as lost is continued once, when the setting says so.
  const hostSnapshot =
    snapshot && snapshot.session.id === sessionId ? snapshot : undefined;
  useRemoteRecovery({
    environmentId: machine.environmentId,
    shellId: shell.id,
    hostSessionId: hostSession?.id,
    status: hostSnapshot?.status,
    runId: hostSnapshot?.runId,
    fresh: online,
    providerSessionId: hostSession?.providerSessionId,
    queueLoaded: queue.loaded,
    queuedCount: queue.queue.messages.length,
    ready: online && connection.canSend && !busy && !working && !changes,
    send: () => submit(CONTINUE_PROMPT, []),
  });
  const interruptedTurn = remoteTurnInterrupted({
    status: hostSnapshot?.status,
    providerSessionId: hostSession?.providerSessionId,
    busy,
  });

  const modelSource = useMemo<ModelSource>(() => {
    const models = (harness: HarnessId) =>
      catalog?.models[harness as RemoteProvider] ?? [];
    const savedModel = hostSession?.model;
    const savedSettings = hostSession?.modelSettings ?? {};
    return {
      id: `remote:${machine.environmentId}`,
      modelsFor: models,
      resolve: (harness, id = "") => {
        const provider = harness as RemoteProvider;
        // Keep the saved model's effort visible even when the host catalog is
        // loading, failed, or no longer lists it.
        const controls = remoteModelControls(
          catalog,
          provider,
          id,
          id === savedModel ? savedSettings : {},
          savedModel,
        );
        const listed = controls.model;
        return {
          ...(listed ?? {
            id,
            harness,
            name: id ? id.replace(/^[a-z]+:/, "") : "Loading models…",
            nativeId: id.replace(/^[a-z]+:/, ""),
          }),
          settings: controls.settings,
        } satisfies AgentModel;
      },
      find: (id) =>
        providers
          .flatMap((harness) => models(harness))
          .find((m) => m.id === id),
      available: (harness) =>
        providers.includes(harness as RemoteProvider) &&
        (!hostSession || descriptor?.capabilities.includes("sessions.harnessSwitch") === true || hostSession.harness === harness),
      probed: () => !!descriptor,
      // The host re-probes when a provider CLI changes or its catalog ages,
      // so each picker opening asks again.
      refresh: () => setCatalogRefresh((value) => value + 1),
    };
  }, [
    catalog,
    catalogError,
    descriptor,
    providers,
    machine.environmentId,
    hostSession?.harness,
    hostSession?.model,
    hostSession?.modelSettings,
  ]);

  // Show a message the host has not confirmed yet in the transcript.
  // A draft being sent is replaced by its message at once, as locally.
  const leavingDrafts = new Set(
    [
      removingDraft,
      startingActive ? starting?.draftBlockId : undefined,
      pendingSendActive && pending?.type === "send"
        ? pending.draftBlockId
        : undefined,
      unseenActive ? unseenSend?.draftBlockId : undefined,
    ].filter(Boolean),
  );
  const blocks: Block[] = (hostSession?.blocks ?? []).filter(
    (block) => !leavingDrafts.has(block.id),
  );
  const unconfirmed: Block | undefined =
    unseenActive && unseenSend
      ? {
          id: unseenSend.commandId,
          role: "user",
          text: unseenSend.text,
          attachments: unseenSend.attachments,
          startedAt: unseenSend.startedAt,
          turnModel: unseenSend.turnModel,
        }
      : pendingSendActive && pending
        ? {
            id: pending.commandId,
            role: "user",
            text: pending.type === "send" ? pending.text : "/compact",
          }
        : (startingActive || (starting?.failed && !starting.draft)) && starting
          ? {
              id: starting.commandId,
              role: "user",
              text: starting.text,
              attachments: starting.attachments,
              draft: starting.draft,
              startedAt: starting.startedAt,
              turnModel: starting.turnModel,
            }
          : undefined;
  const session: Session = {
    ...(hostSession ?? {
      title: shell.title,
      blocks: [],
    }),
    id: shell.id,
    cwd: remotePath(machine.environmentId, project.cwd),
    worktreeCwd:
      executionCwd === project.cwd
        ? undefined
        : remotePath(machine.environmentId, executionCwd),
    workspaceMode: hostSession ? undefined : draftWorkspaceMode,
    worktreeBase: hostSession ? undefined : draftWorktreeBase,
    branch: branches?.current ?? hostSession?.branch,
    harness: configuration.harness,
    model: configuration.model,
    modelSettings: configuration.settings,
    runtimeMode: configuration.mode,
    busy,
    blocks: unconfirmed ? [...blocks, unconfirmed] : blocks,
    ...queueSessionFields(queue.queue),
  };

  const catalogProblem = catalog?.errors[configuration.harness] ?? catalogError;
  const retryPending = async () => {
    if (!pending || sendingRef.current) return;
    const version = bindingVersion.current;
    setStarting((current) =>
      current ? { ...current, failed: false } : current,
    );
    const receipt = await run(pending);
    if (
      receipt &&
      pending.type === "create" &&
      version === bindingVersion.current
    ) {
      const next = pendingRemoteCommand(
        project.key,
        machine.environmentId,
        receipt.sessionId,
        shell.id,
      );
      if (next) await run(next);
    }
  };
  const notice =
    pending && !sending
      ? {
          text: "Waiting for the host to confirm your request.",
          detail: error,
          action: { label: "Retry", run: () => void retryPending() },
        }
      : starting?.failed
        ? {
            text: `Couldn’t ${starting.draft ? "save the draft" : "send the message"} on ${machine.name}.`,
            detail: error,
            action: {
              label: "Try again",
              run: () => {
                const turn = { ...starting, failed: false };
                setStarting(turn);
                preparingRef.current = true;
                if (!sessionId) void startSession(turn);
                else
                  void dispatchTurn(sessionId, turn)
                    .then((sent) => {
                      if (alive.current)
                        if (!sent) setStarting({ ...turn, failed: true });
                    })
                    .catch((reason) => {
                      if (alive.current) {
                        setError(String(reason));
                        setStarting({ ...turn, failed: true });
                      }
                    })
                    .finally(() => {
                      preparingRef.current = false;
                    });
              },
            },
          }
        : error
          ? {
              text: error,
              action: { label: "Dismiss", run: () => setError("") },
            }
          : catalogProblem
            ? {
                text: `Couldn’t load models from ${machine.name}.`,
                detail: catalogProblem,
                action: {
                  label: "Retry",
                  run: () => setCatalogRefresh((value) => value + 1),
                },
              }
            : undefined;

  const selectWorktree = async (tree: Worktree) => {
    const parsed = parseRemotePath(tree.path);
    if (!parsed || parsed.environmentId !== machine.environmentId)
      throw new Error("Choose a worktree on this machine");
    if (sessionId)
      throw new Error(
        "This session’s worktree is fixed. Start a new session to use another.",
      );
    if (parsed.hostPath === executionCwd) return;
    rememberRemotePendingWorktree(shell.id, parsed.hostPath);
    setSelectedCwd(parsed.hostPath);
  };

  const buildPlan = (blockId: string, target?: PlanBuildTarget) => {
    const block = hostSession?.blocks.find(
      (entry) => entry.id === blockId && entry.role === "plan",
    );
    if (!block || !block.text.trim() || block.streaming || busy) return;
    if (
      target &&
      (target.harness !== configuration.harness ||
        target.model !== configuration.model ||
        !sameModelSettings(target.modelSettings, configuration.settings))
    ) {
      setError(
        "Select that model in the composer before building this remote plan.",
      );
      return;
    }
    submit(
      `Build the approved plan:\n\n${block.text}`,
      [],
      { intent: "build" },
      false,
      blockId,
    );
  };

  const stopTurn = () => {
    if (hostSession?.busy && snapshot?.runId) {
      // What is queued waits for the user instead of sending as the turn ends.
      queue.pause();
      void run({
        type: "cancel",
        commandId: crypto.randomUUID(),
        sessionId: hostSession.id,
        runId: snapshot.runId,
      });
    }
  };
  const approve = (
    requestId: number,
    decision: Parameters<SessionPaneProps["onApproval"]>[2],
  ) => {
    if (!hostSession || !snapshot?.runId) return;
    void run({
      type: "approve",
      commandId: crypto.randomUUID(),
      sessionId: hostSession.id,
      runId: snapshot.runId,
      requestId,
      decision,
    });
  };
  // The host owns the limit; a local edit would be undone by its next snapshot.
  const usageLimit = (action: "arm" | "disarm" | "dismiss") => {
    if (!hostSession?.usageLimit) return;
    void run({
      type: "usageLimit",
      commandId: crypto.randomUUID(),
      sessionId: hostSession.id,
      action,
    });
  };
  const answer = (
    requestId: number,
    reply: Parameters<SessionPaneProps["onQuestionReply"]>[2],
  ) => {
    if (!hostSession || !snapshot?.runId) return;
    void run({
      type: "answer",
      commandId: crypto.randomUUID(),
      sessionId: hostSession.id,
      runId: snapshot.runId,
      requestId,
      reply,
    });
  };
  const compact = () => {
    if (!hostSession || busy || pending || changes || !online) return false;
    void run(message(hostSession.id, "/compact"));
    return true;
  };
  const saveDraft = (text: string, attachments: Attachment[]) =>
    submit(text, attachments, undefined, true);
  useEffect(
    () =>
      registerRemoteSessionActions(shell.id, {
        buildPlan,
        submit: (text, attachments, options) =>
          submit(text, attachments, options),
        saveDraft,
        stop: stopTurn,
        compact,
        approve,
        answer,
      }),
    [shell.id, buildPlan, saveDraft, stopTurn, compact, approve, answer],
  );

  const hostFilePath = (path: string) => {
    const existing = parseRemotePath(path);
    if (existing) return path;
    const absolute =
      path.startsWith("/") ||
      path.startsWith("\\\\") ||
      /^[A-Za-z]:[\\/]/.test(path)
        ? path
        : `${executionCwd.replace(/[\\/]+$/, "")}/${path.replace(/^\.\//, "")}`;
    return remotePath(machine.environmentId, absolute);
  };

  const outboxIssues = useRemoteOutboxIssues(
    project.key,
    machine.environmentId,
  );
  const overrides: RemoteSessionOverrides = {
    session,
    remoteSession: true,
    remoteFeatures: {
      attachments: !!descriptor?.capabilities.includes("attachments.upload"),
      plan: !!descriptor?.capabilities.includes("sessions.plan"),
      draft: !!descriptor?.capabilities.includes("sessions.draft"),
    },
    remoteSessionLoading: !!sessionId && !hostSession && !session.blocks.length,
    remoteSessionStarted: !!sessionId,
    sendBlockedReason: outboxIssues.length
      ? "An unfinished request needs recovery. Check the host and review the request above."
      : blocksSending(connection.status)
        ? needsSignIn(connection.status)
          ? `${machine.name} needs you to sign in first. Use “Sign in and reconnect” above.`
          : `Can’t reach ${machine.name}. Send reconnects first.`
        : undefined,
    allowedModelHarnesses: hostSession && !descriptor?.capabilities.includes("sessions.harnessSwitch")
      ? [hostSession.harness]
      : providers.length
        ? providers
        : ["codex", "claude"],
    onSubmit: (_, text, attachments, options) =>
      submit(text, attachments, options),
    onStop: stopTurn,
    onApproval: (_, requestId, decision) => approve(requestId, decision),
    onQuestionReply: (_, requestId, reply) => answer(requestId, reply),
    onCompactContext: compact,
    onModelChange: (_, harness, model) => {
      if (!isRemoteProvider(harness)) return;
      updateConfiguration((current) => ({
        ...current,
        harness,
        model,
        settings: carryModelSettings(
          modelSource.resolve(harness, model).settings ?? [],
          current.settings,
        ),
      }));
    },
    onModelSettingsChange: (_, settings) =>
      updateConfiguration((current) => ({ ...current, settings })),
    onRuntimeModeChange: (_, mode) =>
      updateConfiguration((current) => ({ ...current, mode })),
    onOpenFile: (path, navigation, options) => {
      if (navigation || options) onOpenFile(hostFilePath(path), navigation, options);
      else onOpenFile(hostFilePath(path));
    },
    onOpenDiff: (path) => onOpenDiff(path ? hostFilePath(path) : undefined),
    // This computer's features do not apply to a host session.
    onCwdChange: noop,
    onBranchChange: () => {
      notifyGitChanged();
    },
    onWorktreeChange: (_, tree) => selectWorktree(tree),
    onWorkspaceModeChange: (_, mode, base) => {
      setDraftWorkspaceMode(mode);
      if (base) setDraftWorktreeBase(base);
    },
    onWorktreeBaseChange: (_, base) => setDraftWorktreeBase(base),
    onManageWorktrees: undefined,
    onSaveDraft: (_, text, attachments) => saveDraft(text, attachments),
    onRemoveDraft: (_, draftBlockId) => {
      if (!hostSession || busy || pending || !online || removingDraft)
        return false;
      setRemovingDraft(draftBlockId);
      if (hostSession.blocks.every((block) => block.id === draftBlockId))
        void discardSession(hostSession.id);
      else
        void run({
          type: "removeDraft",
          commandId: crypto.randomUUID(),
          sessionId: hostSession.id,
          draftBlockId,
        }).then((receipt) => {
          if (!receipt && alive.current) setRemovingDraft(undefined);
        });
      return true;
    },
    onPlaceSessionInFolder: noop,
    onDeleteQueuedMessage: (_, id) => queue.remove(id),
    onEditQueuedMessage: (_, id, text, attachments) =>
      queue.edit(id, text, attachments),
    onQueuedMessageEditingChange: (_, id) => queue.setEditing(id),
    onReorderQueuedMessages: (_, ids) => queue.reorder(ids),
    // A host turn cannot be steered: "Send next" lets the queue drain, which
    // sends the head as soon as the turn is over.
    onSteerQueuedMessage: () => queue.release(),
    onResumeQueue: () => queue.release(),
    interruptedTurn,
    onUsageLimitResume: noop,
    onUsageLimitResumeAtReset: (_, enabled) =>
      usageLimit(enabled ? "arm" : "disarm"),
    onUsageLimitDismiss: () => usageLimit("dismiss"),
    onOpenPlan: (_, blockId) => onOpenPlan(shell.id, blockId),
    onBuildPlan: (_, blockId, target) => buildPlan(blockId, target),
    onSecondOpinion: undefined,
    onHandoff: undefined,
    onBtwSubmit: undefined,
    onBtwRetry: undefined,
    onBtwDelete: undefined,
    onBtwModelChange: undefined,
    onNewTerminal: noop,
    onArchiveSession: undefined,
    onDeleteSession: undefined,
    reviewUndoLocked: true,
  };

  return (
    <ModelSourceContext.Provider value={modelSource}>
      <div className="relative flex h-full min-h-0 flex-col">
        <RemoteConnectionBanner cwd={project.key} stale={!!hostSession} />
        {online && hostSession && snapshot?.status === "running" ? (
          <div
            role="status"
            className="shrink-0 border-b border-accent/20 bg-accent/5 px-4 py-2 text-xs text-content/80"
          >
            Working on {machine.name}.
          </div>
        ) : null}
        <RemoteOutboxNotice
          project={project.key}
          environment={machine.environmentId}
        />
        {notice ? (
          <div
            role={error ? "alert" : "status"}
            className="flex shrink-0 items-center gap-3 border-b border-stroke px-4 py-2 text-[12px] text-content/65"
          >
            <span className="min-w-0 flex-1 truncate" title={notice.detail}>
              {notice.text}
              {notice.detail ? (
                <span className="text-content/40"> {notice.detail}</span>
              ) : null}
            </span>
            {notice.action ? (
              <button
                type="button"
                disabled={!online && notice.action.label !== "Dismiss"}
                className="shrink-0 rounded-md px-2 py-1 text-content/70 hover:bg-content/8 hover:text-content disabled:opacity-40"
                onClick={notice.action.run}
              >
                {notice.action.label}
              </button>
            ) : null}
          </div>
        ) : null}
        <div className="min-h-0 flex-1">{render(overrides)}</div>
      </div>
    </ModelSourceContext.Provider>
  );
}
