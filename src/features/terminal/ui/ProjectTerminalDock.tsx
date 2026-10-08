import { t, useLocale } from "../../../shared/i18n";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  PanelBottom,
  PanelLeft,
  PanelRight,
  PanelTop,
  Plus,
  Terminal,
  Trash2,
} from "../../../shared/ui/icons";
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { ExplorerMenu } from "../../files/ui/ExplorerMenu";
import "./terminal.css";
import { IconButton } from "../../../app/shell/TitleBar";
import {
  clampDockSize,
  defaultDockSize,
  isVerticalDock,
  type DockSide,
  type ProjectTerminalDock,
} from "../../projects/model/projectTerminal";
import { MOD } from "../../../platform/tauri/platform";
import { terminalTabLabel, type TerminalMetaPatch } from "../model/terminalTab";
import { lazySurface } from "../../../shared/ui/lazySurface";
import {
  effectiveProfileId,
  useTerminalProfile,
  useTerminalProfiles,
} from "../model/terminalProfiles";

const TerminalView = lazySurface(async () => {
  const module = await import("./TerminalView");
  return { default: module.TerminalView };
});

type Props = {
  dock: ProjectTerminalDock;
  focused: boolean;
  onFocus: () => void;
  onHide: () => void;
  onSideChange: (side: DockSide) => void;
  onSizePaint: (size: number) => void;
  onSizeCommit: (size: number) => void;
  onAddTerminal: () => void;
  /** A terminal in another shell, from the profile menu beside New Terminal. */
  onAddTerminalWithProfile?: (profile: string) => void;
  /** Opens the setting that picks the shell new terminals start in. */
  onSelectDefaultProfile?: () => void;
  onSelectTerminal: (fileId: string) => void;
  onCloseTerminal: (fileId: string) => void;
  onCloseOtherTerminals: (fileId: string) => void;
  onReorderTerminals: (ids: string[]) => void;
  onTerminalMetaChange?: (fileId: string, patch: TerminalMetaPatch) => void;
};

const SIDE_ITEMS: { id: DockSide; label: string }[] = [
  { id: "bottom", get label() { return t("Dock Bottom"); } },
  { id: "top", get label() { return t("Dock Top"); } },
  { id: "left", get label() { return t("Dock Left"); } },
  { id: "right", get label() { return t("Dock Right"); } },
];

function sideIcon(side: DockSide) {
  if (side === "top") return PanelTop;
  if (side === "left") return PanelLeft;
  if (side === "right") return PanelRight;
  return PanelBottom;
}

function hideIcon(side: DockSide) {
  if (side === "top") return ChevronUp;
  if (side === "left") return ChevronLeft;
  if (side === "right") return ChevronRight;
  return ChevronDown;
}

export function ProjectTerminalDock({
  dock,
  focused,
  onFocus,
  onHide,
  onSideChange,
  onSizePaint,
  onSizeCommit,
  onAddTerminal,
  onAddTerminalWithProfile,
  onSelectDefaultProfile,
  onSelectTerminal,
  onCloseTerminal,
  onCloseOtherTerminals,
  onReorderTerminals,
  onTerminalMetaChange,
}: Props) {
  useLocale();
  const vertical = isVerticalDock(dock.side);
  const [dragging, setDragging] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [profileMenu, setProfileMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [terminalMenu, setTerminalMenu] = useState<{
    x: number;
    y: number;
    id: string;
  } | null>(null);
  const draggedTerminal = useRef<string | null>(null);
  const sideButton = useRef<HTMLDivElement>(null);
  const profileButton = useRef<HTMLDivElement>(null);
  const profiles = useTerminalProfiles();
  const chosenProfile = useTerminalProfile();
  const defaultProfile = effectiveProfileId(profiles, chosenProfile);
  const drag = useRef<{ start: number; size: number } | null>(null);
  const sizeRef = useRef(dock.size);
  sizeRef.current = dock.size;
  const pending = useRef(dock.size);
  const frame = useRef<number | null>(null);
  const SideIcon = sideIcon(dock.side);
  const HideIcon = hideIcon(dock.side);

  useEffect(() => {
    if (!dragging) return;
    const previous = document.body.style.cursor;
    document.body.style.cursor = vertical ? "row-resize" : "col-resize";
    return () => {
      document.body.style.cursor = previous;
    };
  }, [dragging, vertical]);

  useEffect(
    () => () => {
      if (frame.current != null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  const viewport = () => ({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  const paint = (next: number) => {
    pending.current = next;
    if (frame.current != null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      onSizePaint(pending.current);
    });
  };

  const commit = () => {
    if (frame.current != null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
    }
    onSizeCommit(pending.current);
  };

  const onResizePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      start: vertical ? event.clientY : event.clientX,
      size: sizeRef.current,
    };
    pending.current = sizeRef.current;
    setDragging(true);
  };

  const onResizePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const point = vertical ? event.clientY : event.clientX;
    const delta = point - drag.current.start;
    const signed =
      dock.side === "bottom" || dock.side === "right" ? -delta : delta;
    paint(clampDockSize(dock.side, drag.current.size + signed, viewport()));
  };

  const onResizePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    drag.current = null;
    commit();
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const sash =
    dock.side === "top"
      ? "absolute inset-x-0 -bottom-px z-10 h-1.5 cursor-row-resize touch-none"
      : dock.side === "bottom"
        ? "absolute inset-x-0 -top-px z-10 h-1.5 cursor-row-resize touch-none"
        : dock.side === "left"
          ? "absolute inset-y-0 -right-px z-10 w-1.5 cursor-col-resize touch-none"
          : "absolute inset-y-0 -left-px z-10 w-1.5 cursor-col-resize touch-none";

  return (
    <section
      data-project-terminal-dock=""
      className={`project-terminal-dock relative flex h-full min-h-0 min-w-0 ${
        dock.side === "top"
          ? "border-b"
          : dock.side === "bottom"
            ? "border-t"
            : dock.side === "left"
              ? "border-r"
              : "border-l"
      } border-stroke`}
      onMouseDown={onFocus}
    >
      <div
        role="separator"
        aria-orientation={vertical ? "horizontal" : "vertical"}
        aria-label={t("Resize terminal")}
        aria-valuenow={dock.size}
        className={`${sash} ${dragging ? "bg-content/15" : "hover:bg-content/10"}`}
        onPointerDown={onResizePointerDown}
        onPointerMove={onResizePointerMove}
        onPointerUp={onResizePointerUp}
        onPointerCancel={onResizePointerUp}
        onDoubleClick={() => {
          pending.current = defaultDockSize(dock.side);
          commit();
        }}
      />
      <aside className="terminal-sidebar" aria-label={t("Terminal controls")}>
        <div className="terminal-toolbar">
          <div className="flex min-w-0 items-center gap-0.5">
            <IconButton
              label={t("New Terminal ({p0}`)", { p0: MOD })}
              onClick={onAddTerminal}
            >
              <Plus className="size-3.5" strokeWidth={1.75} />
            </IconButton>
            {onAddTerminalWithProfile ? (
              <div ref={profileButton}>
                <IconButton
                  label={t("Launch Profile…")}
                  onClick={() => {
                    const rect = profileButton.current?.getBoundingClientRect();
                    if (!rect) return;
                    setProfileMenu({ x: rect.left, y: rect.bottom + 4 });
                  }}
                >
                  <ChevronDown className="size-3" strokeWidth={1.75} />
                </IconButton>
              </div>
            ) : null}
            <div ref={sideButton}>
              <IconButton
                label={t("Move Terminal")}
                onClick={() => {
                  const rect = sideButton.current?.getBoundingClientRect();
                  if (!rect) return;
                  setMenu({ x: rect.left, y: rect.bottom + 4 });
                }}
              >
                <SideIcon className="size-3.5" strokeWidth={1.75} />
              </IconButton>
            </div>
            <IconButton
              label={t("Close Active Terminal")}
              onClick={() => onCloseTerminal(dock.pane.activeFileId)}
            >
              <Trash2 className="size-3.5" strokeWidth={1.75} />
            </IconButton>
            <IconButton label={t("Hide Terminal ({p0}J)", { p0: MOD })} onClick={onHide}>
              <HideIcon className="size-3.5" strokeWidth={1.75} />
            </IconButton>
          </div>
        </div>
        <div
          className="terminal-list"
          role="tablist"
          aria-label={t("Terminals")}
          aria-orientation="vertical"
        >
          {dock.pane.files.map((file, index) => (
            <button
              key={file.id}
              id={`terminal-tab-${file.id}`}
              type="button"
              role="tab"
              aria-selected={file.id === dock.pane.activeFileId}
              aria-controls={`terminal-panel-${file.id}`}
              tabIndex={file.id === dock.pane.activeFileId ? 0 : -1}
              className="terminal-list-item"
              title={`${terminalTabLabel(file)} — ${file.cwd}`}
              draggable
              onClick={() => onSelectTerminal(file.id)}
              onAuxClick={(event) => {
                if (event.button === 1) onCloseTerminal(file.id);
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                setTerminalMenu({
                  x: event.clientX,
                  y: event.clientY,
                  id: file.id,
                });
              }}
              onKeyDown={(event) => {
                const files = dock.pane.files;
                const next =
                  event.key === "ArrowDown"
                    ? (index + 1) % files.length
                    : event.key === "ArrowUp"
                      ? (index - 1 + files.length) % files.length
                      : event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? files.length - 1
                          : null;
                if (next !== null) {
                  event.preventDefault();
                  onSelectTerminal(files[next].id);
                  document
                    .getElementById(`terminal-tab-${files[next].id}`)
                    ?.focus();
                }
              }}
              onDragStart={(event) => {
                draggedTerminal.current = file.id;
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", file.id);
              }}
              onDragEnd={() => {
                draggedTerminal.current = null;
              }}
              onDragOver={(event) => {
                if (draggedTerminal.current) event.preventDefault();
              }}
              onDrop={(event) => {
                event.preventDefault();
                const dragged = draggedTerminal.current;
                draggedTerminal.current = null;
                if (!dragged || dragged === file.id) return;
                const ids = dock.pane.files.map((item) => item.id);
                const source = ids.indexOf(dragged);
                if (source < 0) return;
                ids.splice(source, 1);
                ids.splice(index, 0, dragged);
                onReorderTerminals(ids);
              }}
            >
              <Terminal className="size-3 shrink-0" strokeWidth={1.5} />
              <span className="min-w-0 flex-1 truncate">
                {terminalTabLabel(file)}
              </span>
            </button>
          ))}
        </div>
      </aside>
      <div className="terminal-canvas relative min-h-0 min-w-0 flex-1">
        {dock.pane.files.map((file) => (
          <div
            key={file.id}
            id={`terminal-panel-${file.id}`}
            role="tabpanel"
            aria-labelledby={`terminal-tab-${file.id}`}
            aria-hidden={file.id !== dock.pane.activeFileId}
            className={
              file.id === dock.pane.activeFileId
                ? "absolute inset-0 h-full"
                : "hidden"
            }
          >
            <TerminalView
              id={file.id}
              cwd={file.cwd}
              profile={file.shellProfile}
              active={focused && file.id === dock.pane.activeFileId}
              onMetaChange={(patch) => onTerminalMetaChange?.(file.id, patch)}
            />
          </div>
        ))}
      </div>
      {terminalMenu ? (
        <ExplorerMenu
          x={terminalMenu.x}
          y={terminalMenu.y}
          ariaLabel="Terminal actions"
          items={[
            { kind: "item", id: "close", get label() { return t("Close"); } },
            {
              kind: "item",
              id: "close-others",
              get label() { return t("Close Others"); },
              disabled: dock.pane.files.length < 2,
            },
          ]}
          onPick={(id) => {
            if (id === "close") onCloseTerminal(terminalMenu.id);
            if (id === "close-others") onCloseOtherTerminals(terminalMenu.id);
            setTerminalMenu(null);
          }}
          onClose={() => setTerminalMenu(null)}
        />
      ) : null}
      {profileMenu ? (
        <ExplorerMenu
          x={profileMenu.x}
          y={profileMenu.y}
          ariaLabel="Terminal profiles"
          items={[
            ...(profiles?.profiles ?? []).map((profile) => ({
              kind: "item" as const,
              id: `profile:${profile.id}`,
              label: profile.name,
              description:
                profile.id === defaultProfile ? "Default" : undefined,
              checked: profile.id === defaultProfile,
            })),
            ...(profiles && profiles.profiles.length === 0
              ? [
                  {
                    kind: "item" as const,
                    id: "none",
                    get label() { return t("No shells found"); },
                    disabled: true,
                  },
                ]
              : []),
            ...(onSelectDefaultProfile
              ? [
                  { kind: "sep" as const },
                  {
                    kind: "item" as const,
                    id: "default",
                    get label() { return t("Select Default Profile…"); },
                  },
                ]
              : []),
          ]}
          onPick={(id) => {
            setProfileMenu(null);
            if (id === "default") onSelectDefaultProfile?.();
            else if (id.startsWith("profile:"))
              onAddTerminalWithProfile?.(id.slice("profile:".length));
          }}
          onClose={() => setProfileMenu(null)}
        />
      ) : null}
      {menu ? (
        <ExplorerMenu
          x={menu.x}
          y={menu.y}
          ariaLabel="Move terminal"
          items={SIDE_ITEMS.map((item) => ({
            kind: "item" as const,
            id: item.id,
            label: item.label,
            checked: item.id === dock.side,
          }))}
          onPick={(id) => {
            if (
              id === "top" ||
              id === "bottom" ||
              id === "left" ||
              id === "right"
            ) {
              onSideChange(id);
            }
            setMenu(null);
          }}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </section>
  );
}
