// @vitest-environment happy-dom
import { undo } from "@codemirror/commands";
import { replaceAll, SearchQuery, setSearchQuery } from "@codemirror/search";
import { EditorView } from "@codemirror/view";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  invalidateNotes,
  loadNotes,
  NOTES_CHANGED_EVENT,
  type Note,
  type NoteUpsert,
} from "../notes";
import { NotesView } from "./NotesView";
import { NoteDraftRecoveryNotice } from "./NoteDraftRecoveryNotice";
import { drafts } from "../noteDrafts";
import {
  savePinnedProjects,
  saveProjectRailOrder,
} from "../../projects/model/recents";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", async (original) => ({
  ...(await original<typeof import("@tauri-apps/api/core")>()),
  invoke,
}));
vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: () => ({ onDragDropEvent: async () => () => {} }),
}));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    isMaximized: async () => false,
    onResized: async () => () => {},
  }),
}));

let root: Root;
let container: HTMLDivElement;
let stored: Note;
let onClose: ReturnType<typeof vi.fn>;
const recents = [
  { path: "/work/Edefyn", openedAt: 2 },
  { path: "/work/portognjeeen", openedAt: 1 },
];

beforeEach(() => {
  drafts.clear();
  invalidateNotes();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  stored = {
    id: "note-project-test",
    slug: "plan",
    title: "Plan",
    body: "Keep this text.",
    tags: ["ideas"],
    sourceCwd: "/work/Edefyn",
    sourceSessionId: "original-session",
    createdAt: 1,
    updatedAt: 1,
  };
  invoke.mockReset();
  invoke.mockImplementation(
    async (command: string, args?: { note: NoteUpsert }) => {
      if (command === "notes_list") return [{ ...stored }];
      if (command === "notes_upsert") {
        stored = { ...stored, ...args!.note, updatedAt: stored.updatedAt + 1 };
        return { ...stored };
      }
      throw new Error(`Unexpected command: ${command}`);
    },
  );
  onClose = vi.fn();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function render(projects = recents, cwd = "/work/Edefyn") {
  await act(async () =>
    root.render(
      createElement(NotesView, {
        cwd,
        recents: projects,
        onClose,
      }),
    ),
  );
}

it("shows a preloaded note immediately while refreshing in the background", async () => {
  await loadNotes();
  let finish!: (notes: Note[]) => void;
  const refresh = new Promise<Note[]>((resolve) => {
    finish = resolve;
  });
  invoke.mockReturnValue(refresh);
  await render();
  expect(
    container.querySelector<HTMLInputElement>('[aria-label="Note title"]')
      ?.value,
  ).toBe("Plan");
  expect(container.textContent).toContain("Keep this text.");
  expect(container.textContent).not.toContain("Select a note");
  expect(container.querySelector(".animate-spin")).toBeNull();

  await act(async () => finish([{ ...stored, title: "Updated plan" }]));
  expect(
    container.querySelector<HTMLInputElement>('[aria-label="Note title"]')
      ?.value,
  ).toBe("Updated plan");
});

it("refreshes an open note after an Operator write", async () => {
  await render();
  stored = {
    ...stored,
    title: "Updated by Operator",
    body: "New text",
    updatedAt: 2,
  };
  await act(async () => window.dispatchEvent(new Event(NOTES_CHANGED_EVENT)));
  expect(
    container.querySelector<HTMLInputElement>('[aria-label="Note title"]')
      ?.value,
  ).toBe("Updated by Operator");
  expect(container.textContent).toContain("New text");
});

// https://github.com/hardbeat920/monocode/issues/591
it("keeps a note's consecutive lines on their own lines", async () => {
  stored = { ...stored, body: "> first line\n> second line\n> third line" };
  await render();

  const preview = container.querySelector<HTMLElement>(
    '[data-streamdown="blockquote"]',
  )!;
  expect(preview.querySelector("p")?.innerHTML).toBe(
    "first line<br>second line<br>third line",
  );
});

it("uses the searchable rail project picker when moving a note", async () => {
  const projects = [
    ...recents,
    { path: "/work/Third", openedAt: 3 },
    { path: "/work/Fourth", openedAt: 4 },
    { path: "/work/Fifth", openedAt: 5 },
    { path: "/work/Sixth", openedAt: 6 },
    { path: "/work/Seventh", openedAt: 7 },
  ];
  saveProjectRailOrder([
    "/work/Fourth",
    "/work/Third",
    "/work/Edefyn",
    "/work/portognjeeen",
    "/work/Fifth",
    "/work/Sixth",
    "/work/Seventh",
    "/work/Active",
  ]);
  savePinnedProjects(["/work/Seventh"]);
  await render(projects, "/work/Active");
  await act(async () => projectButton()!.click());
  const menu = document.querySelector('[aria-label="Project picker"]')!;
  const items = [...menu.querySelectorAll<HTMLButtonElement>("button[title]")];
  expect(items.map((item) => item.title)).toEqual([
    "/work/Edefyn",
    "/work/Seventh",
    "/work/Fourth",
    "/work/Third",
    "/work/portognjeeen",
    "/work/Fifth",
    "/work/Sixth",
    "/work/Active",
  ]);
  const search = menu.querySelector<HTMLInputElement>(
    'input[placeholder="Search projects..."]',
  );
  expect(search).not.toBeNull();
  expect(document.activeElement).toBe(search);
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(search, "active");
    search!.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const filteredItems = [
    ...menu.querySelectorAll<HTMLButtonElement>("button[title]"),
  ];
  expect(filteredItems.map((item) => item.title)).toEqual(["/work/Active"]);
  await act(async () => filteredItems[0]!.click());
  expect(stored.sourceCwd).toBe("/work/Active");
});

function editorView() {
  return EditorView.findFromDOM(
    container.querySelector<HTMLElement>("[data-note-editor] .cm-editor")!,
  )!;
}

function tab(label: string) {
  return [
    ...container.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
  ].find((button) => button.textContent === label)!;
}

it("replaces regex matches with their groups in the note source", async () => {
  vi.useFakeTimers();
  stored = { ...stored, body: "item_1 and item_22\nItem_3" };
  await render();
  await act(async () => tab("Source").click());
  const view = editorView();
  await act(async () =>
    view.dispatch({
      effects: setSearchQuery.of(
        new SearchQuery({
          search: "item_(\\d+)",
          replace: "note_$1",
          regexp: true,
          caseSensitive: true,
        }),
      ),
    }),
  );
  await act(async () => {
    replaceAll(view);
  });
  expect(view.state.doc.toString()).toBe("note_1 and note_22\nItem_3");
  await act(async () => vi.advanceTimersByTime(400));
  expect(stored.body).toBe("note_1 and note_22\nItem_3");
});

it("formats the selection from the toolbar and undoes it in one step", async () => {
  stored = { ...stored, body: "make this bold" };
  await render();
  await act(async () => tab("Preview").click());
  // Preview keeps only the image button; formatting needs the source.
  expect(
    container.querySelector('[role="toolbar"] button[aria-label^="Bold"]'),
  ).toBeNull();
  expect(
    container.querySelector(
      '[role="toolbar"] button[aria-label="Insert image"]',
    ),
  ).not.toBeNull();
  await act(async () => tab("Source").click());
  const view = editorView();
  // happy-dom reports the selection change synchronously, mid-update.
  view.focus = () => {};
  await act(async () => view.dispatch({ selection: { anchor: 5, head: 9 } }));
  const bold = container.querySelector<HTMLButtonElement>(
    '[role="toolbar"] button[aria-label^="Bold"]',
  )!;
  await act(async () => bold.click());
  expect(view.state.doc.toString()).toBe("make **this** bold");
  await act(async () => {
    undo(view);
  });
  expect(view.state.doc.toString()).toBe("make this bold");
});

it("adds a pasted image to the note at the caret", async () => {
  const save = invoke.getMockImplementation()!;
  invoke.mockImplementation(async (command, args) => {
    if (command === "write_attachment") return "/tmp/pasted.png";
    if (command === "notes_save_image") {
      return { name: "shot.png", markdownPath: "/note-assets/n/1-shot.png" };
    }
    if (command === "delete_path") return undefined;
    return save(command, args);
  });
  await render();
  await act(async () => tab("Source").click());
  const view = editorView();
  view.focus = () => {};
  await act(async () => view.dispatch({ selection: { anchor: 4 } }));
  const file = new File([new Uint8Array([137, 80, 78, 71])], "shot.png", {
    type: "image/png",
  });
  const paste = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(paste, "clipboardData", {
    value: { files: [file], items: [], types: ["Files"] },
  });
  await act(async () => {
    view.contentDOM.dispatchEvent(paste);
  });
  expect(paste.defaultPrevented).toBe(true);
  await vi.waitFor(() =>
    expect(view.state.doc.toString()).toBe(
      "Keep\n\n![shot.png](/note-assets/n/1-shot.png)\n\n this text.",
    ),
  );
});

it("updates the split preview while the source is edited", async () => {
  await render();
  await act(async () => tab("Split").click());
  const view = editorView();
  await act(async () =>
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: "# Live title" },
    }),
  );
  expect(container.querySelector("h1")?.textContent).toContain("Live title");
});

function projectButton() {
  return container.querySelector<HTMLButtonElement>(
    'header button[aria-label^="Move note to project"]',
  );
}

async function chooseProject() {
  const button = projectButton();
  expect(
    button,
    "The note header should offer a project picker",
  ).not.toBeNull();
  await act(async () => button!.click());
  const item = [
    ...document.querySelectorAll<HTMLButtonElement>(
      '[aria-label="Project picker"] button[title]',
    ),
  ].find((element) => element.title === "/work/portognjeeen");
  expect(item).toBeDefined();
  await act(async () => item!.click());
}

it("moves the existing note and keeps its content when reopened", async () => {
  await render();
  await chooseProject();
  expect(stored).toMatchObject({
    id: "note-project-test",
    slug: "plan",
    title: "Plan",
    body: "Keep this text.",
    tags: ["ideas"],
    sourceCwd: "/work/portognjeeen",
    sourceSessionId: "original-session",
    createdAt: 1,
  });
  expect(projectButton()?.textContent).toContain("portognjeeen");
  expect(
    container.querySelector('li [aria-current="true"]')?.textContent,
  ).toContain("portognjeeen");
  expect(onClose).not.toHaveBeenCalled();
  await act(async () => root.unmount());
  root = createRoot(container);
  await render();
  expect(projectButton()?.textContent).toContain("portognjeeen");
});

it("closes the project menu with Escape without leaving Notes", async () => {
  await render();
  await act(async () => projectButton()!.click());
  expect(
    document.querySelector('[aria-label="Project picker"]'),
  ).not.toBeNull();
  await act(async () =>
    projectButton()!.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  expect(document.querySelector('[aria-label="Project picker"]')).toBeNull();
  expect(onClose).not.toHaveBeenCalled();
});

it("serializes title edits behind an in-flight project change", async () => {
  await render();
  const save = invoke.getMockImplementation()!;
  let finishMove!: () => void;
  const moving = new Promise<void>((resolve) => {
    finishMove = resolve;
  });
  let inFlight = 0;
  let maximumInFlight = 0;
  invoke.mockImplementation(async (command, args) => {
    if (command !== "notes_upsert") return save(command, args);
    inFlight += 1;
    maximumInFlight = Math.max(maximumInFlight, inFlight);
    if (args.note.title === "Plan") await moving;
    const result = await save(command, args);
    inFlight -= 1;
    return result;
  });
  await chooseProject();
  const title = container.querySelector<HTMLInputElement>(
    '[aria-label="Note title"]',
  )!;
  act(() => title.focus());
  act(() => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(title, "Updated plan");
    title.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => title.blur());
  await act(async () => finishMove());
  expect(maximumInFlight).toBe(1);
  expect(stored.title).toBe("Updated plan");
  expect(stored.sourceCwd).toBe("/work/portognjeeen");
});

it("keeps newer edits after reopening a note during a project move", async () => {
  const second = {
    ...stored,
    id: "second-note",
    slug: "second",
    title: "Second",
  };
  const save = invoke.getMockImplementation()!;
  let finishMove!: () => void;
  const moving = new Promise<void>((resolve) => {
    finishMove = resolve;
  });
  let inFlight = 0;
  let maximumInFlight = 0;
  invoke.mockImplementation(async (command, args) => {
    if (command === "notes_list") return [{ ...stored }, { ...second }];
    if (command !== "notes_upsert") return save(command, args);
    inFlight += 1;
    maximumInFlight = Math.max(maximumInFlight, inFlight);
    if (args.note.sourceCwd === "/work/portognjeeen") await moving;
    const result = await save(command, args);
    inFlight -= 1;
    return result;
  });
  const selectNote = async (title: string) => {
    const button = [
      ...container.querySelectorAll<HTMLButtonElement>("li button"),
    ].find((item) => item.textContent?.includes(title));
    expect(button).toBeDefined();
    await act(async () => button!.click());
  };

  await render();
  await chooseProject();
  await selectNote("Second");
  await selectNote("Plan");
  const title = container.querySelector<HTMLInputElement>(
    '[aria-label="Note title"]',
  )!;
  act(() => title.focus());
  act(() => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(title, "Updated after reopening");
    title.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => title.blur());
  await act(async () => finishMove());

  expect(stored.title).toBe("Updated after reopening");
  expect(stored.sourceCwd).toBe("/work/portognjeeen");
  expect(maximumInFlight).toBe(1);
  await selectNote("Second");
  await selectNote("Updated after reopening");
  expect(
    container.querySelector<HTMLInputElement>('[aria-label="Note title"]')
      ?.value,
  ).toBe("Updated after reopening");
  expect(projectButton()?.textContent).toContain("portognjeeen");
});

it.each(["title", "body", "tags"] as const)(
  "preserves earlier edits when changing %s after reopening during a move",
  async (field) => {
    vi.useFakeTimers();
    const second = { ...stored, id: "second-note", title: "Second" };
    const save = invoke.getMockImplementation()!;
    let finishMove!: () => void;
    const moving = new Promise<void>((resolve) => {
      finishMove = resolve;
    });
    invoke.mockImplementation(async (command, args) => {
      if (command === "notes_list") return [{ ...stored }, { ...second }];
      if (
        command === "notes_upsert" &&
        args.note.sourceCwd === "/work/portognjeeen"
      )
        await moving;
      return save(command, args);
    });
    const selectNote = async (title: string) => {
      const button = [
        ...container.querySelectorAll<HTMLButtonElement>("li button"),
      ].find((item) => item.textContent?.includes(title));
      expect(button).toBeDefined();
      await act(async () => button!.click());
    };
    const editInput = async (label: string, value: string) => {
      const input = container.querySelector<HTMLInputElement>(
        `[aria-label="${label}"]`,
      )!;
      await act(async () => {
        Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        )!.set!.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    };
    const editBody = async (value: string) => {
      const source = [
        ...container.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
      ].find((button) => button.textContent === "Source")!;
      await act(async () => source.click());
      const view = editorView();
      await act(async () =>
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: value },
        }),
      );
    };

    await render();
    await selectNote("Plan");
    await editInput("Note title", "Title before moving");
    await editBody("Content before moving");
    await editInput("Add note tag", "before,");
    await chooseProject();
    await selectNote("Second");
    await selectNote("Plan");
    if (field === "title")
      await editInput("Note title", "Title after reopening");
    if (field === "body") await editBody("Content after reopening");
    if (field === "tags") await editInput("Add note tag", "after,");
    await act(async () => vi.advanceTimersByTime(400));
    // Cover both an open editor and saves finishing after it unmounts.
    if (field !== "title") await selectNote("Second");
    await act(async () => finishMove());

    const expected = {
      title:
        field === "title" ? "Title after reopening" : "Title before moving",
      body:
        field === "body" ? "Content after reopening" : "Content before moving",
      tags:
        field === "tags" ? ["ideas", "before", "after"] : ["ideas", "before"],
      sourceCwd: "/work/portognjeeen",
    };
    expect(stored).toMatchObject(expected);
    await selectNote(expected.title);
    expect(
      container.querySelector<HTMLInputElement>('[aria-label="Note title"]')
        ?.value,
    ).toBe(expected.title);
    expect(editorView().state.doc.toString()).toBe(expected.body);
    expect(
      [...container.querySelectorAll('[aria-label="Tags"] span')].map(
        (tag) => tag.textContent,
      ),
    ).toEqual(expect.arrayContaining(expected.tags.map((tag) => `#${tag}`)));
    expect(projectButton()?.textContent).toContain("portognjeeen");
  },
);

it("lets the user retry a project change after saving fails", async () => {
  await render();
  invoke.mockRejectedValueOnce(new Error("Disk full"));
  await chooseProject();
  expect(stored.sourceCwd).toBe("/work/Edefyn");
  expect(container.textContent).toContain("Disk full");
  const retry = [
    ...container.querySelectorAll<HTMLButtonElement>("button"),
  ].find((button) => button.textContent === "Retry");
  expect(retry, "An unsaved project choice needs a retry action").toBeDefined();
  let failRetry!: (error: Error) => void;
  const retrying = new Promise<never>((_, reject) => {
    failRetry = reject;
  });
  invoke.mockImplementationOnce(() => retrying);
  await act(async () => retry!.click());
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(stored.sourceCwd).toBe("/work/Edefyn");

  await act(async () => failRetry(new Error("Still no space")));
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "Still no space",
  );
  const nextRetry = [
    ...container.querySelectorAll<HTMLButtonElement>("button"),
  ].find((button) => button.textContent === "Retry");
  expect(nextRetry).toBeDefined();
  await act(async () => nextRetry!.click());
  expect(stored.sourceCwd).toBe("/work/portognjeeen");
  expect(container.querySelector('[role="alert"]')).toBeNull();
});

it("keeps a completed move after returning to the note while it saves", async () => {
  const second = {
    ...stored,
    id: "second-note",
    slug: "second",
    title: "Second",
  };
  const save = invoke.getMockImplementation()!;
  let finishMove!: () => void;
  const moving = new Promise<void>((resolve) => {
    finishMove = resolve;
  });
  invoke.mockImplementation(async (command, args) => {
    if (command === "notes_list") return [{ ...stored }, { ...second }];
    if (
      command === "notes_upsert" &&
      args.note.sourceCwd === "/work/portognjeeen"
    )
      await moving;
    return save(command, args);
  });
  const selectNote = async (title: string) => {
    const button = [
      ...container.querySelectorAll<HTMLButtonElement>("li button"),
    ].find((item) => item.textContent?.includes(title));
    expect(button).toBeDefined();
    await act(async () => button!.click());
  };

  await render();
  await chooseProject();
  await selectNote("Second");
  await selectNote("Plan");
  await act(async () => finishMove());
  expect(stored.sourceCwd).toBe("/work/portognjeeen");
  expect(projectButton()?.textContent).toContain("portognjeeen");
  await selectNote("Second");
  expect(stored.sourceCwd).toBe("/work/portognjeeen");
});

it("clears a failed move error when the saved project is selected again", async () => {
  await render();
  invoke.mockRejectedValueOnce(new Error("Disk full"));
  await chooseProject();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "Disk full",
  );

  await act(async () => projectButton()!.click());
  const original = [
    ...document.querySelectorAll<HTMLButtonElement>(
      '[aria-label="Project picker"] button[title]',
    ),
  ].find((item) => item.title === "/work/Edefyn");
  expect(original).toBeDefined();
  await act(async () => original!.click());

  expect(stored.sourceCwd).toBe("/work/Edefyn");
  expect(projectButton()?.textContent).toContain("Edefyn");
  expect(container.querySelector('[role="alert"]')).toBeNull();
});

async function editTitle(value: string) {
  const input = container.querySelector<HTMLInputElement>(
    '[aria-label="Note title"]',
  )!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
function button(label: string) {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (item) => item.textContent?.trim() === label,
  )!;
}

it("requires confirmation and resumes saving after a failed delete", async () => {
  vi.useFakeTimers();
  await render();
  const save = invoke.getMockImplementation()!;
  invoke.mockImplementation((command, args) =>
    command === "notes_delete"
      ? Promise.reject(new Error("Delete denied"))
      : save(command, args),
  );
  await act(async () => button("Delete").click());
  expect(
    invoke.mock.calls.some(([command]) => command === "notes_delete"),
  ).toBe(false);
  expect(container.textContent).toContain("Delete “Plan”?");
  await act(async () => button("Cancel").click());
  expect(container.textContent).not.toContain("This cannot be undone");
  await act(async () => button("Delete").click());
  await act(async () => button("Confirm delete").click());
  expect(container.textContent).toContain("Delete denied");
  await editTitle("Still editable");
  await act(async () => vi.advanceTimersByTime(400));
  expect(stored.title).toBe("Still editable");
});

it("does not recreate a successfully deleted note from queued saves", async () => {
  await render();
  const save = invoke.getMockImplementation()!;
  let deleted = false;
  invoke.mockImplementation((command, args) => {
    if (command === "notes_delete") {
      deleted = true;
      return Promise.resolve();
    }
    if (command === "notes_list" && deleted) return Promise.resolve([]);
    return save(command, args);
  });
  await editTitle("Pending changes");
  await act(async () => button("Delete").click());
  await act(async () => button("Confirm delete").click());
  expect(deleted).toBe(true);
  expect(container.querySelector('[aria-label="Note title"]')).toBeNull();
  expect(
    invoke.mock.calls.filter(([command]) => command === "notes_upsert"),
  ).toHaveLength(0);
});

it("shows list failures together with stale notes and supports retry", async () => {
  await render();
  invoke.mockRejectedValueOnce(new Error("Cannot refresh"));
  await act(async () => window.dispatchEvent(new Event(NOTES_CHANGED_EVENT)));
  expect(container.textContent).toContain("Cannot refresh");
  expect(
    container.querySelector<HTMLInputElement>('[aria-label="Note title"]')
      ?.value,
  ).toBe("Plan");
  await act(async () => button("Retry").click());
  expect(container.textContent).not.toContain("Cannot refresh");
});

it("does not describe an initial loading failure as an empty collection", async () => {
  invoke.mockRejectedValueOnce(new Error("Cannot read"));
  await render();
  expect(container.textContent).toContain("Cannot read");
  expect(container.textContent).not.toContain("No notes yet");
  await act(async () => button("Retry").click());
  expect(container.querySelector('[aria-label="Note title"]')).not.toBeNull();
});

it("recovers a failed unmount save after reopening the view", async () => {
  vi.useFakeTimers();
  await render();
  await editTitle("Retained draft");
  invoke.mockRejectedValueOnce(new Error("Disk full"));
  await act(async () => root.unmount());
  root = createRoot(container);
  await render();
  expect(
    container.querySelector<HTMLInputElement>('[aria-label="Note title"]')
      ?.value,
  ).toBe("Retained draft");
  expect(container.textContent).toContain("Disk full");
  await act(async () => button("Retry").click());
  expect(stored.title).toBe("Retained draft");
  expect(container.textContent).not.toContain("Disk full");
});

it("offers global retry after the notes view closes", async () => {
  await render();
  await editTitle("Global recovery");
  invoke.mockRejectedValueOnce(new Error("Offline disk"));
  await act(async () => root.unmount());
  root = createRoot(container);
  await act(async () => root.render(createElement(NoteDraftRecoveryNotice)));
  expect(document.body.textContent).toContain("Offline disk");
  await act(async () => button("Retry save").click());
  expect(stored.title).toBe("Global recovery");
  expect(document.body.textContent).not.toContain("Offline disk");
});

it("resizes the notes list from the keyboard and reports its current width", async () => {
  await render();
  const separator = container.querySelector<HTMLElement>('[role="separator"]')!;
  expect(separator.tabIndex).toBe(0);
  const before = Number(separator.getAttribute("aria-valuenow"));
  await act(async () =>
    separator.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowRight",
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  expect(Number(separator.getAttribute("aria-valuenow"))).toBe(before + 10);
  await act(async () =>
    separator.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Home",
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  expect(separator.getAttribute("aria-valuenow")).toBe(
    separator.getAttribute("aria-valuemin"),
  );
});

it("restores failed edits when switching away and returning to the note", async () => {
  vi.useFakeTimers();
  const second = { ...stored, id: "other-recovery-note", title: "Other note" };
  const save = invoke.getMockImplementation()!;
  let fail = true;
  invoke.mockImplementation((command, args) => {
    if (command === "notes_list")
      return Promise.resolve([{ ...stored }, second]);
    if (command === "notes_upsert" && fail)
      return Promise.reject(new Error("Unavailable storage"));
    return save(command, args);
  });
  const select = async (title: string) => {
    const item = [
      ...container.querySelectorAll<HTMLButtonElement>("li button"),
    ].find((entry) => entry.textContent?.includes(title))!;
    await act(async () => item.click());
  };
  await render();
  await select("Plan");
  await editTitle("Draft to recover");
  await select("Other note");
  expect(container.textContent).toContain("Unsaved note: Unavailable storage");
  await act(async () => button("Recover draft").click());
  expect(
    container.querySelector<HTMLInputElement>('[aria-label="Note title"]')
      ?.value,
  ).toBe("Draft to recover");
  expect(container.textContent).toContain(
    "Could not save note: Unavailable storage",
  );
  fail = false;
  await act(async () => button("Retry").click());
  expect(stored.title).toBe("Draft to recover");
});

it("hides and restores the global notice when Notes opens and closes", async () => {
  drafts.set("unselected-draft", {
    base: { ...stored, id: "unselected-draft", title: "Recovery notice" },
    edits: { current: { title: "Unsaved title" } },
    project: { current: null },
    skipSave: { current: false },
    error: "Retained failure",
  });
  await act(async () => root.render(createElement(NoteDraftRecoveryNotice)));
  expect(button("Retry save")).toBeDefined();
  await act(async () =>
    root.render(
      createElement(
        "div",
        null,
        createElement(NoteDraftRecoveryNotice),
        createElement(NotesView, { cwd: "/work/Edefyn", recents, onClose }),
      ),
    ),
  );
  expect(button("Retry save")).toBeUndefined();
  await act(async () => root.render(createElement(NoteDraftRecoveryNotice)));
  expect(button("Retry save")).toBeDefined();
});

it("releases successfully saved drafts after the editor unmounts", async () => {
  await render();
  await editTitle("Save and release");
  await act(async () => root.unmount());
  expect(stored.title).toBe("Save and release");
  expect(drafts.has(stored.id)).toBe(false);
  root = createRoot(container);
});
