import { expect, it } from "vitest";
import { buildRecentSessions } from "../../sessions/model/recentSessions";
import { pathKey } from "../../../shared/lib/paths";
import type { HostSessionSummary } from "./protocol";
import {
  remoteLiveAgents,
  remoteLiveSessionInfos,
  unopenedRemoteSessions,
  type RemoteRailSession,
} from "./remoteRailSessions";

const project = "remote://env/home/me/repo";
const listed = (session: Partial<HostSessionSummary> & { id: string }): RemoteRailSession => ({
  project,
  session: {
    projectId: "project",
    revision: 1,
    status: "idle",
    updatedAt: 10,
    title: session.id,
    harness: "claude",
    ...session,
  },
});

it("leaves out sessions an open tab has loaded, archived ones and drafts", () => {
  const sessions = [
    listed({ id: "open" }),
    listed({ id: "archived", archived: true }),
    listed({ id: "draft", draft: true }),
    listed({ id: "unopened" }),
  ];
  expect(
    unopenedRemoteSessions(sessions, new Set(["open"])).map(({ session }) => session.id),
  ).toEqual(["unopened"]);
});

it("shows only running host sessions and ones waiting for input as working", () => {
  const agents = remoteLiveAgents([
    listed({ id: "idle" }),
    listed({ id: "running", status: "running", title: "Roadmap" }),
    listed({ id: "asking", status: "running", needsInput: true }),
  ]);
  expect(agents).toMatchObject([
    { id: "running", cwd: project, title: "Roadmap", activity: "Working", needsApproval: false },
    { id: "asking", activity: "Needs input", needsApproval: true },
  ]);
});

it("lists a host session that was never opened here in Last sessions", () => {
  const live = remoteLiveSessionInfos([
    listed({ id: "idle", updatedAt: 50 }),
    listed({ id: "running", status: "running" }),
  ]);
  const rows = buildRecentSessions({
    stored: [],
    live,
    projectKeys: new Set([pathKey(project)]),
    limit: 10,
    now: 1_000,
  });
  expect(rows).toMatchObject([
    { id: "running", status: "working", remote: true, updatedAt: 1_000 },
    { id: "idle", status: undefined, remote: true, updatedAt: 50 },
  ]);
});
