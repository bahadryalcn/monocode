import type { Session } from "../../features/sessions/model/session";
import type { WorkspaceTab } from "../../features/workspace/model/layout";
import { leafIds } from "../../features/workspace/model/layout";
import { filterTabsForProject } from "../../features/workspace/model/workspaceTabGroups";

/** Pointer travel past the window edge before a tab drag counts as a pop-out. */
const POP_OUT_MARGIN = 6;

/** True when a dragged tab was released clearly outside the window. */
export function isPointerOutsideWindow(
  x: number,
  y: number,
  width: number,
  height: number,
  margin = POP_OUT_MARGIN,
): boolean {
  return x < -margin || y < -margin || x > width + margin || y > height + margin;
}

/** Top-left of the new window so the dropped tab lands under the pointer. */
export function popOutPosition(
  screenX: number,
  screenY: number,
): { x: number; y: number } {
  return { x: Math.round(screenX - 120), y: Math.round(screenY - 16) };
}

/** Sessions in `tabIds` that are streaming or waiting on the user. Their turn
 * lives in this window's harness listeners, so the new window cannot adopt it. */
export function busySessionsInTabs(
  tabs: WorkspaceTab[],
  sessions: Session[],
  tabIds: string[],
): Session[] {
  const ids = new Set(tabIds);
  const inTabs = new Set<string>();
  for (const tab of tabs) {
    if (!ids.has(tab.id)) continue;
    for (const id of leafIds(tab.layout)) inTabs.add(id);
  }
  return sessions.filter((session) => inTabs.has(session.id) && session.busy);
}

export type TabMoveRemainder = {
  remaining: WorkspaceTab[];
  /** The project has no tab left here, so a blank session must be seeded. */
  needsSeed: boolean;
  /** Tab to show next when the active tab moved away; null keeps the current. */
  nextActiveTabId: string | null;
};

/** What the source window keeps after `movingIds` leave it. */
export function planTabMoveRemainder(
  tabs: WorkspaceTab[],
  sessions: Session[],
  movingIds: string[],
  activeTabId: string,
  projectCwd: string,
): TabMoveRemainder {
  const moving = new Set(movingIds);
  const remaining = tabs.filter((tab) => !moving.has(tab.id));
  const inProject = filterTabsForProject(remaining, sessions, projectCwd);
  const needsSeed = inProject.length === 0;
  const nextActiveTabId = moving.has(activeTabId)
    ? (inProject[0]?.id ?? null)
    : null;
  return { remaining, needsSeed, nextActiveTabId };
}
