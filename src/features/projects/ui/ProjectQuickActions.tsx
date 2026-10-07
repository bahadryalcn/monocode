import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  listExternalEditors,
  openInExternalEditor,
  revealPath,
  type ExternalEditor,
} from "../../../platform/tauri/fs";
import { IS_MAC } from "../../../platform/tauri/platform";
import { isLocalProject } from "../model/recents";
import {
  ExplorerMenu,
  type ExplorerMenuItem,
} from "../../files/ui/ExplorerMenu";
import { Modal } from "../../../shared/ui/Modal";
import { ExternalEditorIcon } from "./ExternalEditorIcon";
import { ProjectActionDialog } from "./ProjectActionDialog";
import { hasActiveOverlay } from "../../../shared/ui/overlay";
import { shortcutMatches } from "../../settings/model/settings";
import { quickComposerShortcutLabel } from "../../quick-composer/model/quickComposerShortcut";
import {
  ChevronDown,
  CodeBlock,
  FolderOpen,
  Globe,
  Play,
  Plus,
  Terminal,
  Wrench,
} from "../../../shared/ui/icons";
import {
  loadProjectActions,
  saveProjectActions,
  projectActionShortcutError,
  PROJECT_ACTIONS_CHANGED,
  type ProjectAction,
} from "../model/projectActions";

const ICONS = {
  play: Play,
  terminal: Terminal,
  code: CodeBlock,
  globe: Globe,
  wrench: Wrench,
};
const emptyAction = (): ProjectAction => ({
  id: crypto.randomUUID(),
  name: "",
  icon: "play",
  command: "",
  url: "",
});
const buttonClass =
  "flex h-7 items-center gap-1.5 rounded px-2 text-xs text-content/65 hover:bg-content/10 hover:text-content focus-visible:outline focus-visible:outline-accent";

export function ProjectQuickActions({
  cwd,
  onRun,
}: {
  cwd: string;
  onRun?: (action: ProjectAction) => void;
}) {
  const [menu, setMenu] = useState<{
    kind: "open" | "actions";
    anchor: HTMLElement;
  } | null>(null);
  const [editors, setEditors] = useState<ExternalEditor[]>([]);
  const [loading, setLoading] = useState(false);
  const [actions, setActions] = useState(() => loadProjectActions(cwd));
  const [draft, setDraft] = useState<ProjectAction | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const local = isLocalProject(cwd);

  useEffect(() => {
    const reload = () => setActions(loadProjectActions(cwd));
    reload();
    setMenu(null);
    setDraft(null);
    setError("");
    window.addEventListener(PROJECT_ACTIONS_CHANGED, reload);
    window.addEventListener("storage", reload);
    return () => {
      window.removeEventListener(PROJECT_ACTIONS_CHANGED, reload);
      window.removeEventListener("storage", reload);
    };
  }, [cwd]);

  useEffect(() => {
    if (menu?.kind !== "open") return;
    let active = true;
    setLoading(true);
    void listExternalEditors()
      .then((values) => {
        if (active) setEditors(values);
      })
      .catch((reason: unknown) => {
        if (active) {
          setEditors([]);
          setError(String(reason));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [menu?.kind]);

  useEffect(() => {
    if (!local) return;
    const onKey = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.isComposing ||
        hasActiveOverlay()
      )
        return;
      const action = actions.find(
        (value) =>
          value.shortcut &&
          shortcutMatches(value.shortcut, event) &&
          !projectActionShortcutError(value.shortcut, actions, value.id),
      );
      if (!action || (action.command.trim() && !onRun)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setMenu(null);
      setError("");
      if (action.command.trim()) onRun?.(action);
      if (action.url.trim() && action.openUrlOnRun !== false)
        void openUrl(action.url.trim()).catch((reason: unknown) =>
          setError(String(reason)),
        );
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [local, actions, onRun]);

  if (!local) return null;
  const persist = (values: ProjectAction[]) => {
    try {
      saveProjectActions(cwd, values);
      setActions(values);
      setDraft(null);
      setError("");
    } catch (reason) {
      setError(`Could not save actions: ${String(reason)}`);
    }
  };
  const run = (action: ProjectAction) => {
    setMenu(null);
    setError("");
    if (action.command.trim()) onRun?.(action);
    if (action.url.trim() && action.openUrlOnRun !== false)
      void openUrl(action.url.trim()).catch((reason: unknown) =>
        setError(String(reason)),
      );
  };
  const openItems: ExplorerMenuItem[] = [
    ...editors.map((editor) => ({
      kind: "item" as const,
      id: editor.id,
      label: editor.name,
      icon: <ExternalEditorIcon id={editor.id} />,
    })),
    ...(loading
      ? [
          {
            kind: "item" as const,
            id: "loading",
            label: "Finding installed editors…",
            disabled: true,
          },
        ]
      : []),
    { kind: "sep" },
    {
      kind: "item",
      id: "folder",
      label: IS_MAC ? "Finder" : "File Explorer",
      icon: <FolderOpen className="size-4 text-amber-400" />,
    },
  ];
  const actionItems: ExplorerMenuItem[] = [
    ...actions.map((action) => {
      const Icon = ICONS[action.icon];
      return {
        kind: "item" as const,
        id: action.id,
        label: action.name,
        description: action.command || action.url,
        shortcut: action.shortcut
          ? quickComposerShortcutLabel(action.shortcut)
          : undefined,
        icon: <Icon className="size-4" />,
        submenu: [
          {
            kind: "item" as const,
            id: `run:${action.id}`,
            label: "Run action",
            disabled: Boolean(action.command.trim() && !onRun),
          },
          {
            kind: "item" as const,
            id: `edit:${action.id}`,
            label: "Edit action",
          },
        ],
      };
    }),
    ...(actions.length ? [{ kind: "sep" as const }] : []),
    {
      kind: "item",
      id: "add",
      label: "Add action…",
      icon: <Plus className="size-4" />,
    },
  ];
  const selected = actions[0];
  const SelectedIcon = selected ? ICONS[selected.icon] : Play;
  return (
    <div
      className="flex items-center gap-1 px-1"
      data-tauri-drag-region="false"
    >
      {selected ? (
        <button
          className={buttonClass}
          title={selected.command || selected.url}
          aria-label={`Run ${selected.name}`}
          disabled={Boolean(selected.command.trim() && !onRun)}
          onClick={() => run(selected)}
        >
          <SelectedIcon className="size-3.5 text-accent" />
          <span className="max-w-24 truncate">{selected.name}</span>
        </button>
      ) : null}
      <button
        className={buttonClass}
        aria-label="Project actions"
        aria-haspopup="menu"
        aria-expanded={menu?.kind === "actions"}
        onClick={(event) => {
          setError("");
          setMenu(
            menu?.kind === "actions"
              ? null
              : { kind: "actions", anchor: event.currentTarget },
          );
        }}
      >
        <Play className="size-3.5" />
        {!selected ? <span>Actions</span> : null}
        <ChevronDown className="size-3" />
      </button>
      <button
        className={buttonClass}
        aria-label="Open project in"
        aria-haspopup="menu"
        aria-expanded={menu?.kind === "open"}
        onClick={(event) => {
          setError("");
          setMenu(
            menu?.kind === "open"
              ? null
              : { kind: "open", anchor: event.currentTarget },
          );
        }}
      >
        <FolderOpen className="size-3.5" />
        <span>Open</span>
        <ChevronDown className="size-3" />
      </button>
      {menu ? (
        <ExplorerMenu
          anchor={menu.anchor}
          ariaLabel={
            menu.kind === "open" ? "Open project in" : "Project actions"
          }
          items={menu.kind === "open" ? openItems : actionItems}
          onClose={() => setMenu(null)}
          onPick={(id) => {
            if (menu.kind === "open") {
              setMenu(null);
              void (
                id === "folder"
                  ? revealPath(cwd)
                  : openInExternalEditor(id, cwd)
              ).catch((reason: unknown) => setError(String(reason)));
            } else if (id === "add") {
              setMenu(null);
              setEditing(false);
              setDraft(emptyAction());
            } else {
              const action = actions.find(
                (value) => value.id === id.replace(/^(run|edit):/, ""),
              );
              if (!action) return;
              if (id.startsWith("edit:")) {
                setMenu(null);
                setEditing(true);
                setDraft({ ...action });
              } else run(action);
            }
          }}
        />
      ) : null}
      {error && !draft ? (
        <Modal
          title="Project action failed"
          onClose={() => setError("")}
          size="sm"
        >
          <p className="break-words p-5 text-sm text-content" role="alert">
            {error}
          </p>
        </Modal>
      ) : null}
      {draft ? (
        <ProjectActionDialog
          key={draft.id}
          action={draft}
          actions={actions}
          cwd={cwd}
          editing={editing}
          error={error}
          onClose={() => {
            setDraft(null);
            setError("");
          }}
          onDelete={() =>
            persist(actions.filter((action) => action.id !== draft.id))
          }
          onSave={(saved) =>
            persist(
              editing
                ? actions.map((action) =>
                    action.id === saved.id ? saved : action,
                  )
                : [...actions, saved],
            )
          }
        />
      ) : null}
    </div>
  );
}
