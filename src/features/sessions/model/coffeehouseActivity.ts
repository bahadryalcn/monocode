import type { Session } from "./session";
import { deriveActivityDock } from "./activityDock";

/** Actual work, including delegated agents; persistent background commands are idle. */
export function coffeehouseWorkingCount(sessions: readonly Session[]): number {
  let count = 0;
  for (const session of sessions) {
    if (session.orchestrationLeadId && sessions.some(lead => lead.id === session.orchestrationLeadId && (lead.busy || lead.continuingElsewhere))) continue;
    if (!session.busy && !session.continuingElsewhere) continue;
    const dock = deriveActivityDock({ blocks: session.blocks, busy: !!session.busy,
      pendingQuestion: !!session.pendingQuestion, backgroundTasks: session.backgroundTasks,
      backgroundAgents: session.backgroundAgents, unseenDone: false });
    if (dock.state === "background") continue;
    const children = new Set(dock.agents
      .filter(agent => agent.kind === "agent" && agent.status === "running")
      .map(agent => agent.callId ?? agent.blockId)).size;
    const workers = sessions.filter(worker => worker.orchestrationLeadId === session.id &&
      (worker.busy || worker.continuingElsewhere)).length;
    // The lead coordinates the team; it is not an extra team member. Worker
    // sessions and transcript rows can describe the same delegated work.
    count += Math.max(1, children, session.backgroundAgents ?? 0, workers);
  }
  return count;
}
