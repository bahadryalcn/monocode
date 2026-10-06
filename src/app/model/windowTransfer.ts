import {
  leafIds,
  closeLeaf,
  type PaneEdge,
  type WorkspaceTab,
} from "../../features/workspace/model/layout";
import { applyPlaceTabOnPane } from "../../features/workspace/model/workspaceTabGroups";
import type { ProjectTerminalDock } from "../../features/projects/model/projectTerminal";
import type { Session } from "../../features/sessions/model/session";
import {
  composerDraftOf,
  setComposerDraft,
  setComposerMcpTags,
  setComposerAttachments,
} from "../../features/sessions/model/draftCache";

export type WindowTransferPayload = {
  tabs: WorkspaceTab[];
  sessions: Session[];
  activeTabId: string;
  projectCwd: string;
  dirtyFileIds: string[];
  projectTerminals?: ProjectTerminalDock[];
  composerDrafts?: Record<string, ReturnType<typeof composerDraftOf>>;
  /** Logical coordinates in the receiving webview, supplied by native hit testing. */
  dropPoint?: { x: number; y: number };
};

/** Receiving a tab must preserve the destination's existing conversations. */
export function mergeWindowTransfer(
  tabs: WorkspaceTab[],
  sessions: Session[],
  projectTerminals: ProjectTerminalDock[],
  incoming: WindowTransferPayload,
  target?: { id: string; edge: PaneEdge } | null,
  titleTarget?: { targetTabId: string; position: "before" | "after" } | null,
) {
  const paneIds = new Set(tabs.flatMap((tab) => leafIds(tab.layout)));
  if (
    incoming.tabs.some(
      (tab) =>
        tabs.some((existing) => existing.id === tab.id) ||
        leafIds(tab.layout).some((id) => paneIds.has(id)),
    ) ||
    incoming.sessions.some((session) =>
      sessions.some((existing) => existing.id === session.id),
    )
  ) {
    throw new Error(
      "This conversation is already open in the destination window.",
    );
  }
  let mergedTabs = [...tabs, ...incoming.tabs];
  let activeTabId = incoming.activeTabId;
  const titleIndex = titleTarget ? tabs.findIndex((tab) => tab.id === titleTarget.targetTabId) : -1;
  if (titleTarget && titleIndex >= 0) {
    const at = titleIndex + (titleTarget.position === "after" ? 1 : 0);
    mergedTabs = [...tabs.slice(0, at), ...incoming.tabs, ...tabs.slice(at)];
  } else if (target && paneIds.has(target.id)) {
    for (const tab of incoming.tabs) {
      const placed = applyPlaceTabOnPane({
        tabs: mergedTabs,
        sessions: [...sessions, ...incoming.sessions],
        sourceTabId: tab.id,
        targetId: target.id,
        edge: target.edge,
        replaceTarget: false,
      });
      if (placed) {
        mergedTabs = placed.tabs;
        activeTabId = placed.activeTabId;
      }
    }
  }
  return {
    tabs: mergedTabs,
    activeTabId,
    sessions: [...sessions, ...incoming.sessions],
    projectTerminals: [
      ...projectTerminals,
      ...(incoming.projectTerminals ?? []).filter(
        (dock) =>
          !projectTerminals.some(
            (existing) => existing.projectPath === dock.projectPath,
          ),
      ),
    ],
  };
}

/** Undo an unacknowledged docking without discarding destination edits. */
export function removeWindowTransfer(
  tabs: WorkspaceTab[],
  incoming: WindowTransferPayload,
): WorkspaceTab[] {
  const incomingTabIds = new Set(incoming.tabs.map((tab) => tab.id));
  const incomingPaneIds = incoming.tabs.flatMap((tab) => leafIds(tab.layout));
  return tabs
    .filter((tab) => !incomingTabIds.has(tab.id))
    .flatMap((tab) => {
      let remaining: WorkspaceTab | null = tab;
      for (const id of incomingPaneIds) {
        if (remaining && leafIds(remaining.layout).includes(id))
          remaining = closeLeaf(remaining, id);
      }
      return remaining
        ? [
            {
              ...remaining,
              editorPanes: remaining.editorPanes.filter(
                (pane) => !incomingPaneIds.includes(pane.id),
              ),
              terminalPanes: remaining.terminalPanes?.filter(
                (pane) => !incomingPaneIds.includes(pane.id),
              ),
            },
          ]
        : [];
    });
}

export function restoreTransferredDrafts(payload: WindowTransferPayload): void {
  for (const session of payload.sessions) {
    const draft = payload.composerDrafts?.[session.id];
    if (!draft) continue;
    setComposerDraft(session.id, draft.text);
    setComposerMcpTags(session.id, draft.mcpTags);
    setComposerAttachments(session.id, draft.attachments);
  }
}

export function collectWindowTransfer(
  tabs: WorkspaceTab[],
  sessions: Session[],
  tabIds: string[],
  activeTabId: string,
  dirtyFiles: Set<string>,
  fallbackCwd: string,
  projectTerminals: ProjectTerminalDock[] = [],
): WindowTransferPayload | null {
  const idSet = new Set(tabIds);
  const movingTabs = tabs.filter((tab) => idSet.has(tab.id));
  if (movingTabs.length === 0) return null;

  const sessionIds = new Set<string>();
  for (const tab of movingTabs) {
    for (const id of leafIds(tab.layout)) sessionIds.add(id);
  }

  const movingSessions = sessions.filter((session) =>
    sessionIds.has(session.id),
  );
  const composerDrafts = Object.fromEntries(
    movingSessions.map((session) => [session.id, composerDraftOf(session.id)]),
  );
  const dirtyInTabs = new Set<string>();
  for (const tab of movingTabs) {
    for (const pane of [...tab.editorPanes, ...(tab.terminalPanes ?? [])]) {
      for (const file of pane.files) {
        if (dirtyFiles.has(file.id)) dirtyInTabs.add(file.id);
      }
    }
  }

  const activeTabIdInGroup = idSet.has(activeTabId)
    ? activeTabId
    : movingTabs[0].id;

  return {
    tabs: movingTabs,
    sessions: movingSessions,
    activeTabId: activeTabIdInGroup,
    projectCwd: movingSessions[0]?.cwd ?? fallbackCwd,
    dirtyFileIds: [...dirtyInTabs],
    composerDrafts,
    ...(projectTerminals.length > 0 ? { projectTerminals } : {}),
  };
}
