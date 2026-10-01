import { useEffect, useMemo, useState, type RefObject } from "react";
import { ask, message } from "@tauri-apps/plugin-dialog";
import { Loader, MoreHorizontal } from "../../../shared/ui/icons";
import { ExplorerMenu } from "../../files/ui/ExplorerMenu";
import {
  gitBranches,
  gitCreateBranch,
  gitCreateBranchFrom,
  gitCreateTag,
  gitDeleteTag,
  gitFetch,
  gitOperationAbort,
  gitOperationState,
  gitPull,
  gitPush,
  gitRemoteAdd,
  gitRemoteRemove,
  gitRemotes,
  gitRenameBranch,
  gitMerge,
  gitRebase,
  gitStash,
  gitStashAction,
  gitStashClear,
  gitStashList,
  gitSync,
  gitTags,
  gitUndoLastCommit,
  type GitDiffIndex,
  type GitHistoryCommit,
  type GitOperation,
  type GitStashEntry,
  type GitStashMode,
} from "../../../platform/tauri/fs";
import { isRemoteProjectPath } from "../../projects/model/recents";
import { useProjectBranchesState } from "../hooks/useProjectBranches";
import { deleteLocalBranch } from "../model/deleteBranch";
import { operationLabel } from "../model/commitActions";
import {
  commitMenuOptions,
  gitActionsMenuItems,
  type CommitMenuOptions,
} from "../model/gitActionsMenu";
import { BranchManagerDialog } from "./BranchManagerDialog";
import { GitPickDialog, type PickItem } from "./GitPickDialog";
import { stashCommit } from "./GitStashSection";
import { RefNameDialog } from "./RefNameDialog";

/** The `busy` key the menu's own actions hold while they run. */
export const GIT_MENU_BUSY = "git-menu";

/** What the changed-files list exposes so the menu can drive its commit box. */
export type ChangesActions = {
  commit: (options: CommitMenuOptions) => Promise<void>;
  runAll: (action: "stage" | "unstage" | "discard") => Promise<void>;
};

type Props = {
  cwd: string;
  index: GitDiffIndex | null;
  busy: string | null;
  setBusy: (value: string | null) => void;
  autoFetch: boolean;
  onToggleAutoFetch: () => void;
  changes: RefObject<ChangesActions | null>;
  onStatus: (text: string) => void;
  /** Reload everything after git ran, whether or not it succeeded. */
  onMutated: () => void;
  onOpenCommit: (commit: GitHistoryCommit, pin?: boolean) => void;
};

/** What the open menu needs beyond the diff index. */
type MenuData = {
  operation: GitOperation | null;
  stashCount: number;
  tagCount: number;
  remoteCount: number;
};

const NO_DATA: MenuData = {
  operation: null,
  stashCount: 0,
  tagCount: 0,
  remoteCount: 0,
};

type Dialog =
  | { kind: "branches" }
  | {
      kind: "pick";
      title: string;
      description?: string;
      placeholder: string;
      emptyText: string;
      items: PickItem[];
      onPick: (id: string) => void;
    }
  | {
      kind: "name";
      title: string;
      description: string;
      label: string;
      placeholder: string;
      submitLabel: string;
      initialValue?: string;
      extra?: { label: string; placeholder: string };
      onSubmit: (name: string, extra: string) => void;
    };

function errorText(error: unknown): string {
  if (typeof error === "string") return error;
  return error instanceof Error ? error.message : String(error);
}

/** A failed lookup counts as "nothing there" rather than breaking the menu. */
async function orElse<T>(work: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await work();
  } catch {
    return fallback;
  }
}

function confirm(text: string, okLabel: string): Promise<boolean> {
  return ask(text, { title: "MonoCode", kind: "warning", okLabel });
}

/** The header "…" button and the source-control menu it opens. */
export function GitActionsMenu({
  cwd,
  index,
  busy,
  setBusy,
  autoFetch,
  onToggleAutoFetch,
  changes,
  onStatus,
  onMutated,
  onOpenCommit,
}: Props) {
  // Everything beyond Pull is not implemented for connected machines.
  const local = !isRemoteProjectPath(cwd);
  const { branches } = useProjectBranchesState(cwd, local);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [data, setData] = useState<MenuData>(NO_DATA);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const open = anchor !== null;

  useEffect(() => {
    if (!open || !local) return;
    let cancelled = false;
    void (async () => {
      const [operation, stashes, tags, remotes] = await Promise.all([
        orElse(() => gitOperationState(cwd), null),
        orElse(() => gitStashList(cwd), []),
        orElse(() => gitTags(cwd), []),
        orElse(() => gitRemotes(cwd), []),
      ]);
      if (cancelled) return;
      setData({
        operation,
        stashCount: stashes.length,
        tagCount: tags.length,
        remoteCount: remotes.length,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [open, local, cwd]);

  const branch = index?.branch ?? null;
  const items = useMemo(() => {
    const files = index?.files ?? [];
    const others = (branches?.branches ?? []).filter((item) => !item.current);
    return gitActionsMenuItems({
      local,
      busy: busy !== null,
      branch,
      hasCommits: Boolean(index?.head),
      hasRemote: Boolean(index?.remote),
      hasUpstream: Boolean(index?.upstream),
      ahead: index?.ahead ?? 0,
      stagedCount: files.filter((file) => file.staged).length,
      unstagedCount: files.filter((file) => file.unstaged).length,
      changedCount: files.length,
      otherBranchCount: others.length,
      otherLocalBranchCount: others.filter((item) => !item.remote).length,
      autoFetch,
      ...data,
    });
  }, [autoFetch, branch, branches, busy, data, index, local]);

  const run = async (work: () => Promise<unknown>, status?: string) => {
    setBusy(GIT_MENU_BUSY);
    try {
      await work();
      if (status) onStatus(status);
    } catch (error) {
      await message(errorText(error), { title: "MonoCode", kind: "error" });
    } finally {
      setBusy(null);
      onMutated();
    }
  };

  /** Load a list for a pick dialog, then show it. */
  const choose = async (
    load: () => Promise<PickItem[]>,
    dialog: Omit<Extract<Dialog, { kind: "pick" }>, "kind" | "items">,
  ) => {
    try {
      setDialog({ kind: "pick", items: await load(), ...dialog });
    } catch (error) {
      await message(errorText(error), { title: "MonoCode", kind: "error" });
    }
  };

  const askName = (
    spec: Omit<Extract<Dialog, { kind: "name" }>, "kind" | "onSubmit">,
    submit: (name: string, extra: string) => Promise<unknown>,
    status?: string,
  ) =>
    setDialog({
      kind: "name",
      ...spec,
      onSubmit: (name, extra) => {
        setDialog(null);
        void run(() => submit(name, extra), status);
      },
    });

  /** Branches to pick from; `localOnly` and `skipCurrent` narrow the list. */
  const branchItems = async (localOnly: boolean, skipCurrent: boolean) => {
    const listed = await gitBranches(cwd);
    return listed.branches
      .filter((item) => !(localOnly && item.remote) && !(skipCurrent && item.current))
      .map((item): PickItem => {
        const ref = item.remote ? `${item.remote}/${item.name}` : item.name;
        return { id: ref, label: ref, detail: item.remote ? "remote" : undefined };
      });
  };

  const stashItems = async () => {
    const entries = await gitStashList(cwd);
    return {
      entries,
      items: entries.map(
        (entry): PickItem => ({
          id: String(entry.index),
          label: entry.message,
          detail: `stash@{${entry.index}}`,
        }),
      ),
    };
  };

  const pickStash = async (
    title: string,
    onEntry: (entry: GitStashEntry, count: number) => void,
  ) => {
    let entries: GitStashEntry[] = [];
    await choose(
      async () => {
        const listed = await stashItems();
        entries = listed.entries;
        return listed.items;
      },
      {
        title,
        placeholder: "Filter stashes",
        emptyText: "No stashes",
        onPick: (id) => {
          setDialog(null);
          const entry = entries.find((candidate) => String(candidate.index) === id);
          if (entry) onEntry(entry, entries.length);
        },
      },
    );
  };

  const stashWith = (mode: GitStashMode) =>
    run(() => gitStash(cwd, undefined, mode), "Changes stashed");

  const undoLastCommit = async () => {
    if (
      index?.headPushed &&
      !(await confirm(
        "The last commit is already pushed. Undo it here anyway? Pushing the result later needs a force push from the terminal.",
        "Undo Commit",
      ))
    ) {
      return;
    }
    await run(() => gitUndoLastCommit(cwd), "Last commit undone");
  };

  const abortOperation = async () => {
    if (!data.operation) return;
    const label = operationLabel(data.operation).toLowerCase();
    if (
      !(await confirm(
        `Abort the ${label}? Changes made while resolving it are discarded.`,
        "Abort",
      ))
    ) {
      return;
    }
    await run(() => gitOperationAbort(cwd));
  };

  const handle = async (id: string) => {
    const commit = commitMenuOptions(id);
    if (commit) return void changes.current?.commit(commit);
    switch (id) {
      case "pull":
        return run(() => gitPull(cwd), "Pull complete");
      case "pull-rebase":
        return run(() => gitPull(cwd, true), "Pull complete");
      case "push":
      case "branch-publish":
        return run(() => gitPush(cwd), "Push complete");
      case "sync":
        return run(() => gitSync(cwd), "Sync complete");
      case "fetch":
        return run(() => gitFetch(cwd), "Fetch complete");
      case "fetch-prune":
        return run(() => gitFetch(cwd, true), "Fetch complete");
      case "auto-fetch":
        return onToggleAutoFetch();
      case "checkout":
        return setDialog({ kind: "branches" });
      case "undo-commit":
        return undoLastCommit();
      case "abort-operation":
        return abortOperation();
      case "stage-all":
        return void changes.current?.runAll("stage");
      case "unstage-all":
        return void changes.current?.runAll("unstage");
      case "discard-all":
        return void changes.current?.runAll("discard");
      case "branch-merge":
        return choose(() => branchItems(false, true), {
          title: "Merge Branch",
          description: branch ? `Merge into ${branch}` : undefined,
          placeholder: "Filter branches",
          emptyText: "No other branches",
          onPick: (ref) => {
            setDialog(null);
            void run(() => gitMerge(cwd, ref));
          },
        });
      case "branch-rebase":
        return choose(() => branchItems(false, true), {
          title: "Rebase Branch",
          description: branch ? `Rebase ${branch} onto` : undefined,
          placeholder: "Filter branches",
          emptyText: "No other branches",
          onPick: (ref) => {
            setDialog(null);
            void run(() => gitRebase(cwd, ref));
          },
        });
      case "branch-create":
        return askName(
          {
            title: "Create Branch",
            description: "Create a branch at HEAD and switch to it.",
            label: "Branch name",
            placeholder: "feature/my-branch",
            submitLabel: "Create Branch",
          },
          (name) => gitCreateBranch(cwd, name),
        );
      case "branch-create-from":
        return choose(() => branchItems(false, false), {
          title: "Create Branch From",
          placeholder: "Filter branches",
          emptyText: "No branches",
          onPick: (ref) =>
            askName(
              {
                title: "Create Branch",
                description: `Create a branch from ${ref} and switch to it.`,
                label: "Branch name",
                placeholder: "feature/my-branch",
                submitLabel: "Create Branch",
              },
              (name) => gitCreateBranchFrom(cwd, name, ref),
            ),
        });
      case "branch-rename":
        if (!branch) return;
        return askName(
          {
            title: "Rename Branch",
            description: `Rename ${branch}.`,
            label: "New name",
            placeholder: "feature/my-branch",
            submitLabel: "Rename",
            initialValue: branch,
          },
          (name) => gitRenameBranch(cwd, branch, name),
        );
      case "branch-delete":
        return choose(() => branchItems(true, true), {
          title: "Delete Branch",
          placeholder: "Filter branches",
          emptyText: "No other local branches",
          onPick: (name) => {
            setDialog(null);
            void run(() => deleteLocalBranch(cwd, name));
          },
        });
      case "remote-add":
        return askName(
          {
            title: "Add Remote",
            description: "Add a named remote to this repository.",
            label: "Remote name",
            placeholder: "origin",
            submitLabel: "Add Remote",
            extra: { label: "Remote URL", placeholder: "https://github.com/owner/repo.git" },
          },
          (name, url) => gitRemoteAdd(cwd, name, url),
        );
      case "remote-remove":
        return choose(
          async () =>
            (await gitRemotes(cwd)).map(
              (remote): PickItem => ({
                id: remote.name,
                label: remote.name,
                detail: remote.url,
              }),
            ),
          {
            title: "Remove Remote",
            placeholder: "Filter remotes",
            emptyText: "No remotes",
            onPick: (name) => {
              setDialog(null);
              void (async () => {
                const confirmed = await confirm(
                  `Remove remote ${name}? Its remote-tracking branches are deleted from this repository. Nothing changes on the server.`,
                  "Remove",
                );
                if (confirmed) await run(() => gitRemoteRemove(cwd, name));
              })();
            },
          },
        );
      case "stash":
        return stashWith("tracked");
      case "stash-untracked":
        return stashWith("untracked");
      case "stash-staged":
        return stashWith("staged");
      case "stash-apply-latest":
        return run(() => gitStashAction(cwd, "apply", 0));
      case "stash-pop-latest":
        return run(() => gitStashAction(cwd, "pop", 0));
      case "stash-apply":
        return pickStash("Apply Stash", (entry) =>
          void run(() => gitStashAction(cwd, "apply", entry.index)),
        );
      case "stash-pop":
        return pickStash("Pop Stash", (entry) =>
          void run(() => gitStashAction(cwd, "pop", entry.index)),
        );
      case "stash-drop":
        return pickStash("Drop Stash", (entry) =>
          void (async () => {
            const confirmed = await confirm(
              `Drop "${entry.message}"? The stashed changes are lost.`,
              "Drop",
            );
            if (confirmed) await run(() => gitStashAction(cwd, "drop", entry.index));
          })(),
        );
      case "stash-drop-all": {
        const count = data.stashCount;
        const confirmed = await confirm(
          `Drop all ${count} stash${count === 1 ? "" : "es"}? The stashed changes are lost.`,
          "Drop All",
        );
        if (confirmed) await run(() => gitStashClear(cwd));
        return;
      }
      case "stash-view":
        return pickStash("View Stash", (entry) => onOpenCommit(stashCommit(entry)));
      case "tag-create": {
        const head = index?.head;
        if (!head) return;
        return askName(
          {
            title: "Create Tag",
            description: "Tag the commit at HEAD.",
            label: "Tag name",
            placeholder: "v1.0.0",
            submitLabel: "Create Tag",
          },
          (name) => gitCreateTag(cwd, name, head),
        );
      }
      case "tag-delete":
        return choose(
          async () =>
            (await gitTags(cwd)).map((name): PickItem => ({ id: name, label: name })),
          {
            title: "Delete Tag",
            placeholder: "Filter tags",
            emptyText: "No tags",
            onPick: (name) => {
              setDialog(null);
              void (async () => {
                const confirmed = await confirm(
                  `Delete tag ${name}? A copy already pushed to a remote stays there.`,
                  "Delete",
                );
                if (confirmed) await run(() => gitDeleteTag(cwd, name));
              })();
            },
          },
        );
    }
  };

  return (
    <>
      <button
        type="button"
        aria-haspopup="menu"
        aria-label="Branch actions"
        aria-expanded={open}
        disabled={busy !== null}
        onClick={(event) => {
          const button = event.currentTarget;
          setAnchor((current) => (current ? null : button));
        }}
        className="grid size-5 shrink-0 place-items-center rounded-md text-content/50 hover:bg-content/10 hover:text-content disabled:opacity-40 aria-expanded:bg-content/10 aria-expanded:text-content"
      >
        {busy === GIT_MENU_BUSY ? (
          <Loader className="size-3.5 animate-spin" strokeWidth={1.75} />
        ) : (
          <MoreHorizontal className="size-4" strokeWidth={2} />
        )}
      </button>
      {anchor ? (
        <ExplorerMenu
          anchor={anchor}
          items={items}
          ariaLabel="Branch actions"
          width={232}
          onPick={(id) => {
            setAnchor(null);
            void handle(id);
          }}
          onClose={() => setAnchor(null)}
        />
      ) : null}
      {dialog?.kind === "branches" ? (
        <BranchManagerDialog cwd={cwd} onClose={() => setDialog(null)} />
      ) : null}
      {dialog?.kind === "pick" ? (
        <GitPickDialog
          key={dialog.title}
          title={dialog.title}
          description={dialog.description}
          placeholder={dialog.placeholder}
          emptyText={dialog.emptyText}
          items={dialog.items}
          onPick={dialog.onPick}
          onCancel={() => setDialog(null)}
        />
      ) : null}
      {dialog?.kind === "name" ? (
        <RefNameDialog
          key={dialog.title}
          title={dialog.title}
          description={dialog.description}
          label={dialog.label}
          placeholder={dialog.placeholder}
          submitLabel={dialog.submitLabel}
          initialValue={dialog.initialValue}
          extra={dialog.extra}
          busy={false}
          onSubmit={dialog.onSubmit}
          onCancel={() => setDialog(null)}
        />
      ) : null}
    </>
  );
}
