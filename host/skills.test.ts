import { afterEach, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listHostSkills, parseFrontmatter, slugName } from "./skills";

const cleanups: string[] = [];
afterEach(() => {
  for (const dir of cleanups.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function scratch(label: string) {
  const dir = mkdtempSync(join(tmpdir(), `monocode-skills-${label}-`));
  cleanups.push(dir);
  return dir;
}

function skill(root: string, folder: string, body: string) {
  mkdirSync(join(root, folder), { recursive: true });
  writeFileSync(join(root, folder, "SKILL.md"), body);
}

it("lists a project's skills before the personal ones, as the desktop does", () => {
  const project = scratch("project");
  const home = scratch("home");
  skill(join(project, ".agents/skills"), "deploy", "---\nname: deploy\ndescription: Ship it\n---\n");
  skill(join(home, ".agents/skills"), "deploy", "---\nname: deploy\ndescription: Personal copy\n---\n");
  skill(join(home, ".claude/skills"), "Review PR", "# no frontmatter");
  skill(join(home, ".claude/skills"), ".hidden", "---\nname: hidden\n---\n");

  const listed = listHostSkills(project, home);
  expect(listed.map((entry) => [entry.name, entry.scope, entry.source])).toEqual([
    ["deploy", "project", "agents"],
    ["review-pr", "user", "claude"],
  ]);
  expect(listed[0].description).toBe("Ship it");
  expect(listed[0].path.endsWith("/.agents/skills/deploy/SKILL.md")).toBe(true);
  expect(listed[0].path).not.toContain("\\");
});

it("lists only personal skills without a project", () => {
  const home = scratch("home");
  skill(join(home, ".agents/skills"), "notes", "---\nname: notes\n---\n");
  expect(listHostSkills(null, home).map((entry) => entry.scope)).toEqual(["user"]);
});

it("reads names and folded descriptions like the desktop", () => {
  expect(
    parseFrontmatter(
      "---\nname: review-pr\ndescription: >\n  Review pull requests.\n  Use when asked.\n---\n",
      "fallback",
    ),
  ).toEqual({ name: "review-pr", description: "Review pull requests. Use when asked." });
  expect(parseFrontmatter("---\nname: Not Valid\n---\n", "folder").name).toBe("folder");
  expect(slugName("My Great_Skill!")).toBe("my-great-skill");
});
