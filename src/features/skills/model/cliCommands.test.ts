import { describe, expect, it } from "vitest";
import {
  isCliCommandText,
  mergeCliCommands,
  mergeDollarSkills,
  registerCliCommands,
  type DiskCommand,
} from "./cliCommands";
import { dollarTokenAt, rankSkills, replaceSlashToken } from "./slashCommands";
import type { FileSkill } from "./skills";

const none = new Set<string>();
const names = (commands: { name: string }[]) => commands.map((c) => c.name);

describe("mergeCliCommands", () => {
  it("offers Claude's built-ins before any session has reported", () => {
    const merged = mergeCliCommands({
      harness: "claude",
      reported: [],
      disk: [],
      taken: none,
    });
    expect(names(merged)).toContain("goal");
    expect(merged.find((c) => c.name === "goal")).toMatchObject({
      kind: "native",
      invocation: "goal",
      inputHint: "[<condition> | clear]",
    });
  });

  it("offers nothing for Codex, whose slash commands are terminal-only", () => {
    expect(
      mergeCliCommands({ harness: "codex", reported: [], disk: [], taken: none }),
    ).toEqual([]);
  });

  it("adds disk commands and lets a MonoCode or file-skill name win", () => {
    const disk: DiskCommand[] = [
      { name: "gsd:help", description: "Help", argumentHint: "", scope: "user" },
      { name: "plan", description: "Clash", argumentHint: "", scope: "project" },
    ];
    const merged = mergeCliCommands({
      harness: "claude",
      reported: [],
      disk,
      taken: new Set(["plan", "init"]),
    });
    expect(names(merged)).toContain("gsd:help");
    expect(names(merged)).not.toContain("plan");
    expect(names(merged)).not.toContain("init");
    expect(merged.find((c) => c.name === "gsd:help")?.origin).toBe(
      "user command",
    );
  });

  it("trusts the session's own list over the curated table", () => {
    const merged = mergeCliCommands({
      harness: "claude",
      reported: [
        { name: "goal", kind: "command" },
        { name: "loop", kind: "command" },
        { name: "clear", kind: "command" },
        { name: "pdf-tools", kind: "skill" },
      ],
      disk: [],
      taken: none,
    });
    // Reported but not curated: kept. Curated but not reported: dropped.
    expect(names(merged).sort()).toEqual(["goal", "loop", "pdf-tools"]);
    // The curated text fills in what the session did not say.
    expect(merged.find((c) => c.name === "goal")?.description).toMatch(/goal/i);
    expect(merged.find((c) => c.name === "pdf-tools")?.origin).toBe("skill");
  });

  it("keeps the usage aliases findable", () => {
    const merged = mergeCliCommands({
      harness: "claude",
      reported: [],
      disk: [],
      taken: none,
    });
    expect(names(rankSkills(merged, "cost"))).toContain("usage");
  });
});

describe("isCliCommandText", () => {
  it("passes a curated or registered command through untouched", () => {
    expect(isCliCommandText("/goal ship it", "claude")).toBe(true);
    expect(isCliCommandText("/cost", "claude")).toBe(true);
    expect(isCliCommandText("/gsd:help", "claude")).toBe(false);
    registerCliCommands("claude", [
      {
        name: "gsd:help",
        description: "",
        invocation: "gsd:help",
        source: "claude",
      },
    ]);
    expect(isCliCommandText("/gsd:help", "claude")).toBe(true);
  });

  it("ignores paths, other names and other harnesses", () => {
    expect(isCliCommandText("/goal/x", "claude")).toBe(false);
    expect(isCliCommandText("do /goal later", "claude")).toBe(false);
    expect(isCliCommandText("/goal x", "codex")).toBe(false);
  });
});

describe("mergeDollarSkills", () => {
  const file = (name: string, source: FileSkill["source"]): FileSkill => ({
    kind: "file",
    name,
    description: "",
    invocation: name,
    path: `/skills/${name}/SKILL.md`,
    scope: "user",
    source,
  });

  it("lists Codex's report first, then Codex and shared skills on disk", () => {
    const merged = mergeDollarSkills({
      harness: "codex",
      reported: [{ name: "imagegen", kind: "skill", description: "Images" }],
      files: [
        file("imagegen", "codex"),
        file("docs", "agents"),
        file("shadcn", "claude"),
      ],
    });
    expect(names(merged)).toEqual(["imagegen", "docs"]);
    expect(merged[0]).toMatchObject({ kind: "native", description: "Images" });
  });

  it("is empty for harnesses that name skills with a slash", () => {
    expect(
      mergeDollarSkills({
        harness: "claude",
        reported: [{ name: "x", kind: "skill" }],
        files: [file("x", "claude")],
      }),
    ).toEqual([]);
  });
});

describe("dollarTokenAt", () => {
  it("finds a skill token at the start of a word", () => {
    expect(dollarTokenAt("$ima", 4)).toEqual({
      start: 0,
      end: 4,
      query: "ima",
      trigger: "$",
    });
    expect(dollarTokenAt("make it with $image", 19)?.query).toBe("image");
  });

  it("stays out of words, code and shell syntax", () => {
    expect(dollarTokenAt("US$5", 4)).toBeNull();
    expect(dollarTokenAt("a$b", 3)).toBeNull();
    expect(dollarTokenAt("echo $(pwd", 8)).toBeNull();
    expect(dollarTokenAt("echo ${HOME", 11)).toBeNull();
    expect(dollarTokenAt("run `echo $HOM", 14)).toBeNull();
    expect(dollarTokenAt("```\n$HOM", 8)).toBeNull();
    expect(dollarTokenAt("hello", 5)).toBeNull();
  });

  it("inserts $name, not /name", () => {
    const token = dollarTokenAt("use $ima", 8)!;
    expect(replaceSlashToken("use $ima", token, "imagegen")).toBe(
      "use $imagegen ",
    );
  });
});
