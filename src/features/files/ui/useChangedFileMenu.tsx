import { useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { message } from "@tauri-apps/plugin-dialog";
import { copyText } from "../../../platform/tauri/clipboard";
import { openPathWithDefaultApp, revealPath } from "../../../platform/tauri/fs";
import { IS_MAC, IS_WIN } from "../../../platform/tauri/platform";
import { parentPath } from "../../../shared/lib/paths";
import { PRODUCT_IDENTITY } from "../../../shared/lib/productIdentity";
import { ExplorerMenu, type ExplorerMenuItem } from "./ExplorerMenu";
import { canPreviewFile } from "../model/filePreview";
import { setMarkdownViewMode } from "../../sessions/ui/MarkdownModeToggle";

type Action = {
  id: string;
  label: string;
  disabled?: boolean;
  danger?: boolean;
  run: () => void | Promise<void>;
};

/** Shared actions for checkpoint and Git change rows, including deleted files. */
export function useChangedFileMenu({
  path,
  relative,
  deleted = false,
  onOpenChanges,
  onOpenFile,
  actions = [],
}: {
  path: string;
  relative: string;
  deleted?: boolean;
  onOpenChanges: () => void;
  onOpenFile?: () => void;
  actions?: Action[];
}) {
  const [position, setPosition] = useState<{ x: number; y: number } | null>(
    null,
  );
  const trigger = useRef<HTMLElement | null>(null);
  const remote = path.startsWith("remote://");
  const items: ExplorerMenuItem[] = [
    { kind: "item", id: "changes", label: "View Changes" },
    ...(onOpenFile && canPreviewFile(path)
      ? [
          {
            kind: "item" as const,
            id: "preview",
            label: "Preview",
            disabled: deleted,
          },
        ]
      : []),
    ...(onOpenFile
      ? [
          {
            kind: "item" as const,
            id: "open",
            label: `Open in ${PRODUCT_IDENTITY.displayName}`,
            disabled: deleted,
          },
        ]
      : []),
    {
      kind: "item",
      id: "default",
      label: "Open in Default App",
      disabled: deleted || remote,
    },
    {
      kind: "item",
      id: "reveal",
      label: IS_MAC
        ? "Reveal in Finder"
        : IS_WIN
          ? "Reveal in File Explorer"
          : "Open Containing Folder",
    },
    { kind: "sep" },
    { kind: "item", id: "copy-path", label: "Copy Path" },
    { kind: "item", id: "copy-relative", label: "Copy Relative Path" },
    ...(actions.length
      ? [
          { kind: "sep" as const },
          ...actions.map(({ run: _run, ...action }) => ({
            kind: "item" as const,
            ...action,
          })),
        ]
      : []),
  ];
  const close = () => {
    setPosition(null);
    trigger.current?.focus();
  };
  const pick = (id: string) => {
    close();
    void (async () => {
      switch (id) {
        case "changes":
          return onOpenChanges();
        case "preview":
          if (!deleted && onOpenFile && canPreviewFile(path)) {
            setMarkdownViewMode(path, "preview");
            return onOpenFile();
          }
          return;
        case "open":
          if (!deleted) return onOpenFile?.();
          return;
        case "default":
          if (!deleted && !remote) await openPathWithDefaultApp(path);
          return;
        case "reveal":
          await revealPath(deleted ? parentPath(path) : path);
          return;
        case "copy-path":
          await copyText(path);
          return;
        case "copy-relative":
          await copyText(relative);
          return;
        default: {
          const action = actions.find((item) => item.id === id);
          if (action && !action.disabled) await action.run();
        }
      }
    })().catch((error) =>
      message(String(error), { title: "File action failed", kind: "error" }),
    );
  };
  return {
    onContextMenu: (event: MouseEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      trigger.current =
        (event.target as HTMLElement).closest<HTMLElement>("button") ??
        event.currentTarget;
      setPosition({ x: event.clientX, y: event.clientY });
    },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (
        event.key !== "ContextMenu" &&
        !(event.shiftKey && event.key === "F10")
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      trigger.current = event.target as HTMLElement;
      const rect = trigger.current.getBoundingClientRect();
      setPosition({ x: rect.left, y: rect.bottom });
    },
    menu: position ? (
      <ExplorerMenu
        {...position}
        ariaLabel="Changed file actions"
        items={items}
        onPick={pick}
        onClose={close}
      />
    ) : null,
  };
}
