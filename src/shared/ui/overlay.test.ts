// @vitest-environment happy-dom
import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Modal } from "./Modal";
import { Popover } from "./Popover";
import { NativePopupHost } from "./NativePopupHost";
import { SearchableSelect } from "./SearchableSelect";
import { useDragResize } from "../hooks/useDragResize";

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});
const key = async (target: Element, value: string, shiftKey = false) => {
  const event = new KeyboardEvent("keydown", {
    key: value,
    shiftKey,
    bubbles: true,
    cancelable: true,
  });
  await act(async () => {
    target.dispatchEvent(event);
  });
  return event;
};

it("traps Tab, blocks the background, and restores the trigger", async () => {
  const trigger = document.createElement("button");
  document.body.append(trigger);
  trigger.focus();
  await act(async () =>
    root.render(
      createElement(Modal, {
        title: "Example",
        onClose: vi.fn(),
        children: createElement("button", { id: "last" }, "Last"),
      }),
    ),
  );
  const dialog = document.querySelector('[aria-modal="true"]')!;
  const last = document.getElementById("last")!;
  expect(trigger.inert).toBe(true);
  last.focus();
  await key(last, "Tab");
  expect(document.activeElement).toBe(
    dialog.querySelector('[aria-label="Close"]'),
  );
  await key(document.activeElement!, "Tab", true);
  expect(document.activeElement).toBe(last);
  trigger.focus();
  expect(dialog.contains(document.activeElement)).toBe(true);
  await act(async () => root.render(null));
  expect(document.activeElement).toBe(trigger);
  expect(trigger.inert).toBe(false);
});

it.each([false, true])(
  "dismisses only the top nested popover (native=%s)",
  async (native) => {
    const closed: string[] = [];
    const host = document.createElement("div");
    document.body.append(host);
    function Example() {
      const [inner, setInner] = useState(true);
      const [outer, setOuter] = useState(true);
      return createElement(Modal, {
        title: "Example",
        minimalHeader: true,
        onClose: () => closed.push("modal"),
        children: outer
          ? createElement(Popover, {
              anchor: host,
              onDismiss: () => {
                closed.push("outer");
                setOuter(false);
              },
              children: inner
                ? createElement(Popover, {
                    anchor: host,
                    onDismiss: () => {
                      closed.push("inner");
                      setInner(false);
                    },
                    children: createElement(
                      "button",
                      { id: "nested" },
                      "Nested",
                    ),
                  })
                : "Outer",
            })
          : "Body",
      });
    }
    await act(async () =>
      root.render(
        createElement(
          NativePopupHost.Provider,
          { value: native ? host : null },
          createElement(Example),
        ),
      ),
    );
    document.getElementById("nested")!.focus();
    expect(document.activeElement?.id).toBe("nested");
    await key(document.activeElement!, "Escape");
    expect(closed).toEqual(["inner"]);
    await key(document.activeElement!, "Escape");
    expect(closed).toEqual(["inner", "outer"]);
    await key(document.activeElement!, "Escape");
    expect(closed).toEqual(["inner", "outer", "modal"]);
  },
);

it("restores the trigger when a modal unmounts with a child overlay open", async () => {
  const trigger = document.createElement("button");
  document.body.append(trigger);
  trigger.focus();
  await act(async () => root.render(createElement(Modal, {
    title: "Example", onClose: vi.fn(), children: createElement(Popover, {
      anchor: trigger, onDismiss: vi.fn(), children: createElement("button", { id: "child" }, "Child"),
    }),
  })));
  document.getElementById("child")!.focus();
  await act(async () => root.render(null));
  expect(document.activeElement).toBe(trigger);
  expect(trigger.inert).toBe(false);
});

it("keeps Home/End available to the search caret", async () => {
  await act(async () =>
    root.render(
      createElement(SearchableSelect, {
        label: "Choice",
        value: "a",
        options: [{ value: "a", label: "Alpha" }],
        onChange: vi.fn(),
      }),
    ),
  );
  await act(async () => container.querySelector("button")!.click());
  const input = document.querySelector("input")!;
  expect((await key(input, "Home")).defaultPrevented).toBe(false);
  expect((await key(input, "End")).defaultPrevented).toBe(false);
});

it("clamps resized viewports below min and allows keyboard reset", async () => {
  let maximum = 500;
  function Example() {
    const resize = useDragResize({
      min: 200,
      max: () => maximum,
      initial: 400,
      defaultWidth: 240,
    });
    return createElement(
      "div",
      { ref: resize.setPaneRef },
      createElement("div", { ...resize.separatorProps }),
    );
  }
  await act(async () => root.render(createElement(Example)));
  const separator = container.querySelector('[role="separator"]')!;
  await key(separator, "ArrowLeft");
  expect(separator.getAttribute("aria-valuenow")).toBe("390");
  await key(separator, "Enter");
  expect(separator.getAttribute("aria-valuenow")).toBe("240");
  maximum = 150;
  await act(async () => window.dispatchEvent(new Event("resize")));
  expect(separator.getAttribute("aria-valuenow")).toBe("150");
  expect(separator.getAttribute("aria-valuemin")).toBe("150");
});
