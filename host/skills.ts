import { closeSync, openSync, readFileSync, readSync, readdirSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import type { DiscoveredSkill } from "../src/platform/tauri/fs";

/**
 * The file skills on this machine for a project, found the way the desktop
 * app finds them on its own computer (src-tauri skills.rs): `.agents/skills`
 * first, then each harness's folder, project before personal; same name,
 * earlier wins.
 */
const MAX_SKILLS = 300;
const MAX_FRONTMATTER_BYTES = 16 * 1024;

const HARNESS_DIRS: [string, string][] = [
  [".claude/skills", "claude"],
  [".cursor/skills", "cursor"],
  [".codex/skills", "codex"],
  [".opencode/skills", "opencode"],
  [".pi/skills", "pi"],
  [".omp/skills", "omp"],
  [".fx/skills", "fx"],
  [".grok/skills", "grok"],
  [".hermes/skills", "hermes"],
];

const isDir = (path: string) => {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
};
const isFile = (path: string) => {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
};

export function listHostSkills(project: string | null, home = homedir()): DiscoveredSkill[] {
  const byName = new Map<string, DiscoveredSkill>();
  const seen = new Set<string>();
  const add = (root: string, scope: string, source: string, namespace?: string) => {
    if (byName.size >= MAX_SKILLS) return;
    let key = root;
    try {
      key = realpathSync(root);
    } catch {
      /* missing root: nothing to scan */
    }
    if (seen.has(key)) return;
    seen.add(key);
    for (const skill of scanRoot(root, scope, source)) {
      if (byName.size >= MAX_SKILLS) break;
      const name = namespace ? `${namespace}:${skill.name}` : skill.name;
      if (!byName.has(name)) byName.set(name, { ...skill, name });
    }
  };

  if (project) add(join(project, ".agents/skills"), "project", "agents");
  add(join(home, ".agents/skills"), "user", "agents");
  for (const [dir, source] of HARNESS_DIRS) {
    if (project) add(join(project, dir), "project", source);
    add(join(home, dir), "user", source);
  }
  add(join(home, ".pi/agent/skills"), "user", "pi");
  add(join(home, ".omp/agent/skills"), "user", "omp");
  add(join(home, ".codex/skills/.system"), "user", "codex");
  const antigravity = join(home, ".gemini/antigravity/skills");
  if (isDir(antigravity)) add(antigravity, "user", "antigravity");
  for (const plugin of claudePluginRoots(home, project)) {
    add(plugin.root, plugin.scope, "claude", plugin.namespace);
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function scanRoot(root: string, scope: string, source: string): DiscoveredSkill[] {
  let entries: string[];
  try {
    entries = readdirSync(root);
  } catch {
    return [];
  }
  const out: DiscoveredSkill[] = [];
  for (const folder of entries) {
    if (folder.startsWith(".") || folder === "skills-cursor") continue;
    const dir = join(root, folder);
    if (!isDir(dir)) continue;
    const file = [join(dir, "SKILL.md"), join(dir, "skill.md")].find(isFile);
    if (!file) continue;
    const fallback = slugName(folder);
    if (!fallback) continue;
    let text: string;
    try {
      text = readPrefix(file, MAX_FRONTMATTER_BYTES);
    } catch {
      continue;
    }
    const { name, description } = parseFrontmatter(text, fallback);
    if (!name) continue;
    out.push({
      name,
      description,
      path: file.replace(/\\/g, "/"),
      scope,
      source,
    } as DiscoveredSkill);
  }
  return out;
}

function readPrefix(path: string, max: number): string {
  const fd = openSync(path, "r");
  try {
    const buffer = Buffer.alloc(max);
    const read = readSync(fd, buffer, 0, max, 0);
    return buffer.subarray(0, read).toString("utf8");
  } finally {
    closeSync(fd);
  }
}

export function parseFrontmatter(
  text: string,
  fallback: string,
): { name: string; description: string } {
  const trimmed = text.replace(/^﻿/, "");
  if (!trimmed.startsWith("---")) return { name: fallback, description: "" };
  let rest = trimmed.slice(3).replace(/^\r?\n/, "");
  const end = rest.indexOf("\n---");
  if (end >= 0) rest = rest.slice(0, end);
  let name: string | undefined;
  let description = "";
  let inDescription = false;
  let folded = false;
  for (const raw of rest.split("\n")) {
    if (inDescription) {
      if (/^[ \t]/.test(raw)) {
        const piece = raw.trim();
        if (!piece) continue;
        if (description) description += folded ? " " : "\n";
        description += piece;
        continue;
      }
      inDescription = false;
    }
    const line = raw.trimEnd().trimStart();
    if (line.startsWith("name:")) name = unquote(line.slice(5));
    else if (line.startsWith("description:")) {
      const value = line.slice(12).trim();
      if (value.startsWith(">") || value.startsWith("|")) {
        inDescription = true;
        folded = value.startsWith(">");
        description = "";
      } else description = unquote(value);
    }
  }
  return {
    name: name && validName(name) ? name : fallback,
    description: description.trim(),
  };
}

const unquote = (value: string) => {
  const trimmed = value.trim();
  return trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
    ? trimmed.slice(1, -1)
    : trimmed;
};

const validName = (name: string) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) && name.length <= 64;

export function slugName(raw: string): string {
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/, "");
  return slug;
}

/** Skill folders of enabled Claude Code plugins, project ones first. */
function claudePluginRoots(
  home: string,
  project: string | null,
): { root: string; scope: string; namespace: string }[] {
  let registry: unknown;
  try {
    registry = JSON.parse(readFileSync(join(home, ".claude/plugins/installed_plugins.json"), "utf8"));
  } catch {
    return [];
  }
  const plugins = (registry as { plugins?: Record<string, unknown> })?.plugins;
  if (!plugins || typeof plugins !== "object") return [];
  const settings = [
    ...(project
      ? [join(project, ".claude/settings.local.json"), join(project, ".claude/settings.json")]
      : []),
    join(home, ".claude/settings.json"),
  ];
  const enabled = (id: string) => {
    for (const path of settings) {
      try {
        const value = JSON.parse(readFileSync(path, "utf8"))?.enabledPlugins?.[id];
        if (typeof value === "boolean") return value;
      } catch {
        /* no such settings file */
      }
    }
    return true;
  };
  const resolveHome = (raw: string) =>
    raw === "~" ? home : raw.startsWith("~/") ? join(home, raw.slice(2)) : isAbsolute(raw) ? raw : join(home, raw);
  const roots: { root: string; scope: string; namespace: string }[] = [];
  for (const [id, installed] of Object.entries(plugins)) {
    if (!enabled(id)) continue;
    const namespace = id.includes("@") ? id.slice(0, id.lastIndexOf("@")) : id;
    if (!validName(namespace)) continue;
    const entries = Array.isArray(installed) ? installed : installed && typeof installed === "object" ? [installed] : [];
    for (const entry of entries as Record<string, unknown>[]) {
      if (typeof entry?.installPath !== "string") continue;
      const scopeValue = entry.scope;
      let scope = "user";
      if (scopeValue === "project" || scopeValue === "local") {
        if (!project || typeof entry.projectPath !== "string") continue;
        const owner = resolve(resolveHome(entry.projectPath));
        const inside = resolve(project);
        if (inside !== owner && !inside.startsWith(owner + (owner.endsWith("/") ? "" : "/"))) continue;
        scope = "project";
      } else if (scopeValue !== undefined && scopeValue !== "user") continue;
      roots.push({ root: join(resolveHome(entry.installPath), "skills"), scope, namespace });
    }
  }
  return roots.sort((a, b) => (a.scope === "project" ? 0 : 1) - (b.scope === "project" ? 0 : 1));
}
