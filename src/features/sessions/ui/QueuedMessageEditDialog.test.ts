// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { QueuedMessageEditDialog } from "./QueuedMessageEditDialog";
import type { QueuedMessage } from "../model/session";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

const message: QueuedMessage = {
  id: "q1",
  text: "look at [image1]",
  attachments: [
    { id: "a", name: "shot.png", mimeType: "image/png", kind: "image", size: 1, data: "AA==" },
  ],
};

async function open(props: Partial<Parameters<typeof QueuedMessageEditDialog>[0]> = {}) {
  const handlers = { onSave: vi.fn(), onRemove: vi.fn(), onCancel: vi.fn() };
  await act(async () =>
    root.render(
      createElement(QueuedMessageEditDialog, {
        message,
        canAttach: true,
        ...handlers,
        ...props,
      }),
    ),
  );
  const field = document.body.querySelector("textarea")!;
  const button = (label: string) =>
    [...document.body.querySelectorAll("button")].find((b) => b.textContent === label)!;
  return { ...handlers, field, button };
}

async function typeInto(field: HTMLTextAreaElement, text: string) {
  await act(async () => {
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    set.call(field, text);
    field.setSelectionRange(text.length, text.length);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("QueuedMessageEditDialog", () => {
  it("starts with the full text and its attachment chips", async () => {
    const { field } = await open();
    expect(field.value).toBe("look at [image1]");
    expect(document.body.querySelector('[aria-label="Remove shot.png"]')).not.toBeNull();
  });

  it("removing a chip removes its token", async () => {
    const { field, button, onSave } = await open();
    await act(async () =>
      document.body.querySelector<HTMLButtonElement>('[aria-label="Remove shot.png"]')!.click(),
    );
    expect(field.value).toBe("look at");
    act(() => button("Save").click());
    expect(onSave).toHaveBeenCalledWith("look at", []);
  });

  it("saves with Ctrl+Enter and leaves plain Enter to the text", async () => {
    const { field, onSave } = await open();
    const enter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    act(() => {
      field.dispatchEvent(enter);
    });
    expect(enter.defaultPrevented).toBe(false);
    expect(onSave).not.toHaveBeenCalled();

    act(() => {
      field.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true, cancelable: true }),
      );
    });
    expect(onSave).toHaveBeenCalledWith("look at [image1]", message.attachments);
  });

  it("cannot save an empty message and offers to remove it instead", async () => {
    const { field, button, onSave, onRemove } = await open({
      message: { id: "q1", text: "hi", attachments: [] },
    });
    await typeInto(field, "  ");
    expect((button("Save") as HTMLButtonElement).disabled).toBe(true);
    act(() => button("Remove from queue").click());
    expect(onRemove).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("asks before discarding changes, and cancels at once when nothing changed", async () => {
    const clean = await open();
    act(() => clean.button("Cancel").click());
    expect(clean.onCancel).toHaveBeenCalledTimes(1);

    const dirty = await open({ message: { id: "q2", text: "a", attachments: [] } });
    await typeInto(dirty.field, "ab");
    act(() => dirty.button("Cancel").click());
    expect(dirty.onCancel).not.toHaveBeenCalled();
    act(() => dirty.button("Discard").click());
    expect(dirty.onCancel).toHaveBeenCalledTimes(1);
  });
});
