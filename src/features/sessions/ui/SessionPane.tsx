import {
  ChevronDown,
  File,
  GripVertical,
  Loader,
  X,
} from "../../../shared/ui/icons";
import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Composer } from "./Composer";
import type { Worktree } from "../../source-control/model/worktrees";
import {
  orchestrationCheckoutCwd,
  orchestrator,
  sameCheckout,
} from "../../orchestration/model/orchestration";
import { DiscussionEmpty } from "./DiscussionEmpty";
import { LinkedWorkItemUpdateNotice } from "../../inbox/ui/LinkedWorkItemUpdateNotice";
import { SessionReview } from "./SessionReview";
import { PromptOutline } from "./PromptOutline";
import {
  canCompactHarnessContext,
  canStopHarnessBackgroundWork,
  stopHarnessBackgroundWork,
  type ApprovalDecision,
  type UserQuestionReply,
} from "../../../integrations/harness";
import {
  looksLikeProject,
  type RecentProject,
} from "../../projects/model/recents";
import {
  sessionDisplayTitle,
  sessionDraftBlock,
  sessionWorkCwd,
  type Attachment,
  type Block,
  type HarnessId,
  type LinkedWorkItem,
  type ModelTarget,
  type PlanBuildTarget,
  type RuntimeMode,
  type Session,
  type WorkspaceMode,
  type ComposerTurnOptions,
} from "../model/session";
import { sessionHasBtwThreads, supportsBtwHarness } from "../model/btw";
import { BtwSheet, useBtwConversation } from "./BtwSheet";
import { ActivityDock } from "./ActivityDock";
import { InterruptedNotice } from "./InterruptedNotice";
import { isAutoContinueDue } from "../model/autoContinue";
import { CONTINUE_PROMPT, canAutoContinue } from "../model/inFlight";
import { SubagentSheet, useSubagentSheet } from "./SubagentSheet";
import { isBackgroundOnly, type DockAgent } from "../model/activityDock";
import { requestOpenSubagent, requestViewSubagent } from "./subagentFocus";
import { AgentTranscript } from "./AgentTranscript";
import { PooledTranscript, type TranscriptPool } from "./TranscriptPool";
import { TranscriptFind } from "./TranscriptFind";
import {
  clearTranscriptJump,
  peekTranscriptJump,
  subscribeTranscriptJump,
} from "../model/transcriptJump";
import { EmptySession } from "./EmptySession";
import { useComposerDockMotion } from "./useComposerDockMotion";
import { MOD } from "../../../platform/tauri/platform";
import {
  acknowledgeQuoteRequest,
  ADD_TO_CHAT_EVENT,
  type AddToChatRequest,
  type QuoteRequest,
} from "../model/quoteDraft";
import { createNote, noteTitle } from "../../notes";
import {
  getNotesPanelOpen,
  NOTES_PANEL_COMMAND,
  subscribeNotesPanel,
  toggleNotesPanel,
} from "../../notes/notesPanel";
import { SessionNotesPanel } from "../../notes/ui/SessionNotesPanel";
import {
  keybindingShortcutLabel,
  loadNotesEnabled,
  subscribeNotesEnabled,
} from "../../settings/model/settings";
import { getComposerDraft, setComposerDraft } from "../model/draftCache";
import { resolveModel } from "../model/models";
import { isAstraModel } from "../model/astraWelcome";
import { isOpus55Model } from "../model/opusWelcome";
import { AstraWelcome } from "./AstraWelcome";
import { OpusWelcome } from "./OpusWelcome";
import { projectKey } from "../../../shared/lib/paths";
import { userPromptHistory } from "../model/composerHistory";
import { canEditLastTurn, lastTurnRecall } from "../model/editLastTurn";
import {
  loadProjectChatBackgroundSettings,
  projectChatBackgroundImageRevision,
  projectChatBackgroundRevision,
  subscribeProjectChatBackground,
} from "../../projects/model/projectChatBackground";
import { useProjectBackgroundEffect } from "../../projects/ui/useProjectBackgroundEffect";
import { GradientBlurBackground } from "../../settings/ui/GradientBlurBackground";
import {
  loadChatBackgroundPath,
  loadNewThreadBackgroundEffect,
  subscribeChatBackgroundPath,
} from "../../settings/model/appearance";
import type { SessionFolderTarget } from "../model/sessionFolders";
import { markLinkedSessionUpdateSeen } from "../../inbox/model/linkedSessionSeen";
import { RemoteSession } from "../../connections/ui/RemoteSession";
import { isRemoteProjectPath } from "../../projects/model/recents";
import type { HostSession } from "../../connections/model/protocol";
import {
  ADOPTED_CONFLICT_MESSAGE,
  ADOPTED_RUNNING_REASON,
} from "../../connections/model/adoptedSessions";

export type SessionPaneProps = {
  session: Session;
  workspaceSwitchingSessionId?: string;
  windowMovingSessionIds?: ReadonlySet<string>;
  reviewUndoLocked?: boolean;
  visible: boolean;
  focused: boolean;
  addToChatTarget?: boolean;
  inSplit: boolean;
  composerFocused: boolean;
  composerFocusToken?: number;
  recents: RecentProject[];
  hideProjectPicker?: boolean;
  onFocus: (sessionId: string) => void;
  onClose: (sessionId: string) => void;
  onCwdChange: (sessionId: string, cwd: string) => void;
  onBranchChange: (sessionId: string) => void;
  onWorktreeChange?: (sessionId: string, tree: Worktree) => Promise<void>;
  onRemoteSnapshot?: (shellId: string, snapshot?: HostSession) => void;
  onWorkspaceModeChange: (
    sessionId: string,
    mode: WorkspaceMode,
    base?: string,
  ) => void;
  onWorktreeBaseChange: (sessionId: string, base: string) => void;
  onManageWorktrees?: () => void;
  onModelChange: (sessionId: string, harness: HarnessId, model: string) => void;
  onModelSettingsChange: (
    sessionId: string,
    settings: Record<string, string>,
  ) => void;
  onRuntimeModeChange: (sessionId: string, mode: RuntimeMode) => void;
  onSubmit: (
    sessionId: string,
    text: string,
    attachments: Attachment[],
    options?: ComposerTurnOptions,
  ) => boolean | void;
  onSaveDraft: (
    sessionId: string,
    text: string,
    attachments: Attachment[],
  ) => boolean | void;
  onRemoveDraft: (sessionId: string, draftBlockId: string) => boolean | void;
  onStop: (sessionId: string) => void;
  onCompactContext: (sessionId: string) => boolean;
  /** Open the picker of conversations Claude Code stored for this project. */
  onResumeProviderSession?: (sessionId: string) => void;
  onPlaceSessionInFolder: (
    sessionId: string,
    target: SessionFolderTarget,
  ) => void;
  onDeleteQueuedMessage: (sessionId: string, messageId: string) => void;
  onEditQueuedMessage: (
    sessionId: string,
    messageId: string,
    text: string,
    attachments: Attachment[],
  ) => void;
  onQueuedMessageEditingChange: (sessionId: string, messageId?: string) => void;
  onReorderQueuedMessages?: (sessionId: string, messageIds: string[]) => void;
  onSteerQueuedMessage: (sessionId: string, messageId: string) => void;
  onResumeQueue: (sessionId: string) => void;
  onUsageLimitResume: (sessionId: string) => void;
  onUsageLimitResumeAtReset: (sessionId: string, enabled: boolean) => void;
  onUsageLimitDismiss: (sessionId: string) => void;
  onInboxCardDismiss?: (sessionId: string) => void;
  onLinkedWorkItemUpdateCardDismiss?: (sessionId: string) => void;
  onNoteCardDismiss?: (sessionId: string) => void;
  onHandoffCardDismiss?: (sessionId: string) => void;
  onOpenLinkedWorkItem?: (item: LinkedWorkItem, sessionId: string) => void;
  onArchiveSession?: (sessionId: string, archived: boolean) => Promise<boolean>;
  onDeleteSession?: (sessionId: string) => Promise<boolean>;
  onApproval: (
    sessionId: string,
    requestId: number,
    decision: ApprovalDecision,
  ) => void;
  onQuestionReply: (
    sessionId: string,
    requestId: number,
    reply: UserQuestionReply,
  ) => void;
  onQuestionInteraction?: (sessionId: string, requestId: number) => void;
  onOpenFile: (path: string) => void;
  onOpenDiff: (
    path?: string,
    session?: { sessionId: string; cwd: string },
  ) => void;
  onOpenPlan: (sessionId: string, blockId: string) => void;
  onBuildPlan: (
    sessionId: string,
    blockId: string,
    target?: PlanBuildTarget,
  ) => void;
  onSecondOpinion?: (
    sessionId: string,
    target: ModelTarget,
    turn: Block[],
  ) => void;
  onHandoff?: (sessionId: string, target: ModelTarget, turn: Block[]) => void;
  onBtwSubmit?: (
    sessionId: string,
    turn: Block[],
    threadId: string,
    messageId: string,
    text: string,
    model?: string,
    modelSettings?: Record<string, string>,
  ) => boolean | void;
  onBtwRetry?: (sessionId: string, turn: Block[], threadId: string) => void;
  onBtwDelete?: (sessionId: string, turn: Block[], threadId: string) => void;
  onBtwStop?: (sessionId: string, turn: Block[], threadId: string) => void;
  onBtwModelChange?: (
    sessionId: string,
    turn: Block[],
    threadId: string,
    model: string,
    modelSettings: Record<string, string>,
  ) => void;
  onNewTerminal: (sessionId: string) => void;

  onPaneDragStart?: (event: ReactPointerEvent<HTMLElement>) => void;
  /** Keeps this transcript mounted after the pane closes. */
  transcriptPool?: TranscriptPool;
};

type Props = SessionPaneProps & {
  /** The session runtime is on another machine. */
  remoteSession?: boolean;
  remoteFeatures?: { attachments: boolean; plan: boolean; draft: boolean };
  /** An opened host conversation whose transcript has not arrived yet. */
  remoteSessionLoading?: boolean;
  remoteSessionStarted?: boolean;
  /** A host chat whose last turn the host lost: shows Continue, as a quit turn does locally. */
  interruptedTurn?: boolean;
  /** Why a message to the host cannot be delivered now; Send still tries to reconnect. */
  sendBlockedReason?: string;
  allowedModelHarnesses?: readonly HarnessId[];
};

export const SessionPane = memo(function SessionPane(props: SessionPaneProps) {
  // Sessions in a project on another machine render this same pane, backed by
  // the host instead of this computer's session runtime.
  if (isRemoteProjectPath(props.session.cwd))
    return (
      <RemoteSession
        shell={props.session}
        visible={props.visible}
        onSnapshot={props.onRemoteSnapshot}
        onOpenFile={props.onOpenFile}
        onOpenDiff={props.onOpenDiff}
        onOpenPlan={props.onOpenPlan}
        render={(remote) => <LocalSessionPane {...props} {...remote} />}
      />
    );
  return <LocalSessionPane {...props} />;
});

const LocalSessionPane = memo(function LocalSessionPane({
  remoteSession = false,
  remoteFeatures,
  remoteSessionLoading = false,
  remoteSessionStarted = false,
  interruptedTurn,
  sendBlockedReason,
  allowedModelHarnesses,
  session,
  workspaceSwitchingSessionId,
  windowMovingSessionIds,
  reviewUndoLocked = false,
  visible,
  focused,
  addToChatTarget = focused,
  inSplit,
  composerFocused,
  composerFocusToken,
  recents,
  hideProjectPicker,
  onFocus,
  onClose,
  onCwdChange,
  onBranchChange,
  onWorktreeChange,
  onWorkspaceModeChange,
  onWorktreeBaseChange,
  onManageWorktrees,
  onModelChange,
  onModelSettingsChange,
  onRuntimeModeChange,
  onSaveDraft,
  onRemoveDraft,
  onSubmit,
  onStop,
  onCompactContext,
  onPlaceSessionInFolder,
  onResumeProviderSession,
  onDeleteQueuedMessage,
  onEditQueuedMessage,
  onQueuedMessageEditingChange,
  onReorderQueuedMessages,
  onSteerQueuedMessage,
  onResumeQueue,
  onUsageLimitResume,
  onUsageLimitResumeAtReset,
  onUsageLimitDismiss,
  onInboxCardDismiss,
  onLinkedWorkItemUpdateCardDismiss,
  onNoteCardDismiss,
  onHandoffCardDismiss,
  onOpenLinkedWorkItem,
  onArchiveSession,
  onDeleteSession,
  onApproval,
  onQuestionReply,
  onQuestionInteraction,
  onOpenFile,
  onOpenDiff,
  onOpenPlan,
  onBuildPlan,
  onSecondOpinion,
  onHandoff,
  onBtwSubmit,
  onBtwRetry,
  onBtwDelete,
  onBtwStop,
  onBtwModelChange,
  onNewTerminal,
  onPaneDragStart,
  transcriptPool,
}: Props) {
  const orchestrationRuns = useSyncExternalStore(
    orchestrator.subscribe,
    orchestrator.snapshot,
    orchestrator.snapshot,
  );
  const managed = orchestrationRuns.some(
    (run) =>
      (run.status === "active" || run.status === "paused") &&
      sameCheckout(orchestrationCheckoutCwd(run), sessionWorkCwd(session)),
  );
  const title = sessionDisplayTitle(session.title, session.harness);
  const isEmpty = session.blocks.length === 0;
  const recallLastTurnRef = useRef<(() => void) | null>(null);
  const remote = remoteSession;
  const editLastTurnSupported = !remote && canEditLastTurn(session);
  const turnRecall = editLastTurnSupported ? lastTurnRecall(session) : null;
  const draftBlock = sessionDraftBlock(session);
  useSyncExternalStore(
    subscribeProjectChatBackground,
    projectChatBackgroundRevision,
    projectChatBackgroundRevision,
  );
  const globalBackgroundPath = useSyncExternalStore(
    subscribeChatBackgroundPath,
    loadChatBackgroundPath,
    loadChatBackgroundPath,
  );
  const globalBackgroundEffect = useSyncExternalStore(
    subscribeChatBackgroundPath,
    loadNewThreadBackgroundEffect,
    loadNewThreadBackgroundEffect,
  );
  const projectBackground = loadProjectChatBackgroundSettings(
    projectKey(session.cwd),
  );
  const projectBackgroundUrl = useProjectBackgroundEffect(
    projectBackground?.path ?? null,
    projectBackground?.effect ?? "none",
    projectChatBackgroundImageRevision(),
  );
  const projectBackgroundStyle = projectBackground
    ? ({
        "--chat-background-image": projectBackgroundUrl
          ? `url(${JSON.stringify(projectBackgroundUrl)})`
          : "none",
        "--chat-background-empty-opacity": String(
          projectBackground.emptyOpacity,
        ),
        "--chat-background-session-opacity": String(
          projectBackground.sessionOpacity,
        ),
      } as CSSProperties)
    : undefined;
  const approve = useCallback(
    (requestId: number, decision: ApprovalDecision) =>
      onApproval(session.id, requestId, decision),
    [onApproval, session.id],
  );
  const replyQuestion = useCallback(
    (requestId: number, reply: UserQuestionReply) =>
      onQuestionReply(session.id, requestId, reply),
    [onQuestionReply, session.id],
  );
  const openPlan = useCallback(
    (blockId: string) => onOpenPlan(session.id, blockId),
    [onOpenPlan, session.id],
  );
  const buildPlan = useCallback(
    (blockId: string, target?: PlanBuildTarget) =>
      onBuildPlan(session.id, blockId, target),
    [onBuildPlan, session.id],
  );
  const jumpToBottomRef = useRef<(() => void) | null>(null);
  const transcriptScope = useRef<HTMLDivElement>(null);
  const [transcriptScroller, setTranscriptScroller] =
    useState<HTMLDivElement | null>(null);
  const focusPane = useCallback(
    () => onFocus(session.id),
    [onFocus, session.id],
  );
  const quoteRequestId = useRef(0);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const [editingLastTurn, setEditingLastTurn] = useState(false);
  useEffect(() => {
    setEditingLastTurn(false);
  }, [session.id, editLastTurnSupported]);
  const modelWelcomeSequence = useRef(0);
  const [modelWelcome, setModelWelcome] = useState<{
    kind: "astra" | "opus";
    run: number;
  } | null>(null);
  const dismissModelWelcome = useCallback(() => setModelWelcome(null), []);
  useEffect(() => {
    if (!visible) setModelWelcome(null);
  }, [visible]);
  // Restore a saved run for this lead; its agents render on the sidebar card.
  useEffect(() => {
    if (!remote && !session.inboxAsk && !session.worktreeRemoved)
      void orchestrator.hydrate(session.id).catch(console.error);
  }, [remote, session.id, session.inboxAsk, session.worktreeRemoved]);
  const [quoteRequest, setQuoteRequest] = useState<QuoteRequest>();
  const btw = useBtwConversation({
    available:
      !remote &&
      !isEmpty &&
      !managed &&
      !session.inboxAsk &&
      !session.worktreeRemoved &&
      !!onBtwSubmit &&
      !!onBtwRetry &&
      (supportsBtwHarness(session.harness) ||
        sessionHasBtwThreads(session.blocks)),
    blocks: session.blocks,
    harness: session.harness,
    managed,
    model: session.model,
    modelSettings: session.modelSettings,
    onSubmit: (turn, threadId, messageId, text, model, modelSettings) =>
      onBtwSubmit?.(
        session.id,
        turn,
        threadId,
        messageId,
        text,
        model,
        modelSettings,
      ),
    onRetry: (turn, threadId) => onBtwRetry?.(session.id, turn, threadId),
    onDelete: (turn, threadId) => onBtwDelete?.(session.id, turn, threadId),
    onStop: (turn, threadId) => onBtwStop?.(session.id, turn, threadId),
    onModelChange: (turn, threadId, model, modelSettings) =>
      onBtwModelChange?.(session.id, turn, threadId, model, modelSettings),
  });
  const onJumpToBottomReady = useCallback((jump: () => void) => {
    jumpToBottomRef.current = jump;
  }, []);
  const revealBlockRef = useRef<((blockId: string) => boolean) | null>(null);
  const onRevealReady = useCallback((reveal: (blockId: string) => boolean) => {
    revealBlockRef.current = reveal;
  }, []);
  const revealBlock = useCallback(
    (blockId: string) => revealBlockRef.current?.(blockId) ?? false,
    [],
  );
  const navigateBlockRef = useRef<
    ((blockId: string | null, query?: string) => boolean) | null
  >(null);
  const [navigatorReady, setNavigatorReady] = useState(false);
  const onNavigateReady = useCallback(
    (navigate: (blockId: string | null, query?: string) => boolean) => {
      navigateBlockRef.current = navigate;
      setNavigatorReady(true);
    },
    [],
  );
  const navigateBlock = useCallback(
    (blockId: string | null, query?: string) =>
      navigateBlockRef.current?.(blockId, query) ?? false,
    [],
  );
  // The dock's rows: bring the run into view, and open it once it is there.
  const showAgentInTranscript = useCallback(
    (blockId: string) => {
      requestOpenSubagent(blockId);
      navigateBlock(blockId);
    },
    [navigateBlock],
  );
  const subagentSheet = useSubagentSheet(session.blocks, visible);
  const closeSubagentSheet = subagentSheet.close;
  // Claude can end one task on its own; the others only end the whole turn.
  const perItemStop = canStopHarnessBackgroundWork(session.harness);
  const stopBackground = (callId?: string) =>
    stopHarnessBackgroundWork(session.harness, session.id, callId);
  // Only one sheet over the pane at a time: a side question takes over.
  useEffect(() => {
    if (btw.open) closeSubagentSheet();
  }, [btw.open, closeSubagentSheet]);
  const openDockAgent = useCallback(
    (agent: DockAgent) => {
      if (agent.kind === "agent") requestViewSubagent(agent.blockId);
      else showAgentInTranscript(agent.blockId);
    },
    [showAgentInTranscript],
  );
  const jumpRequest = useSyncExternalStore(
    subscribeTranscriptJump,
    () => peekTranscriptJump(session.id),
    () => null,
  );
  useEffect(() => {
    if (!visible || !navigatorReady || !jumpRequest) return;
    const frame = requestAnimationFrame(() => {
      if (navigateBlock(jumpRequest.blockId, jumpRequest.query)) {
        clearTranscriptJump(session.id, jumpRequest.token);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [visible, navigatorReady, jumpRequest, navigateBlock, session.id]);
  const addSelectionToChat = useCallback(
    (text: string, mode?: QuoteRequest["mode"]) => {
      quoteRequestId.current += 1;
      setQuoteRequest({ id: quoteRequestId.current, text, mode });
    },
    [],
  );
  const acknowledgeQuote = useCallback((handledId: number) => {
    setQuoteRequest((current) => acknowledgeQuoteRequest(current, handledId));
  }, []);
  const notesEnabled = useSyncExternalStore(
    subscribeNotesEnabled,
    loadNotesEnabled,
    () => true,
  );
  const notesPanelOpen = useSyncExternalStore(
    subscribeNotesPanel,
    getNotesPanelOpen,
    () => false,
  );
  // One panel, docked beside the focused pane, so a split never shows two.
  const showNotesPanel = notesEnabled && notesPanelOpen && visible && focused;
  const paneRef = useRef<HTMLDivElement>(null);
  const notesPanelWasShown = useRef(false);
  useEffect(() => {
    // Closing the panel from the keyboard hands focus back to the composer.
    if (notesPanelWasShown.current && !showNotesPanel && visible && focused) {
      paneRef.current
        ?.querySelector<HTMLTextAreaElement>("[data-composer-box] textarea")
        ?.focus();
    }
    notesPanelWasShown.current = showNotesPanel;
  }, [showNotesPanel, visible, focused]);
  const saveNote = useCallback(
    async (text: string) => {
      const sessionTitle = sessionDisplayTitle(session.title, session.harness);
      await createNote({
        title:
          sessionTitle && sessionTitle !== "New session"
            ? sessionTitle
            : noteTitle(text),
        body: text,
        sourceSessionId: session.id,
        sourceCwd: session.cwd,
      });
    },
    [session.cwd, session.harness, session.id, session.title],
  );
  const saveSelectionNote = useCallback(
    async (text: string) => {
      await createNote({
        title: noteTitle(text),
        body: text,
        sourceSessionId: session.id,
        sourceCwd: session.cwd,
      });
    },
    [session.cwd, session.id],
  );

  useEffect(() => {
    if (!addToChatTarget) return;
    const onAdd = (event: Event) => {
      const detail = (event as CustomEvent<AddToChatRequest>).detail;
      if (!detail?.text) return;
      addSelectionToChat(detail.text, detail.mode);
    };
    window.addEventListener(ADD_TO_CHAT_EVENT, onAdd);
    return () => window.removeEventListener(ADD_TO_CHAT_EVENT, onAdd);
  }, [addSelectionToChat, addToChatTarget]);
  const workCwd = sessionWorkCwd(session);
  const showDeckProjectPicker = isEmpty && !looksLikeProject(session.cwd);
  const dockComposer =
    remoteSessionLoading ||
    (!draftBlock && (!isEmpty || inSplit || !!session.inboxAsk));
  const composerDockMotion = useComposerDockMotion(dockComposer);
  const draftRef = useRef<string | undefined>(getComposerDraft(session.id));
  const composer = (
    <Composer
      key={session.id}
      disabled={
        workspaceSwitchingSessionId === session.id ||
        windowMovingSessionIds?.has(session.id)
      }
      remoteSession={remoteSession}
      sendBlockedReason={sendBlockedReason}
      sendHeldReason={
        windowMovingSessionIds?.has(session.id)
          ? "Opening new window… Your draft will move with the conversation."
          : session.continuingElsewhere
            ? ADOPTED_RUNNING_REASON
            : undefined
      }
      remoteFeatures={remoteFeatures}
      allowedModelHarnesses={allowedModelHarnesses}
      enabled={visible}
      focused={focused && composerFocused && !btw.open}
      focusToken={composerFocusToken}
      hotkeys={focused && !btw.open}
      shell={!dockComposer}
      harness={session.harness}
      model={session.model}
      modelSettings={session.modelSettings}
      runtimeMode={session.runtimeMode}
      cwd={session.cwd}
      executionCwd={workCwd}
      sessionId={session.id}
      compactSupported={canCompactHarnessContext(session.harness)}
      recents={recents}
      hideProjectPicker={
        !!session.inboxAsk ||
        (hideProjectPicker ? !showDeckProjectPicker : false)
      }
      hideBranchPicker={!!session.inboxAsk || managed}
      hideTopBar={!!session.inboxAsk}
      context={session.context}
      sessionUsage={session.usage}
      quoteRequest={quoteRequest}
      initialDraft={
        draftRef.current ??
        (session.inboxCard || session.noteCard || session.handoffCard
          ? undefined
          : session.composerSeed)
      }
      onDraftChange={(text) => {
        draftRef.current = text;
        setComposerDraft(session.id, text);
      }}
      inboxCard={session.inboxCard}
      noteCard={session.noteCard}
      handoffCard={session.handoffCard}
      question={session.pendingQuestion}
      onQuoteRequestConsumed={acknowledgeQuote}
      onInboxCardDismiss={() => onInboxCardDismiss?.(session.id)}
      onNoteCardDismiss={() => onNoteCardDismiss?.(session.id)}
      onHandoffCardDismiss={() => onHandoffCardDismiss?.(session.id)}
      onQuestionReply={replyQuestion}
      onQuestionInteraction={(id) => onQuestionInteraction?.(session.id, id)}
      onFocus={() => onFocus(session.id)}
      onCwdChange={(cwd) => onCwdChange(session.id, cwd)}
      onBranchChange={() => onBranchChange(session.id)}
      onWorktreeChange={
        onWorktreeChange
          ? (tree) => onWorktreeChange(session.id, tree)
          : undefined
      }
      draftWorkspace={
        !session.inboxAsk &&
        !session.worktreeRemoved &&
        !managed &&
        (remote
          ? !remoteSessionStarted
          : (isEmpty || !!session.workspaceMode) && !session.worktreeCwd)
      }
      workspaceMode={session.workspaceMode}
      worktreeBase={session.worktreeBase}
      onWorkspaceModeChange={(mode, base) =>
        onWorkspaceModeChange(session.id, mode, base)
      }
      onWorktreeBaseChange={(base) => onWorktreeBaseChange(session.id, base)}
      worktreeRemoved={session.worktreeRemoved}
      onManageWorktrees={onManageWorktrees}
      onNewTerminal={() => onNewTerminal(session.id)}
      onModelChange={(harness, model) => {
        onModelChange(session.id, harness, model);
        const selected = resolveModel(harness, model);
        // A new key restarts the animation and its cleanup timer on every pick.
        const kind = isAstraModel(selected)
          ? "astra"
          : isOpus55Model(selected)
            ? "opus"
            : null;
        setModelWelcome(kind && { kind, run: ++modelWelcomeSequence.current });
      }}
      onModelSettingsChange={(settings) =>
        onModelSettingsChange(session.id, settings)
      }
      onRuntimeModeChange={(mode) => onRuntimeModeChange(session.id, mode)}
      canSaveDraft={
        (!remote || !!remoteFeatures?.draft) &&
        !session.busy &&
        !draftBlock &&
        !session.inboxAsk &&
        !session.inboxCard &&
        !session.noteCard &&
        !session.handoffCard
      }
      onSaveDraft={(text, attachments) =>
        onSaveDraft(session.id, text, attachments)
      }
      onSubmit={(text, attachments, options) => {
        if (!dockComposer) composerDockMotion.captureLaunch();
        return onSubmit(session.id, text, attachments, options);
      }}
      onBtwCommand={btw.openWith}
      onStop={() => onStop(session.id)}
      onCompactContext={() => onCompactContext(session.id)}
      onPlaceInFolder={(target) => onPlaceSessionInFolder(session.id, target)}
      onResumeProviderSession={
        onResumeProviderSession
          ? () => onResumeProviderSession(session.id)
          : undefined
      }
      queuedMessages={session.queuedMessages}
      queueStatus={session.queueStatus}
      onDeleteQueuedMessage={(messageId) =>
        onDeleteQueuedMessage(session.id, messageId)
      }
      onEditQueuedMessage={(messageId, text, attachments) =>
        onEditQueuedMessage(session.id, messageId, text, attachments)
      }
      onQueuedMessageEditingChange={(messageId) =>
        onQueuedMessageEditingChange(session.id, messageId)
      }
      onReorderQueuedMessages={
        onReorderQueuedMessages &&
        ((messageIds) => onReorderQueuedMessages(session.id, messageIds))
      }
      onSteerQueuedMessage={(messageId) =>
        onSteerQueuedMessage(session.id, messageId)
      }
      onResumeQueue={() => onResumeQueue(session.id)}
      usageLimit={session.usageLimit}
      onUsageLimitResume={() => onUsageLimitResume(session.id)}
      onUsageLimitResumeAtReset={(enabled) =>
        onUsageLimitResumeAtReset(session.id, enabled)
      }
      onUsageLimitDismiss={() => onUsageLimitDismiss(session.id)}
      onOpenFile={onOpenFile}
      busy={!!session.busy}
      backgroundOnly={isBackgroundOnly(
        !!session.busy,
        session.backgroundTasks,
        session.backgroundAgents,
      )}
      editLastTurnSupported={editLastTurnSupported}
      lastTurnRecall={turnRecall}
      promptHistory={() => userPromptHistory(session)}
      onRecallLastTurnReady={(recall) => {
        recallLastTurnRef.current = recall;
      }}
      onEditingLastTurnChange={setEditingLastTurn}
    >
      {/* Above the queue and the input, below any question form. */}
      <ActivityDock
        sessionId={session.id}
        blocks={session.blocks}
        busy={!!session.busy}
        pendingQuestion={!!session.pendingQuestion}
        backgroundTasks={session.backgroundTasks}
        backgroundAgents={session.backgroundAgents}
        visible={visible}
        atEnd={!showJumpToBottom}
        onOpenAgent={openDockAgent}
        perItemStop={perItemStop}
        onStopAgent={(agent) =>
          agent.callId
            ? stopBackground(agent.callId)
            : Promise.reject(new Error("No call to stop"))
        }
        onStopAll={() =>
          perItemStop ? stopBackground() : Promise.resolve(onStop(session.id))
        }
      />
      {(interruptedTurn ?? canAutoContinue(session)) &&
      !isAutoContinueDue(session.id) ? (
        <InterruptedNotice
          message={
            remote
              ? "The host stopped this turn before it finished."
              : undefined
          }
          onContinue={() => onSubmit(session.id, CONTINUE_PROMPT, [])}
        />
      ) : null}
    </Composer>
  );

  const notesShortcut = keybindingShortcutLabel(NOTES_PANEL_COMMAND, `${MOD}N`);
  const notesButton =
    notesEnabled && visible && focused && !showNotesPanel ? (
      <button
        type="button"
        title={`Notes${notesShortcut ? ` (${notesShortcut})` : ""}`}
        aria-label="Open notes panel"
        data-no-drag
        onPointerDown={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={toggleNotesPanel}
        className={
          inSplit
            ? "grid size-5 shrink-0 place-items-center rounded text-content/35 hover:bg-content/10 hover:text-content"
            : "absolute right-3 top-1.5 z-10 grid size-6 place-items-center rounded-md text-content/35 hover:bg-content/10 hover:text-content"
        }
      >
        <File className="size-3.5" strokeWidth={1.75} />
      </button>
    ) : null;

  const pane = (
    <div
      ref={paneRef}
      data-session-drop={session.id}
      data-session-empty={isEmpty}
      data-project-chat-background={!!projectBackground}
      data-project-background-effect={projectBackground?.effect}
      data-project-background-scope={projectBackground?.scope}
      style={projectBackgroundStyle}
      className="chat-pane-background relative isolate flex h-full min-h-0 min-w-0 flex-1 flex-col"
      onMouseDown={() => onFocus(session.id)}
    >
      {projectBackground?.effect === "gradient-blur" ||
      (!projectBackground &&
        globalBackgroundPath &&
        globalBackgroundEffect === "gradient-blur") ? (
        <GradientBlurBackground />
      ) : null}
      {modelWelcome && visible ? (
        modelWelcome.kind === "astra" ? (
          <AstraWelcome key={modelWelcome.run} onDone={dismissModelWelcome} />
        ) : (
          <OpusWelcome key={modelWelcome.run} onDone={dismissModelWelcome} />
        )
      ) : null}
      {inSplit ? (
        <div
          className={`flex h-9 shrink-0 touch-none items-center gap-1.5 border-b border-stroke px-2 select-none ${
            onPaneDragStart ? "cursor-grab active:cursor-grabbing" : ""
          }`}
          onPointerDown={(event) => {
            if (event.button !== 0 || !onPaneDragStart) return;
            if (
              (event.target as HTMLElement | null)?.closest("[data-no-drag]")
            ) {
              return;
            }
            onPaneDragStart(event);
          }}
        >
          {onPaneDragStart ? (
            <GripVertical
              className="size-3.5 shrink-0 text-content/35"
              strokeWidth={1.75}
            />
          ) : null}
          <span
            className={`size-2 shrink-0 rounded-full ${focused ? "bg-accent" : "bg-transparent"}`}
          />
          <span
            className="min-w-0 flex-1 truncate text-xs text-content"
            title={title}
          >
            {title}
          </span>
          {notesButton}
          <button
            type="button"
            title={`Close Pane (${MOD}W)`}
            aria-label="Close pane"
            data-no-drag
            className="grid size-5 shrink-0 place-items-center rounded text-content/50 hover:bg-content/10 hover:text-content"
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onClose(session.id);
            }}
          >
            <X className="size-3" strokeWidth={1.75} />
          </button>
        </div>
      ) : null}
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        {session.adoptedSyncConflict ? (
          <div
            role="alert"
            className="shrink-0 border-b border-amber-400/20 bg-amber-400/5 px-4 py-2 text-xs text-content/80"
          >
            {ADOPTED_CONFLICT_MESSAGE}
          </div>
        ) : null}
        <div
          ref={transcriptScope}
          className="@container relative min-h-0 flex-1"
        >
          {visible && focused && !session.inboxAsk ? (
            <LinkedWorkItemUpdateNotice
              sessionId={session.id}
              card={session.linkedWorkItemUpdateCard}
              onAcknowledge={() => {
                const updatedAt = session.linkedWorkItemUpdateCard?.updatedAt;
                if (updatedAt != null) {
                  markLinkedSessionUpdateSeen(session.id, updatedAt);
                }
              }}
              onDismiss={() => onLinkedWorkItemUpdateCardDismiss?.(session.id)}
              onOpenDiscussion={() => {
                if (session.linkedWorkItem) {
                  onOpenLinkedWorkItem?.(session.linkedWorkItem, session.id);
                }
              }}
              onAddToChat={(text) => addSelectionToChat(text, "plain")}
              onArchiveSession={
                onArchiveSession
                  ? () => onArchiveSession(session.id, true)
                  : undefined
              }
              onDeleteSession={
                onDeleteSession ? () => onDeleteSession(session.id) : undefined
              }
            />
          ) : null}
          {remoteSessionLoading ? (
            <div
              role="status"
              className="flex h-full min-h-0 items-center justify-center gap-2 text-[13px] text-content/50"
            >
              <Loader
                className="size-4 shrink-0 animate-spin"
                strokeWidth={1.75}
                aria-hidden
              />
              Loading conversation…
            </div>
          ) : isEmpty ? (
            session.inboxAsk ? (
              <div className="scrollbar-none h-full min-h-0 overflow-y-auto">
                <DiscussionEmpty message="Explore this item with your agent." />
              </div>
            ) : (
              <EmptySession
                cwd={session.cwd}
                hasChatBackground={Boolean(
                  projectBackground || globalBackgroundPath,
                )}
                composer={
                  dockComposer ? undefined : (
                    <div
                      ref={composerDockMotion.centeredRef}
                      data-session-composer
                    >
                      {composer}
                    </div>
                  )
                }
              />
            )
          ) : (
            <>
              <PooledTranscript
                pool={transcriptPool}
                sessionId={session.id}
                onMouseDown={focusPane}
              >
                <AgentTranscript
                  blocks={session.blocks}
                  busy={!!session.busy}
                  visible={visible}
                  cwd={workCwd}
                  harness={session.harness}
                  model={session.model}
                  modelSettings={session.modelSettings}
                  pendingQuestion={!!session.pendingQuestion}
                  backgroundTasks={session.backgroundTasks}
                  backgroundAgents={session.backgroundAgents}
                  onApproval={session.worktreeRemoved ? undefined : approve}
                  onAddToChat={addSelectionToChat}
                  onSaveNote={notesEnabled ? saveNote : undefined}
                  onSendDraft={
                    draftBlock
                      ? (block) =>
                          onSubmit(
                            session.id,
                            block.text,
                            block.attachments ?? [],
                            {
                              draftBlockId: block.id,
                              ...(block.appRequestId
                                ? { appRequestId: block.appRequestId }
                                : {}),
                            },
                          )
                      : undefined
                  }
                  onRemoveDraft={
                    draftBlock
                      ? (block) => onRemoveDraft(session.id, block.id)
                      : undefined
                  }
                  onSaveSelectionNote={
                    notesEnabled ? saveSelectionNote : undefined
                  }
                  onOpenFile={onOpenFile}
                  onOpenDiff={onOpenDiff}
                  onOpenPlan={openPlan}
                  onBuildPlan={session.worktreeRemoved ? undefined : buildPlan}
                  planBuildTargets={!remote}
                  onSecondOpinion={
                    !session.inboxAsk &&
                    !session.worktreeRemoved &&
                    onSecondOpinion
                      ? (target, turn) =>
                          onSecondOpinion(session.id, target, turn)
                      : undefined
                  }
                  onHandoff={
                    !session.inboxAsk && !session.worktreeRemoved && onHandoff
                      ? (target, turn) => onHandoff(session.id, target, turn)
                      : undefined
                  }
                  onJumpToBottomChange={setShowJumpToBottom}
                  onJumpToBottomReady={onJumpToBottomReady}
                  onRevealReady={onRevealReady}
                  onNavigateReady={onNavigateReady}
                  onScrollerChange={setTranscriptScroller}
                  editingLastTurn={editingLastTurn}
                  onEditLastTurn={
                    editLastTurnSupported
                      ? () => {
                          onFocus(session.id);
                          recallLastTurnRef.current?.();
                        }
                      : undefined
                  }
                  latestTurnAccessory={
                    remote ||
                    session.inboxAsk ||
                    session.worktreeRemoved ||
                    draftBlock ? undefined : (
                      <SessionReview
                        sessionId={session.id}
                        cwd={workCwd}
                        enabled={visible}
                        busy={!!session.busy}
                        undoLocked={
                          reviewUndoLocked ||
                          orchestrationRuns.some(
                            (run) =>
                              (run.status === "active" ||
                                run.status === "paused") &&
                              (run.leadId === session.id ||
                                run.tasks.some(
                                  (task) => task.sessionId === session.id,
                                )),
                          )
                        }
                        onOpenDiff={onOpenDiff}
                      />
                    )
                  }
                />
              </PooledTranscript>
              {!session.inboxAsk ? (
                <TranscriptFind
                  sessionId={session.id}
                  blocks={session.blocks}
                  visible={visible}
                  focused={focused}
                  onNavigate={navigateBlock}
                  side={
                    session.linkedWorkItemUpdateCard &&
                    session.linkedWorkItemUpdateCard.status !== "loading"
                      ? "left"
                      : "right"
                  }
                />
              ) : null}
              <PromptOutline
                blocks={session.blocks}
                scope={transcriptScope}
                scroller={transcriptScroller}
                visible={visible}
                revealBlock={revealBlock}
              />
              {showJumpToBottom ? (
                <div className="pointer-events-none absolute inset-x-0 bottom-2 z-30 flex justify-center">
                  <button
                    type="button"
                    title="Jump to latest"
                    aria-label="Jump to latest"
                    data-jump-to-bottom
                    onClick={() => jumpToBottomRef.current?.()}
                    className="pointer-events-auto grid size-6 place-items-center rounded-md border border-content/15 bg-content/10 text-content shadow-md hover:bg-content/5 backdrop-blur-md"
                  >
                    <ChevronDown className="size-4" strokeWidth={2} />
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
        {dockComposer ? (
          <div
            ref={composerDockMotion.dockedRef}
            data-session-composer
            inert={btw.open}
            className="mx-auto w-full max-w-4xl shrink-0"
          >
            {composer}
          </div>
        ) : null}
        <BtwSheet
          btw={btw}
          cwd={workCwd}
          visible={visible}
          origin={() =>
            composerDockMotion.dockedRef.current?.querySelector<HTMLElement>(
              "[data-composer-box]",
            ) ?? null
          }
          onSaveNote={notesEnabled ? saveNote : undefined}
          onOpenFile={onOpenFile}
          onOpenDiff={onOpenDiff}
        />
        {subagentSheet.block ? (
          <SubagentSheet
            block={subagentSheet.block}
            busy={!!session.busy}
            visible={visible}
            cwd={workCwd}
            onClose={closeSubagentSheet}
            onStop={
              perItemStop && subagentSheet.block.tool?.callId
                ? () => stopBackground(subagentSheet.block?.tool?.callId)
                : undefined
            }
            onShowInTranscript={(blockId) => {
              closeSubagentSheet();
              showAgentInTranscript(blockId);
            }}
            onOpenFile={onOpenFile}
            onOpenDiff={onOpenDiff}
          />
        ) : null}
      </div>
    </div>
  );
  return (
    <div className="relative flex h-full min-h-0 min-w-0 flex-1">
      {pane}
      {showNotesPanel ? (
        <SessionNotesPanel sessionId={session.id} cwd={session.cwd} />
      ) : !inSplit ? (
        notesButton
      ) : null}
    </div>
  );
});
