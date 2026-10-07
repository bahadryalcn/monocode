// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CoffeehouseBackdrop } from "./CoffeehouseBackdrop";
import { saveCoffeehouseSceneEnabled } from "../../settings/model/settings";

vi.mock("./VillageCoffeehouseScene", () => ({
  VillageCoffeehouseScene: ({ variant }: { variant: string }) =>
    createElement("div", { "data-scene": variant }),
}));
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
it("uses a background scene and responds to the shared setting without replacing the conversation", () => {
  act(() => root.render(createElement("div", null,
    createElement(CoffeehouseBackdrop), createElement("textarea", { defaultValue: "draft" }))));
  const input = container.querySelector("textarea");
  expect(container.querySelector("[data-scene]")?.getAttribute("data-scene")).toBe("background");
  act(() => saveCoffeehouseSceneEnabled(false));
  expect(container.querySelector("[data-scene]")).toBeNull();
  expect(container.querySelector("textarea")).toBe(input);
  expect(input?.value).toBe("draft");
  act(() => saveCoffeehouseSceneEnabled(true));
  expect(container.querySelector("[data-scene]")).not.toBeNull();
});
it("does not mount decorative observers for an invisible session", () => {
  act(() => root.render(createElement(CoffeehouseBackdrop, { visible: false })));
  expect(container.querySelector("[data-scene]")).toBeNull();
});
