import { t, useLocale } from "../../../shared/i18n";
import {
  memo,
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  setDropFeedback,
  setGrabbing,
  suppressTextSelection,
} from "../../../shared/lib/drag";
import {
  isPointerOutsideWindow,
  popOutPosition,
  type WindowMovePosition,
} from "../../../app/model/windowTransferPopout";
import { beginWindowTabDrag } from "../../../app/model/windowDragPreview";
import {
  paneDropFromPoint,
  setExternalTitleTabDrop,
  titleTabDropFromPoint,
  useExternalPaneDrop,
  type TitleTabDropPosition,
} from "../model/paneDrop";
import type {
  ApprovalDecision,
  UserQuestionReply,
} from "../../../integrations/harness";
import type { EditorNavigationTarget } from "../../search/model/search";
import type { ProjectAction } from "../../projects/model/projectActions";
import type { ProviderAccountProvider } from "../../providers/model/providerAccounts";
import {
  layoutLeaves,
  layoutSashes,
  setSplitRatio,
  type EditorPane,
  type LayoutLeaf,
  type LayoutNode,
  type LayoutSash,
  type PaneEdge,
} from "../model/layout";
import {
  sameProjectPath,
  type RecentProject,
} from "../../projects/model/recents";
import type { TerminalMetaPatch } from "../../terminal/model/terminalTab";
import {
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
} from "../../sessions/model/session";
import { FilePane } from "../../files/ui/FilePane";
import { SessionPane } from "../../sessions/ui/SessionPane";
import type { TranscriptPool } from "../../sessions/ui/TranscriptPool";
import type { SessionFolderTarget } from "../../sessions/model/sessionFolders";
import type { Worktree } from "../../source-control/model/worktrees";

type Shared = {
  workspaceSwitchingSessionId?: string;
  visible: boolean;
  sessions: Session[];
  editorPanes: EditorPane[];
  dirtyFileIds: Set<string>;
  fileErrorCounts: Map<string, number>;
  focusedId: string;
  addToChatSessionId?: string;
  composerFocused: boolean;
  composerFocusToken?: number;
  recents: RecentProject[];
  hideProjectPicker?: boolean;
  onFocus: (paneId: string) => void;
  onClose: (sessionId: string) => void;
  onSelectFile: (paneId: string, fileId: string) => void;
  onCloseFile: (paneId: string, fileId: string) => void;
  onCloseOtherFiles: (paneId: string, fileId: string) => void;
  onOpenInNewWindow?: (paneId: string, fileId: string) => void;
  onPinFile?: (fileId: string) => void;
  onReorderFiles: (paneId: string, ids: string[]) => void;
  onFileDirtyChange: (fileId: string, dirty: boolean) => void;
  onFileErrorCountChange: (fileId: string, count: number) => void;
  onRatio: (splitId: string, index: number, ratio: number) => void;
  onCwdChange: (sessionId: string, cwd: string) => void;
  onBranchChange: (sessionId: string) => void;
  onWorktreeChange?: (sessionId: string, tree: Worktree) => Promise<void>;
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
  onPlaceSessionInFolder: (
    sessionId: string,
    target: SessionFolderTarget,
  ) => void;
  onResumeProviderSession?: (sessionId: string) => void;
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
  onSelectProviderAccount?: (
    sessionId: string,
    provider: ProviderAccountProvider,
    accountId: string,
  ) => void;
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
  editorNavigation?: EditorNavigationTarget | null;
  onOpenDiff: (
    path?: string,
    session?: { sessionId: string; cwd: string },
  ) => void;
  onOpenPlan: (sessionId: string, blockId: string) => void;
  onUpdatePlan: (sessionId: string, blockId: string, text: string) => void;
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
  onMovePane: (fromId: string, toId: string, edge: PaneEdge) => void;
  onPopOutPane?: (paneId: string, position: WindowMovePosition) => void;
  onDetachPane: (
    paneId: string,
    targetTabId: string,
    position: TitleTabDropPosition,
  ) => void;
  onNewTerminal: (sessionId: string) => void;
  onRunProjectAction?: (sessionId: string, action: ProjectAction) => void;
  onTerminalMetaChange?: (fileId: string, patch: TerminalMetaPatch) => void;
  transcriptPool?: TranscriptPool;
};

type Props = Shared & { layout: LayoutNode };

type PaneDrag = {
  fromId: string;
  overId: string | null;
  edge: PaneEdge;
};

const DRAG_THRESHOLD = 5;

function PaneTreeComponent({
  visible,
  layout,
  sessions,
  editorPanes,
  dirtyFileIds,
  fileErrorCounts,
  focusedId,
  addToChatSessionId,
  composerFocused,
  composerFocusToken,
  recents,
  hideProjectPicker,
  workspaceSwitchingSessionId,
  onFocus,
  onClose,
  onSelectFile,
  onCloseFile,
  onCloseOtherFiles,
  onOpenInNewWindow,
  onPinFile,
  onReorderFiles,
  onFileDirtyChange,
  onFileErrorCountChange,
  onRatio,
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
  onSelectProviderAccount,
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
  editorNavigation,
  onOpenDiff,
  onOpenPlan,
  onUpdatePlan,
  onBuildPlan,
  onSecondOpinion,
  onBtwSubmit,
  onBtwRetry,
  onBtwDelete,
  onBtwStop,
  onBtwModelChange,
  onHandoff,
  onMovePane,
  onDetachPane,
  onPopOutPane,
  onNewTerminal,
  onRunProjectAction,
  onTerminalMetaChange,
  transcriptPool,
}: Props) {
  useLocale();
  const treeRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const [draft, setDraft] = useState<LayoutNode | null>(null);
  const [paneDrag, setPaneDrag] = useState<PaneDrag | null>(null);
  const externalDrop = useExternalPaneDrop(visible);
  const drop = paneDrag ?? externalDrop;
  const onMovePaneRef = useRef(onMovePane);
  onMovePaneRef.current = onMovePane;
  const onDetachPaneRef = useRef(onDetachPane);
  onDetachPaneRef.current = onDetachPane;
  const onPopOutPaneRef = useRef(onPopOutPane);
  onPopOutPaneRef.current = onPopOutPane;
  const dragContents = useRef({ editorPanes, sessions });
  dragContents.current = { editorPanes, sessions };
  const onFocusRef = useRef(onFocus);
  onFocusRef.current = onFocus;
  const cancelPaneDrag = useRef<(() => void) | null>(null);
  useEffect(() => () => cancelPaneDrag.current?.(), []);

  useEffect(() => {
    setDraft(null);
  }, [layout]);

  // A sash drag re-renders this tree every frame. `SessionPane` compares props
  // shallowly, so handing it a fresh drag handler each frame would re-render
  // the whole session subtree (transcript, composer, picker) per frame.
  const dragHandlers = useRef(
    new Map<string, (event: ReactPointerEvent<HTMLElement>) => void>(),
  );
  const paneDragStartFor = (paneId: string) => {
    const cached = dragHandlers.current.get(paneId);
    if (cached) return cached;
    const handler = (event: ReactPointerEvent<HTMLElement>) =>
      startPaneDrag(paneId, event);
    dragHandlers.current.set(paneId, handler);
    return handler;
  };

  const tree = draft ?? layout;
  const leaves = layoutLeaves(tree);
  // Keep inactive group members mounted: editors retain unsaved buffers and
  // sessions retain their composer and streaming subscriptions.
  const renderLeaves = leaves.flatMap((pane) =>
    (pane.tabIds ?? [pane.id]).map((id) => ({ ...pane, id, hidden: id !== pane.id })),
  );
  const sashes = layoutSashes(tree);
  const inSplit = leaves.length > 1;

  // A pane split into an existing layout slides in from the edge it was added
  // on, like the linked work item panel. The neighbours reflow once up front;
  // only the new pane's content moves, so nothing rewraps mid-animation.
  // Panes present when the tree mounts, or swapped in place, just appear.
  const knownLeafIds = useRef<ReadonlySet<string> | null>(null);
  const enteringPanes = useRef(new Map<string, PaneEnterFrom>());
  const [, rerender] = useReducer((tick: number) => tick + 1, 0);
  if (knownLeafIds.current && leaves.length > knownLeafIds.current.size) {
    for (const leaf of leaves) {
      if (knownLeafIds.current.has(leaf.id)) continue;
      if (
        !document.hidden &&
        !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
      )
        enteringPanes.current.set(leaf.id, paneEnterFrom(leaf));
    }
  }
  knownLeafIds.current = new Set(leaves.map((leaf) => leaf.id));
  for (const id of enteringPanes.current.keys()) {
    if (!knownLeafIds.current.has(id)) enteringPanes.current.delete(id);
  }

  const enteringIds = [...enteringPanes.current.keys()].join("\0");
  useEffect(() => {
    if (!enteringIds) return;
    const finish = () => {
      enteringPanes.current.clear();
      rerender();
    };
    const timer = window.setTimeout(finish, 320);
    const onVisibility = () => {
      if (document.hidden) finish();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enteringIds]);

  const startPaneDrag = useCallback(
    (fromId: string, event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      cancelPaneDrag.current?.();
      const handle = event.currentTarget;
      const pointerId = event.pointerId;
      const startX = event.clientX;
      const startY = event.clientY;
      let active = false;
      let windowDrag: ReturnType<typeof beginWindowTabDrag> | undefined;
      const canPopOut = () =>
        Boolean(onPopOutPaneRef.current) &&
        !dragContents.current.editorPanes
          .find((pane) => pane.id === fromId)
          ?.files.some((file) => file.terminal);

      let lastX = startX;
      let lastY = startY;
      let screenX = event.screenX;
      let screenY = event.screenY;
      handle.setPointerCapture(pointerId);
      const restoreSelection = suppressTextSelection();
      const dropTarget = (x: number, y: number) => {
        const over = paneDropFromPoint(x, y);
        if (over?.id !== fromId) return over;
        const group = layoutLeaves(layoutRef.current).find((pane) => pane.id === fromId);
        const sibling = group?.tabIds?.find((id) => id !== fromId);
        return sibling ? { ...over, id: sibling } : over;
      };

      const onMove = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        lastX = ev.clientX;
        lastY = ev.clientY;
        screenX = ev.screenX;
        screenY = ev.screenY;
        if (!active) {
          if (
            Math.hypot(ev.clientX - startX, ev.clientY - startY) <
            DRAG_THRESHOLD
          ) {
            return;
          }
          active = true;
          setGrabbing(true);
          onFocusRef.current(fromId);
          setPaneDrag({ fromId, overId: null, edge: "left" });
        }
        const titleTab = titleTabDropFromPoint(ev.clientX, ev.clientY);
        if (canPopOut()) {
          windowDrag ??= beginWindowTabDrag(fromId);
          windowDrag.move(ev);
        }
        setExternalTitleTabDrop(titleTab ? { fromId, ...titleTab } : null);
        if (
          canPopOut() &&
          isPointerOutsideWindow(
            ev.clientX,
            ev.clientY,
            window.innerWidth,
            window.innerHeight,
          )
        ) {
          setDropFeedback(
            "window",
            ev,
            dragContents.current.sessions.find(
              (session) => session.id === fromId,
            )?.busy
              ? "Move after response finishes"
              : undefined,
          );
          setPaneDrag({ fromId, overId: null, edge: "left" });
          return;
        }
        if (titleTab) {
          setDropFeedback("move", ev, "Release to create a tab");
          setPaneDrag({ fromId, overId: null, edge: "left" });
          return;
        }
        const over = dropTarget(ev.clientX, ev.clientY);
        if (!over || (over.id === fromId && over.edge === "center")) {
          setDropFeedback("blocked", ev);
          setPaneDrag({
            fromId,
            overId: over?.id === fromId ? fromId : null,
            edge: over?.edge ?? "left",
          });
          return;
        }
        setPaneDrag({ fromId, overId: over.id, edge: over.edge });
        setDropFeedback("move", ev, over.id === fromId ? `Split ${over.edge} with a new session` : over.edge === "center" ? "Add as pane tab" : `Place ${over.edge}`);
      };

      const onUp = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        onMove(ev);
        finish(true);
      };
      const onCancel = () => finish(false);
      const onKey = (ev: KeyboardEvent) => {
        if (ev.key !== "Escape") return;
        ev.preventDefault();
        finish(false);
      };

      function finish(commit: boolean) {
        windowDrag?.finish();
        cancelPaneDrag.current = null;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onCancel);
        window.removeEventListener("keydown", onKey);
        restoreSelection();
        setGrabbing(false);
        setPaneDrag(null);
        setExternalTitleTabDrop(null);
        try {
          handle.releasePointerCapture(pointerId);
        } catch {
          /* already released */
        }
        if (!active || !commit) return;
        if (
          canPopOut() &&
          isPointerOutsideWindow(
            lastX,
            lastY,
            window.innerWidth,
            window.innerHeight,
          )
        ) {
          onPopOutPaneRef.current?.(fromId, {
            ...popOutPosition(screenX, screenY),
            clientX: lastX,
            clientY: lastY,
          });
          return;
        }
        const titleTab = titleTabDropFromPoint(lastX, lastY);
        if (titleTab) {
          onDetachPaneRef.current(
            fromId,
            titleTab.targetTabId,
            titleTab.position,
          );
          return;
        }
        const over = dropTarget(lastX, lastY);
        if (over && (over.id !== fromId || over.edge !== "center")) {
          onMovePaneRef.current(fromId, over.id, over.edge);
        }
      }

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onCancel);
      window.addEventListener("keydown", onKey);
      cancelPaneDrag.current = onCancel;
    },
    [],
  );

  return (
    <div ref={treeRef} className="relative h-full min-h-0 min-w-0">
      {renderLeaves.map((leaf) => {
        const editorPane = editorPanes.find((pane) => pane.id === leaf.id);
        const session = sessions.find((entry) => entry.id === leaf.id);
        const dragging = drop?.fromId === leaf.id;
        const onPaneDragStart = paneDragStartFor(leaf.id);
        const backgroundStyle = {
          "--chat-background-left": `${(-leaf.rect.x / leaf.rect.w) * 100}%`,
          "--chat-background-top": `${(-leaf.rect.y / leaf.rect.h) * 100}%`,
          "--chat-background-width": `${100 / leaf.rect.w}%`,
          "--chat-background-height": `${100 / leaf.rect.h}%`,
        } as CSSProperties;
        return (
          <div
            key={leaf.id}
            data-pane-id={leaf.hidden ? undefined : leaf.id}
            className={`absolute flex min-h-0 min-w-0 flex-col overflow-hidden ${dragging ? "opacity-40" : ""}`}
            // The new pane focuses its composer or editor while it is still
            // offscreen, and focus scrolls this clip box to reveal it, which
            // fights the slide. Scroll events land before paint, so undoing
            // it here never shows.
            onScroll={(event) => {
              if (!enteringPanes.current.has(leaf.id)) return;
              event.currentTarget.scrollLeft = 0;
              event.currentTarget.scrollTop = 0;
            }}
            style={{
              display: leaf.hidden ? "none" : undefined,
              left: `${leaf.rect.x * 100}%`,
              top: `${leaf.rect.y * 100}%`,
              width: `${leaf.rect.w * 100}%`,
              height: `${leaf.rect.h * 100}%`,
              ...backgroundStyle,
            }}
          >
            {leaf.tabIds && leaf.tabIds.length > 1 ? (
              <div role="tablist" aria-label={t("Pane sessions")} className="flex shrink-0 overflow-x-auto border-b border-stroke bg-surface">
                {leaf.tabIds.map((id) => (
                  <button key={id} type="button" role="tab" aria-selected={id === leaf.id}
                    className={`max-w-48 shrink-0 truncate border-r border-stroke px-3 py-1.5 text-xs ${id === leaf.id ? "bg-accent/15 text-content" : "text-content/60"}`}
                    onClick={() => onFocus(id)} onPointerDown={paneDragStartFor(id)}
                    title={sessions.find((entry) => entry.id === id)?.title || t("Session")}>
                    {sessions.find((entry) => entry.id === id)?.title || editorPanes.find((pane) => pane.id === id)?.files[0]?.path.split(/[\\/]/).pop() || t("Session")}
                  </button>
                ))}
              </div>
            ) : null}
            {drop && !leaf.hidden && (drop.overId === leaf.id || leaf.tabIds?.includes(drop.overId ?? "")) && (drop.fromId !== leaf.id || drop.edge !== "center" || (leaf.tabIds?.length ?? 0) > 1) ? (
              <PaneDropHint edge={drop.edge} />
            ) : null}
            <div
              className="flex min-h-0 min-w-0 flex-1 flex-col"
              data-pane-enter={enteringPanes.current.get(leaf.id)}
              onAnimationEnd={(event) => {
                if (event.target !== event.currentTarget) return;
                if (enteringPanes.current.delete(leaf.id)) rerender();
              }}
            >
              {editorPane ? (
                <FilePane
                  pane={editorPane}
                  focused={focusedId === editorPane.id}
                  showTabs={inSplit || editorPane.files.length > 1 || Boolean(onPaneDragStart)}
                  dirtyFileIds={dirtyFileIds}
                  fileErrorCounts={fileErrorCounts}
                  sessions={sessions}
                  onFocus={onFocus}
                  onSelectFile={onSelectFile}
                  onCloseFile={onCloseFile}
                  onCloseOtherFiles={onCloseOtherFiles}
                  onOpenInNewWindow={onOpenInNewWindow}
                  onPinFile={onPinFile}
                  onReorderFiles={onReorderFiles}
                  onDirtyChange={onFileDirtyChange}
                  onErrorCountChange={onFileErrorCountChange}
                  onOpenFile={onOpenFile}
                  onUpdatePlan={onUpdatePlan}
                  onBuildPlan={onBuildPlan}
                  editorNavigation={editorNavigation}
                  onPaneDragStart={onPaneDragStart}
                  onTerminalMetaChange={onTerminalMetaChange}
                />
              ) : session ? (
                <SessionPane
                  session={session}
                  workspaceSwitchingSessionId={workspaceSwitchingSessionId}
                  reviewUndoLocked={sessions.some(
                    (other) =>
                      other.id !== session.id &&
                      other.busy &&
                      sameProjectPath(
                        sessionWorkCwd(other),
                        sessionWorkCwd(session),
                      ),
                  )}
                  visible={visible && !leaf.hidden}
                  focused={focusedId === session.id}
                  addToChatTarget={addToChatSessionId === session.id}
                  inSplit={inSplit}
                  composerFocused={composerFocused}
                  composerFocusToken={composerFocusToken}
                  recents={recents}
                  hideProjectPicker={hideProjectPicker}
                  onFocus={onFocus}
                  onClose={onClose}
                  onCwdChange={onCwdChange}
                  onBranchChange={onBranchChange}
                  onWorktreeChange={onWorktreeChange}
                  onWorkspaceModeChange={onWorkspaceModeChange}
                  onWorktreeBaseChange={onWorktreeBaseChange}
                  onManageWorktrees={onManageWorktrees}
                  onModelChange={onModelChange}
                  onModelSettingsChange={onModelSettingsChange}
                  onRuntimeModeChange={onRuntimeModeChange}
                  onSaveDraft={onSaveDraft}
                  onRemoveDraft={onRemoveDraft}
                  onSubmit={onSubmit}
                  onStop={onStop}
                  onCompactContext={onCompactContext}
                  onPlaceSessionInFolder={onPlaceSessionInFolder}
                  onResumeProviderSession={onResumeProviderSession}
                  onDeleteQueuedMessage={onDeleteQueuedMessage}
                  onEditQueuedMessage={onEditQueuedMessage}
                  onQueuedMessageEditingChange={onQueuedMessageEditingChange}
                  onReorderQueuedMessages={onReorderQueuedMessages}
                  onSteerQueuedMessage={onSteerQueuedMessage}
                  onResumeQueue={onResumeQueue}
                  onUsageLimitResume={onUsageLimitResume}
                  onUsageLimitResumeAtReset={onUsageLimitResumeAtReset}
                  onUsageLimitDismiss={onUsageLimitDismiss}
                  onSelectProviderAccount={onSelectProviderAccount}
                  onInboxCardDismiss={onInboxCardDismiss}
                  onLinkedWorkItemUpdateCardDismiss={
                    onLinkedWorkItemUpdateCardDismiss
                  }
                  onNoteCardDismiss={onNoteCardDismiss}
                  onHandoffCardDismiss={onHandoffCardDismiss}
                  onOpenLinkedWorkItem={onOpenLinkedWorkItem}
                  onArchiveSession={onArchiveSession}
                  onDeleteSession={onDeleteSession}
                  onApproval={onApproval}
                  onQuestionReply={onQuestionReply}
                  onQuestionInteraction={onQuestionInteraction}
                  onOpenFile={onOpenFile}
                  onOpenDiff={onOpenDiff}
                  onOpenPlan={onOpenPlan}
                  onBuildPlan={onBuildPlan}
                  onSecondOpinion={onSecondOpinion}
                  onHandoff={onHandoff}
                  onBtwSubmit={onBtwSubmit}
                  onBtwRetry={onBtwRetry}
                  onBtwDelete={onBtwDelete}
                  onBtwStop={onBtwStop}
                  onBtwModelChange={onBtwModelChange}
                  onNewTerminal={onNewTerminal}
                  onRunProjectAction={onRunProjectAction}
                  onPaneDragStart={onPaneDragStart}
                  transcriptPool={transcriptPool}
                />
              ) : null}
            </div>
          </div>
        );
      })}
      {sashes.map((sash) => (
        <Sash
          key={`${sash.splitId}:${sash.index}`}
          sash={sash}
          containerRef={treeRef}
          onPreview={(ratio) =>
            setDraft(
              setSplitRatio(layoutRef.current, sash.splitId, sash.index, ratio),
            )
          }
          onCommit={(ratio) => {
            setDraft(null);
            onRatio(sash.splitId, sash.index, ratio);
          }}
          onCancel={() => setDraft(null)}
        />
      ))}
    </div>
  );
}

export const PaneTree = memo(
  PaneTreeComponent,
  (previous, next) => !previous.visible && !next.visible,
);

type PaneEnterFrom = "left" | "right" | "top" | "bottom" | "fade";

function paneEnterFrom({ rect, axis }: LayoutLeaf): PaneEnterFrom {
  const edge = 0.001;
  if (axis === "x") {
    if (rect.x + rect.w >= 1 - edge) return "right";
    if (rect.x <= edge) return "left";
  } else {
    if (rect.y + rect.h >= 1 - edge) return "bottom";
    if (rect.y <= edge) return "top";
  }
  return "fade";
}

function PaneDropHint({ edge }: { edge: PaneEdge }) {
  useLocale();
  if (edge === "center") return (
    <div className="pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded border-2 border-accent bg-accent/15">
      <span className="rounded bg-surface px-3 py-2 text-xs text-content">{t("Add as pane tab")}</span>
    </div>
  );
  const wash =
    edge === "left"
      ? "absolute inset-y-0 left-0 w-1/2 bg-accent/15"
      : edge === "right"
        ? "absolute inset-y-0 right-0 w-1/2 bg-accent/15"
        : edge === "top"
          ? "absolute inset-x-0 top-0 h-1/2 bg-accent/15"
          : "absolute inset-x-0 bottom-0 h-1/2 bg-accent/15";
  const line =
    edge === "left"
      ? "absolute inset-y-0 left-0 w-0.5 bg-accent"
      : edge === "right"
        ? "absolute inset-y-0 right-0 w-0.5 bg-accent"
        : edge === "top"
          ? "absolute inset-x-0 top-0 h-0.5 bg-accent"
          : "absolute inset-x-0 bottom-0 h-0.5 bg-accent";
  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      <div className={wash} />
      <div className={line} />
    </div>
  );
}

function Sash({
  sash,
  containerRef,
  onPreview,
  onCommit,
  onCancel,
}: {
  sash: LayoutSash;
  containerRef: { current: HTMLDivElement | null };
  onPreview: (ratio: number) => void;
  onCommit: (ratio: number) => void;
  onCancel: () => void;
}) {
  useLocale();
  const row = sash.dir === "right";
  const boundary = sash.sizes
    .slice(0, sash.index + 1)
    .reduce((sum, size) => sum + size, 0);
  const group = sash.group;

  return (
    <div
      role="separator"
      aria-orientation={row ? "vertical" : "horizontal"}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(boundary * 100)}
      className={
        row ? "absolute z-10 w-px bg-stroke" : "absolute z-10 h-px bg-stroke"
      }
      style={
        row
          ? {
              left: `${(group.x + boundary * group.w) * 100}%`,
              top: `${group.y * 100}%`,
              height: `${group.h * 100}%`,
            }
          : {
              left: `${group.x * 100}%`,
              top: `${(group.y + boundary * group.h) * 100}%`,
              width: `${group.w * 100}%`,
            }
      }
    >
      <div
        className={
          row
            ? "absolute inset-y-0 -left-1.5 -right-1.5 cursor-col-resize touch-none"
            : "absolute inset-x-0 -top-1.5 -bottom-1.5 cursor-row-resize touch-none"
        }
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const handle = e.currentTarget;
          const parent = containerRef.current;
          if (!parent) return;
          handle.setPointerCapture(e.pointerId);
          const rect = parent.getBoundingClientRect();
          const restoreSelection = suppressTextSelection();
          const previousCursor = document.body.style.cursor;
          document.body.style.cursor = row ? "col-resize" : "row-resize";
          const origin = row
            ? rect.left + group.x * rect.width
            : rect.top + group.y * rect.height;
          const span = row ? group.w * rect.width : group.h * rect.height;
          let nextBoundary = boundary;
          let moved = false;
          let frame: number | null = null;

          const move = (ev: PointerEvent) => {
            const pos = row ? ev.clientX : ev.clientY;
            if (span <= 0) return;
            moved = true;
            nextBoundary = (pos - origin) / span;
            if (frame != null) return;
            frame = requestAnimationFrame(() => {
              frame = null;
              onPreview(nextBoundary);
            });
          };
          const finish = (commit: boolean) => {
            if (frame != null) {
              cancelAnimationFrame(frame);
              frame = null;
            }
            if (handle.hasPointerCapture(e.pointerId)) {
              handle.releasePointerCapture(e.pointerId);
            }
            handle.removeEventListener("pointermove", move);
            handle.removeEventListener("pointerup", up);
            handle.removeEventListener("pointercancel", cancel);
            window.removeEventListener("keydown", keydown);
            restoreSelection();
            document.body.style.cursor = previousCursor;
            if (!moved) return;
            if (commit) onCommit(nextBoundary);
            else onCancel();
          };
          const up = () => finish(true);
          const cancel = () => finish(false);
          const keydown = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            finish(false);
          };
          handle.addEventListener("pointermove", move);
          handle.addEventListener("pointerup", up);
          handle.addEventListener("pointercancel", cancel);
          window.addEventListener("keydown", keydown);
        }}
      />
    </div>
  );
}
