import { describe, expect, it } from "vitest";
import {
  leaf,
  newTab,
  newTerminalFile,
  type WorkspaceTab,
} from "../../features/workspace/model/layout";
import { createProjectTerminal } from "../../features/projects/model/projectTerminal";
import type { Session } from "../../features/sessions/model/session";
import {
  collectWindowTransfer,
  mergeWindowTransfer,
  removeWindowTransfer,
  restoreTransferredDrafts,
} from "./windowTransfer";
import {
  composerDraftOf,
  clearComposerDraft,
  setComposerDraft,
} from "../../features/sessions/model/draftCache";

function session(id: string, cwd: string): Session {
  return {
    id,
    cwd,
    harness: "cursor",
    title: "",
    blocks: [],
    busy: false,
    model: "",
    modelSettings: {},
    runtimeMode: "default",
  };
}

describe("cross-window title strip placement", () => {
  it.each(["before", "after"] as const)("inserts incoming tabs %s the previewed title target", (position) => {
    const left = newTab("left");
    const right = newTab("right");
    const moved = newTab("moved");
    const incoming = {
      tabs: [moved], sessions: [session("moved", "/repo")], activeTabId: moved.id,
      projectCwd: "/repo", dirtyFileIds: [],
    };
    const merged = mergeWindowTransfer([left, right], [session("left", "/repo"), session("right", "/repo")], [], incoming,
      null, { targetTabId: right.id, position });
    expect(merged.tabs.map((tab) => tab.id)).toEqual(position === "before" ? [left.id, moved.id, right.id] : [left.id, right.id, moved.id]);
    expect(merged.activeTabId).toBe(moved.id);
    expect(merged.tabs.find((tab) => tab.id === moved.id)?.layout).toEqual(moved.layout);
  });
});

describe("collectWindowTransfer", () => {
  it.each(["right", "center"] as const)(
    "docks into a destination pane at %s and rolls back safely",
    (edge) => {
      const existing = newTab("existing");
      const moving = newTab("moving");
      const incoming = collectWindowTransfer(
        [moving],
        [session("moving", "/p")],
        [moving.id],
        moving.id,
        new Set(),
        "/p",
      )!;
      const merged = mergeWindowTransfer(
        [existing],
        [session("existing", "/p")],
        [],
        incoming,
        { id: "existing", edge },
      );
      expect(merged.tabs).toHaveLength(1);
      expect(merged.activeTabId).toBe(existing.id);
      expect(merged.tabs[0].focusedId).toBe("moving");
      const editedDestination = {
        ...merged.tabs[0],
        groupLabel: "preserve destination edit",
      };
      const rolledBack = removeWindowTransfer([editedDestination], incoming);
      expect(rolledBack).toHaveLength(1);
      expect(rolledBack[0].layout).toEqual(existing.layout);
      expect(rolledBack[0].groupLabel).toBe("preserve destination edit");
      expect(rolledBack[0].focusedId).toBe("existing");
    },
  );

  it("keeps incoming tabs when the drop target has disappeared", () => {
    const existing = newTab("existing");
    const moving = newTab("moving");
    const incoming = collectWindowTransfer(
      [moving],
      [session("moving", "/p")],
      [moving.id],
      moving.id,
      new Set(),
      "/p",
    )!;
    const merged = mergeWindowTransfer([existing], [], [], incoming, {
      id: "closed-pane",
      edge: "right",
    });
    expect(merged.tabs).toEqual([existing, moving]);
    expect(merged.activeTabId).toBe(moving.id);
  });

  it("reattaches a tab while retaining the destination's tabs and drafts", () => {
    const existing = newTab("existing");
    const moved = newTab("moved");
    const payload = collectWindowTransfer(
      [moved],
      [session("moved", "/p")],
      [moved.id],
      moved.id,
      new Set(),
      "/p",
    )!;
    const merged = mergeWindowTransfer(
      [existing],
      [session("existing", "/p")],
      [],
      payload,
    );
    expect(merged.tabs).toEqual([existing, moved]);
    expect(merged.sessions.map((s) => s.id)).toEqual(["existing", "moved"]);
    expect(() =>
      mergeWindowTransfer(merged.tabs, merged.sessions, [], payload),
    ).toThrow("already open");
  });

  it("rejects a duplicate conversation under a different tab ID", () => {
    const incoming = newTab("shared");
    const existing = newTab("shared");
    const payload = collectWindowTransfer(
      [incoming],
      [session("shared", "/p")],
      [incoming.id],
      incoming.id,
      new Set(),
      "/p",
    )!;
    expect(() => mergeWindowTransfer([existing], [], [], payload)).toThrow(
      "already open",
    );
  });
  it("moves the latest unsent text and leaves unrelated drafts alone", () => {
    setComposerDraft("moving", "message not sent yet");
    setComposerDraft("staying", "keep here");
    const tab = { ...newTab("moving"), id: "moving-tab" };
    const payload = collectWindowTransfer(
      [tab],
      [session("moving", "/p"), session("staying", "/p")],
      [tab.id],
      tab.id,
      new Set(),
      "/p",
    )!;
    expect(Object.keys(payload.composerDrafts!)).toEqual(["moving"]);
    clearComposerDraft("moving");
    restoreTransferredDrafts(payload);
    expect(composerDraftOf("moving").text).toBe("message not sent yet");
    expect(composerDraftOf("staying").text).toBe("keep here");
    clearComposerDraft("moving");
    clearComposerDraft("staying");
  });
  it("collects tabs, sessions, and dirty files for a group", () => {
    const s1 = session("s1", "/Users/me/agent-terminal");
    const s2 = session("s2", "/Users/me/agent-terminal");
    const tabs: WorkspaceTab[] = [
      { ...newTab("s1"), id: "t1" },
      { ...newTab("s2"), id: "t2" },
      { ...newTab("s1"), id: "t3", layout: leaf("s9") },
    ];
    const payload = collectWindowTransfer(
      tabs,
      [s1, s2],
      ["t1", "t2"],
      "t2",
      new Set(),
      "~",
    );
    expect(payload).toMatchObject({
      activeTabId: "t2",
      projectCwd: "/Users/me/agent-terminal",
    });
    expect(payload?.tabs.map((tab) => tab.id)).toEqual(["t1", "t2"]);
    expect(payload?.sessions.map((session) => session.id)).toEqual([
      "s1",
      "s2",
    ]);
    expect(payload?.projectTerminals).toBeUndefined();
  });

  it("carries a project terminal dock into the new window", () => {
    const s1 = session("s1", "/Users/me/agent-terminal");
    const tabs: WorkspaceTab[] = [{ ...newTab("s1"), id: "t1" }];
    const dock = createProjectTerminal(
      "/Users/me/agent-terminal",
      newTerminalFile("/Users/me/agent-terminal"),
    );
    const payload = collectWindowTransfer(
      tabs,
      [s1],
      ["t1"],
      "t1",
      new Set(),
      "~",
      [dock],
    );
    expect(payload?.projectTerminals).toEqual([dock]);
  });
});
