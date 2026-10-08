// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Window } from "happy-dom";
import { HtmlArtifactCard } from "./HtmlArtifactCard";
const bridge = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => true,
  convertFileSrc: (path: string, protocol: string) => `http://${protocol}.localhost/${path}`,
  invoke: (command: string, input: unknown) => bridge.invoke(command, input),
}));
describe("desktop saved HTML visual", () => {
  let root: Root; let container: HTMLDivElement;
  const artifact = { id: "artifact-1", sessionId: "session-1", title: "Chart", bytes: 48, createdAt: "2026-10-08T00:00:00Z" };
  beforeEach(() => {
    (window as unknown as Window).happyDOM.settings.disableIframePageLoading = true;
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    bridge.invoke.mockReset(); bridge.invoke.mockResolvedValue("native-preview-token");
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
  it("uses the isolated existing protocol instead of inherited app srcdoc CSP and closes its token", async () => {
    await act(async () => root.render(createElement(HtmlArtifactCard, { artifact, load: async () => ({ ...artifact, html: "<script>document.body.textContent='chart'</script>" }) })));
    await act(async () => container.querySelector("button")!.click());
    const iframe = container.querySelector("iframe");
    expect(iframe?.src).toBe("http://html-preview.localhost/native-preview-token/index.html");
    expect(iframe?.getAttribute("srcdoc")).toBeNull();
    expect(iframe?.getAttribute("sandbox")).toBe("allow-scripts");
    expect(bridge.invoke).toHaveBeenCalledWith("create_html_preview", { path: "remote://artifact/artifact-1/index.html", content: expect.stringContaining("connect-src 'none'") });
    await act(async () => container.querySelector("button")!.click());
    expect(bridge.invoke).toHaveBeenCalledWith("close_html_preview", { token: "native-preview-token" });
    expect(container.querySelector("iframe")).toBeNull();
  });
  it("closes a native token arriving after the user closes the card", async () => {
    let resolvePreview!: (token: string) => void;
    bridge.invoke.mockImplementation((command: string) => command === "create_html_preview" ? new Promise<string>((resolve) => { resolvePreview = resolve; }) : Promise.resolve());
    await act(async () => root.render(createElement(HtmlArtifactCard, { artifact, load: async () => ({ ...artifact, html: "<h1>Chart</h1>" }) })));
    await act(async () => container.querySelector("button")!.click());
    await act(async () => container.querySelector("button")!.click());
    await act(async () => resolvePreview("late-preview-token"));
    expect(bridge.invoke).toHaveBeenCalledWith("close_html_preview", { token: "late-preview-token" });
    expect(container.querySelector("iframe")).toBeNull();
  });
});
