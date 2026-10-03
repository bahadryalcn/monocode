import { describe, expect, it } from "vitest";
import type { HostSession } from "../../connections/model/protocol";
import type { Block, Session } from "../../sessions/model/session";
import { backgroundSessionSummary } from "./backgroundSession";

const block = (role: Block["role"], text: string, id = role): Block => ({
  id,
  role,
  text,
});

const host = (
  blocks: Block[],
  status: HostSession["status"] = "idle",
  session: Partial<Session> = {},
): HostSession =>
  ({
    projectId: "project-1",
    revision: 1,
    status,
    updatedAt: 1,
    session: {
      id: "session-1",
      title: "Nightly audit",
      harness: "claude",
      blocks,
      ...session,
    },
  }) as HostSession;

describe("background session summary", () => {
  it("shows the last reply and the last host note", () => {
    expect(
      backgroundSessionSummary(
        host([
          block("user", "Review the repository"),
          block("assistant", "First look", "a1"),
          block("assistant", "  All clear.  ", "a2"),
          block("assistant", "   ", "a3"),
          block("system", "Stopped after 30 minutes."),
        ]),
      ),
    ).toEqual({
      title: "Nightly audit",
      status: "Idle",
      reply: "All clear.",
      note: "Stopped after 30 minutes.",
    });
  });

  it("says when a running session waits on the owner", () => {
    expect(backgroundSessionSummary(host([], "running")).status).toBe(
      "Running",
    );
    expect(
      backgroundSessionSummary(
        host([], "running", {
          pendingQuestion: { requestId: 1, questions: [] } as never,
        }),
      ),
    ).toMatchObject({ status: "Waiting for input", reply: "", note: "" });
    expect(backgroundSessionSummary(host([], "interrupted")).status).toBe(
      "Interrupted",
    );
  });
});
