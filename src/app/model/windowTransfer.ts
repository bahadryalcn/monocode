import {
  leafIds,
  type WorkspaceTab,
} from "../../features/workspace/model/layout";
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
};

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
