import type { Session } from "./session";
import { deriveActivityDock } from "./activityDock";

/** Actual work, including delegated agents; persistent background commands are idle. */
export function coffeehouseWorkingCount(sessions: readonly Session[]): number {
  let count = 0;
  for (const session of sessions) {
    if (!session.busy && !session.continuingElsewhere) continue;
    const dock = deriveActivityDock({ blocks: session.blocks, busy: !!session.busy,
      pendingQuestion: !!session.pendingQuestion, backgroundTasks: session.backgroundTasks,
      backgroundAgents: session.backgroundAgents, unseenDone: false });
    if (dock.state === "background") continue;
    const children = dock.agents.filter(agent => agent.kind === "agent" && agent.status === "running").length;
    count += 1 + Math.max(children, session.backgroundAgents ?? 0);
  }
  return count;
}
