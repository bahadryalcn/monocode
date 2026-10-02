import type { LiveAgent } from "../../sessions/model/liveAgents";
import type { LiveSessionInfo } from "../../sessions/model/recentSessions";
import { sessionDisplayTitle } from "../../sessions/model/session";
import type { HostSessionSummary } from "./protocol";

/** A host session of a remote project on the rail, as its machine last listed it. */
export type RemoteRailSession = { project: string; session: HostSessionSummary };

/** Host sessions no open tab has loaded; a loaded one is already in the app's session state. */
export function unopenedRemoteSessions(
  listed: readonly RemoteRailSession[],
  loadedHostIds: ReadonlySet<string>,
): RemoteRailSession[] {
  return listed.filter(
    ({ session }) =>
      !session.archived && !session.draft && !loadedHostIds.has(session.id),
  );
}

/** What "Last sessions" shows for host sessions that are not open here. */
export function remoteLiveSessionInfos(
  listed: readonly RemoteRailSession[],
): LiveSessionInfo[] {
  return listed.map(({ project, session }) => ({
    id: session.id,
    cwd: project,
    title: session.title,
    harness: session.harness,
    model: session.model ?? "",
    status: session.needsInput
      ? "input"
      : session.status === "running"
        ? "working"
        : undefined,
    activityAt: session.updatedAt,
  }));
}

/** The rail's working card for host sessions that run without an open tab here. */
export function remoteLiveAgents(
  listed: readonly RemoteRailSession[],
): LiveAgent[] {
  return listed
    .filter(({ session }) => session.needsInput || session.status === "running")
    .map(({ project, session }) => ({
      id: session.id,
      cwd: project,
      title: sessionDisplayTitle(session.title, session.harness),
      harness: session.harness,
      activity: session.needsInput ? "Needs input" : "Working",
      needsApproval: !!session.needsInput,
      done: false,
    }));
}
