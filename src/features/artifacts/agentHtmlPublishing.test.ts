// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { newSession } from "../sessions/model/session";
import { handleAgentApp, type AgentAppHost } from "../agent-app/model/agentApp";
describe("agent HTML publishing", () => {
  it("uses the authorized source session instead of accepting a target session from tool input", async () => {
    const source = newSession("codex", "/tmp/project", "codex:test");
    const publishHtml = vi.fn(async () => ({ id: "saved", sessionId: source.id, title: "Chart", createdAt: new Date().toISOString(), bytes: 12 }));
    const host = { publishHtml } as unknown as AgentAppHost;
    await handleAgentApp(source, "publish-1", "html_artifact_publish", { path: "visuals/chart.html", title: "Chart" }, host);
    expect(publishHtml).toHaveBeenCalledWith(source, { title: "Chart", path: "visuals/chart.html", messageId: undefined, requestId: "publish-1" });
    await expect(handleAgentApp(source, "publish-2", "html_artifact_publish", { path: "chart.html", title: "Chart", sessionId: "other-session" }, host)).rejects.toThrow("Unknown");
    expect(publishHtml).toHaveBeenCalledTimes(1);
  });
  it("reports unavailable publishing explicitly", async () => {
    const source = newSession("codex", "/tmp/project", "codex:test");
    await expect(handleAgentApp(source, "publish-1", "html_artifact_publish", { path: "chart.html", title: "Chart" }, {} as AgentAppHost)).rejects.toThrow("unavailable");
  });
});
