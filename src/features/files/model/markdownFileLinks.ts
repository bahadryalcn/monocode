import { resolveWorkspaceFileReference } from "../../../shared/lib/paths";

type MarkdownNode = {
  type: string;
  url?: string;
  value?: string;
  children?: MarkdownNode[];
};

/** Normalize local file links before URL sanitizing; keep all other URLs intact. */
export function remarkWorkspaceFileLinks({ cwd }: { cwd?: string }) {
  function visit(node: MarkdownNode) {
    if (
      node.type !== "link" &&
      node.type !== "linkReference" &&
      node.children
    ) {
      node.children = node.children.flatMap((child) => {
        if (child.type !== "text" || !child.value) return [child];
        // Standalone path lines are common in agent replies, including Windows
        // paths containing spaces. Leave ordinary prose and web URLs untouched.
        return child.value.split(/(\n)/).map((value): MarkdownNode => {
          const candidate = value.trim();
          if (
            /^(?:[A-Za-z]:[\\/]|~[\\/]|%[A-Za-z_][A-Za-z0-9_]*(?:\(x86\))?%[\\/]|\/(?!\/))/i.test(
              candidate,
            ) &&
            resolveWorkspaceFileReference(candidate, cwd)
          ) {
            return {
              type: "link",
              url: candidate,
              children: [{ type: "text", value }],
            };
          }
          return { type: "text", value };
        });
      });
    }
    if ((node.type === "link" || node.type === "definition") && node.url) {
      const file = resolveWorkspaceFileReference(node.url, cwd);
      if (file) {
        const remoteRoot = cwd
          ? /^remote:\/\/[^/]+\//.exec(cwd)?.[0]
          : undefined;
        const localPath =
          remoteRoot && file.path.startsWith(remoteRoot)
            ? file.path.slice(remoteRoot.length)
            : file.path;
        const path = localPath.startsWith("/") ? localPath : `/${localPath}`;
        let href = path.split("/").map(encodeURIComponent).join("/");
        // Preserve a UNC path as a path, not a protocol-relative web origin.
        if (href.startsWith("//")) href = `/%2F${href.slice(2)}`;
        const target = file.navigation;
        node.url =
          href +
          (target
            ? `:${target.line}${target.column ? `:${target.column}` : ""}`
            : "");
      }
    }
    if (node.type !== "link" && node.type !== "linkReference") {
      for (const child of node.children ?? []) visit(child);
    }
  }
  return visit;
}
