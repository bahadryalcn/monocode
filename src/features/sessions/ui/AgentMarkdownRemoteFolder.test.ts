// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AgentMarkdown } from "./AgentMarkdown";

const actions = vi.hoisted(() => ({
  listDir: vi.fn(),
  revealPath: vi.fn(),
  openPathWithDefaultApp: vi.fn(),
  statFiles: vi.fn(),
}));
vi.mock("../../../platform/tauri/fs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../platform/tauri/fs")>()),
  ...actions,
}));
let root: Root;
let container: HTMLDivElement;
const onOpenFile = vi.fn();
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  actions.listDir.mockImplementation(async (path: string) => {
    if (path === "remote://env/repo/assets")
      return [
        { name: "özet.md", path: `${path}/özet.md`, isDir: false },
        { name: "images", path: `${path}/images`, isDir: true },
      ];
    if (path === "remote://env/repo/assets/images") return [];
    throw new Error("Not a directory");
  });
  actions.statFiles.mockImplementation(async (paths: string[]) => paths.map((path) => ({
    path, mtimeMs: null, isDir: path === "remote://env/repo/assets" || path === "remote://env/repo/assets/images",
  })));
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
async function render(text: string) {
  await act(async () =>
    root.render(
      createElement(AgentMarkdown, {
        text,
        cwd: "remote://env/repo",
        onOpenFile,
      }),
    ),
  );
}
it("recognizes existing bare and relative folders while leaving protocol methods as code", async () => {
  await render("`assets/images` and `currentTime/read` and `assets` and `someVariable`");
  const codes = [...container.querySelectorAll("code")];
  expect(codes[0].getAttribute("role")).toBe("link");
  expect(codes[1].getAttribute("role")).toBeNull();
  expect(codes[2].getAttribute("role")).toBe("link");
  expect(codes[3].getAttribute("role")).toBeNull();
});

it("browses remote folders and opens their files at exact paths", async () => {
  await render("`/repo/assets`");
  await act(async () =>
    container.querySelector<HTMLElement>('code[role="link"]')!.click(),
  );
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
  expect(dialog.textContent).toContain("özet.md");
  expect(onOpenFile).not.toHaveBeenCalled();
  const file = [...dialog.querySelectorAll("button")].find(
    (button) => button.textContent === "özet.md",
  )!;
  await act(async () => file.click());
  expect(onOpenFile).toHaveBeenCalledWith(
    "remote://env/repo/assets/özet.md",
    undefined,
    { exact: true },
  );
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});
it("opens a remote file's containing folder from its visible icon", async () => {
  await render("[Summary](/repo/assets/özet.md)");
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>(
        '[aria-label="Open containing folder"]',
      )!
      .click(),
  );
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
  expect(dialog.textContent).toContain("remote://env/repo/assets");
  const folder = [...dialog.querySelectorAll("button")].find(
    (button) => button.textContent === "images",
  )!;
  await act(async () => folder.click());
  expect(dialog.textContent).toContain("This folder is empty");
  expect(actions.revealPath).not.toHaveBeenCalled();
  expect(actions.openPathWithDefaultApp).not.toHaveBeenCalled();
});
