// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Attachment } from "../model/session";
import { AttachmentTokenText } from "./AttachmentTokenText";

const image: Attachment = {
  id: "image",
  name: "shot.png",
  mimeType: "image/png",
  kind: "image",
  size: 3,
  previewUrl: "blob:shot",
};
const doc: Attachment = {
  id: "doc",
  name: "notes.md",
  mimeType: "text/markdown",
  kind: "file",
  size: 3,
  path: "/repo/notes.md",
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(text: string, attachments: Attachment[] | undefined) {
  act(() =>
    root.render(createElement(AttachmentTokenText, { text, attachments })),
  );
}

describe("AttachmentTokenText", () => {
  it("keeps the message text intact, brackets included", () => {
    render("see [image1] and [file1].", [image, doc]);
    expect(container.textContent).toBe("see [image1] and [file1].");
  });

  it("renders tokens of this message's attachments as pills", () => {
    render("see [image1] and [file1]", [image, doc]);
    expect(
      container.querySelector('[aria-label="Open [image1] (shot.png) full screen"]'),
    ).not.toBeNull();
    expect(container.querySelector('[title="/repo/notes.md"]')?.textContent).toBe(
      "[file1]",
    );
  });

  it("leaves unknown tokens and legacy messages as plain text", () => {
    render("see [image2]", [image, doc]);
    expect(container.querySelector("button, span")).toBeNull();
    render("see [image1]", undefined);
    expect(container.querySelector("button, span")).toBeNull();
    expect(container.textContent).toBe("see [image1]");
  });

  it("opens the image from its pill", () => {
    render("[image1]", [image]);
    act(() => container.querySelector<HTMLButtonElement>("button")!.click());
    expect(document.querySelector('[role="dialog"] img')?.getAttribute("src")).toBe(
      "blob:shot",
    );
  });
});
