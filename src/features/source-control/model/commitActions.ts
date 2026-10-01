import type { GitHistoryCommit, GitResetMode } from "../../../platform/tauri/fs";
import type { ExplorerMenuItem } from "../../files/ui/ExplorerMenu";

export type CommitAction =
  | "checkout"
  | "branch"
  | "tag"
  | "cherry-pick"
  | "revert"
  | `reset-${GitResetMode}`
  | "copy-sha";

/** Context menu for one graph row. HEAD cannot be picked or reset onto itself. */
export function commitMenuItems(commit: GitHistoryCommit): ExplorerMenuItem[] {
  return [
    { kind: "item", id: "checkout", label: "Checkout (Detached)", disabled: commit.head },
    { kind: "item", id: "branch", label: "Create Branch…" },
    { kind: "item", id: "tag", label: "Create Tag…" },
    { kind: "sep" },
    { kind: "item", id: "cherry-pick", label: "Cherry-Pick", disabled: commit.head },
    { kind: "item", id: "revert", label: "Revert Commit" },
    {
      kind: "item",
      id: "reset",
      label: "Reset Current Branch to Here",
      disabled: commit.head,
      submenu: [
        {
          kind: "item",
          id: "reset-soft",
          label: "Soft",
          description: "Keep changes staged",
        },
        {
          kind: "item",
          id: "reset-mixed",
          label: "Mixed",
          description: "Keep changes unstaged",
        },
        {
          kind: "item",
          id: "reset-hard",
          label: "Hard",
          description: "Discard all changes",
          danger: true,
        },
      ],
    },
    { kind: "sep" },
    { kind: "item", id: "copy-sha", label: "Copy Commit ID" },
  ];
}

/** Commits whose subject, author, ref name, or id contains the query. */
export function filterHistory(
  commits: GitHistoryCommit[],
  query: string,
): GitHistoryCommit[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return commits;
  return commits.filter(
    (commit) =>
      commit.subject.toLowerCase().includes(needle) ||
      commit.author.toLowerCase().includes(needle) ||
      commit.sha.toLowerCase().startsWith(needle) ||
      commit.refs.some((ref) => ref.name.toLowerCase().includes(needle)),
  );
}

const OPERATION_LABELS = {
  merge: "Merge",
  rebase: "Rebase",
  "cherry-pick": "Cherry-pick",
  revert: "Revert",
} as const;

export function operationLabel(operation: keyof typeof OPERATION_LABELS): string {
  return OPERATION_LABELS[operation];
}
