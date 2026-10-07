// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OnboardingDialog from "./OnboardingDialog";
import type { ImportCandidate } from "../../../platform/tauri/sessionImport";

const mock = vi.hoisted(() => ({
  discover: vi.fn(),
  keys: vi.fn(),
  run: vi.fn(),
  pick: vi.fn(),
  remember: vi.fn(),
}));
vi.mock("../../../shared/ui/Modal", () => ({
  Modal: ({ children }: { children: unknown }) => children,
}));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));
vi.mock("../../connections/ui/ConnectionsSettings", () => ({
  ConnectionsSettings: () => null,
}));
vi.mock("../../connections/ui/AddRemoteProjectDialog", () => ({
  AddRemoteProjectDialog: () => null,
}));
vi.mock("../../connections/model/connections", () => ({
  useRemoteMachines: () => ({ machines: [] }),
}));
vi.mock("../../sessions/ui/HarnessIcon", () => ({ HarnessIcon: () => null }));
vi.mock("../../sessions/ui/ProviderSignInDialog", () => ({
  ProviderSignInDialog: () => null,
}));
vi.mock("../../settings/ui/ProviderBinarySettings", () => ({
  ProviderBinaryControl: () => null,
}));
vi.mock("../../../integrations/harness/core/availability", () => ({
  getHarnessAvailabilitySnapshot: () => 0,
  subscribeHarnessAvailability: () => () => {},
  isHarnessAvailable: () => false,
  probeHarnessAvailability: () => Promise.resolve(),
}));
vi.mock("../../../platform/tauri/sessionImport", () => ({
  discoverImportableSessions: mock.discover,
}));
vi.mock("../../sessions/data/sessionStore", () => ({
  importedSessionKeys: mock.keys,
}));
vi.mock("../../sessions/import/importRunner", () => ({
  isUsableProjectFolder: (item: ImportCandidate) => item.cwdExists,
  runSessionImport: mock.run,
}));
vi.mock("../../../platform/tauri/fs", () => ({ pickFolders: mock.pick }));
vi.mock("../../projects/model/recents", () => ({
  rememberProject: mock.remember,
}));

function candidate(
  id: string,
  overrides: Partial<ImportCandidate> = {},
): ImportCandidate {
  return {
    provider: "codex",
    path: `${id}.jsonl`,
    providerSessionId: id,
    cwd: "G:/app",
    cwdExists: true,
    resumable: true,
    firstPrompt: "Hello",
    startedAt: 1,
    lastAt: 2,
    sizeBytes: 10,
    kind: "interactive",
    archived: false,
    ...overrides,
  };
}
let root: Root;
let container: HTMLDivElement;
const onFinish = vi.fn();
const onImported = vi.fn();
function button(text: string) {
  const found = [...container.querySelectorAll("button")].find((item) =>
    item.textContent?.includes(text),
  );
  if (!found) throw new Error(`Button not found: ${text}`);
  return found;
}
async function click(text: string) {
  await act(async () => button(text).click());
}
async function render() {
  await act(async () =>
    root.render(
      createElement(OnboardingDialog, {
        onFinish,
        onImported,
        onOpenProject: vi.fn(),
      }),
    ),
  );
}
async function projects() {
  await render();
  await click("Continue");
  await click("Continue");
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.clearAllMocks();
  mock.discover.mockResolvedValue({
    candidates: [
      candidate("a"),
      candidate("b"),
      candidate("stored"),
      candidate("missing", { cwdExists: false }),
      candidate("auto", { kind: "exec" }),
    ],
  });
  mock.keys.mockResolvedValue(["codex:stored"]);
  mock.run.mockResolvedValue({
    imported: 2,
    projects: 1,
    failed: [],
    cancelled: false,
    readOnly: 0,
    truncated: 0,
  });
  mock.pick.mockResolvedValue(["G:/new-project"]);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
describe("onboarding workflow", () => {
  it("can skip without scanning or importing history", async () => {
    await render();
    await click("Set up later");
    expect(onFinish).toHaveBeenCalledOnce();
    expect(mock.discover).not.toHaveBeenCalled();
    expect(mock.run).not.toHaveBeenCalled();
  });
  it("imports only interactive, usable, unimported sessions in selected folders", async () => {
    await projects();
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(
      1,
    );
    await click("Import 1 projects");
    expect(
      mock.run.mock.calls[0][0].candidates.map(
        (item: ImportCandidate) => item.providerSessionId,
      ),
    ).toEqual(["a", "b"]);
    expect(onImported).toHaveBeenCalledOnce();
    expect(onFinish).not.toHaveBeenCalled();
    await click("Start coding");
    expect(onFinish).toHaveBeenCalledOnce();
  });
  it("allows starting without importing any project", async () => {
    await projects();
    await click("Select none");
    await click("Start coding");
    expect(mock.run).not.toHaveBeenCalled();
    expect(onFinish).toHaveBeenCalledOnce();
  });
  it("blocks leaving during import and exposes cancellation", async () => {
    let resolve!: (value: unknown) => void;
    mock.run.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    await projects();
    await click("Import 1 projects");
    expect(button("Back").disabled).toBe(true);
    expect(button("Do not import").disabled).toBe(true);
    const signal = mock.run.mock.calls[0][0].signal as AbortSignal;
    await click("Cancel import");
    expect(signal.aborted).toBe(true);
    await act(async () =>
      resolve({
        imported: 0,
        projects: 0,
        failed: [],
        cancelled: true,
        readOnly: 0,
        truncated: 0,
      }),
    );
    expect(container.textContent).toContain("Import cancelled");
    expect(button("Back").disabled).toBe(false);
  });
  it("reports a failed discovery and still allows adding a folder", async () => {
    mock.discover.mockRejectedValue(new Error("Access denied"));
    await projects();
    expect(container.textContent).toContain("Access denied");
    await click("Choose project folders");
    expect(mock.remember).toHaveBeenCalledWith("G:/new-project");
    expect(onImported).toHaveBeenCalledOnce();
    expect(container.textContent).toContain("1 project folders added");
  });
  it("keeps import failures visible for review before finishing", async () => {
    mock.run.mockResolvedValue({
      imported: 1,
      projects: 1,
      failed: [{ candidate: candidate("b"), error: "Transcript unreadable" }],
      cancelled: false,
    });
    await projects();
    await click("Import 1 projects");
    expect(container.textContent).toContain("Transcript unreadable");
    expect(onFinish).not.toHaveBeenCalled();
  });
});
