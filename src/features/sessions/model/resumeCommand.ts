import type { BuiltinSkill } from "../../skills/model/skills";

/**
 * Opens the picker of terminal conversations recorded for this
 * project, so one can be continued in MonoCode. Named `/resume` because that
 * is what people reach for after using the CLI, even though the CLI's own
 * `/resume` is an interactive screen that headless mode has no equivalent of.
 */
export const RESUME_COMMAND: BuiltinSkill = {
  kind: "builtin",
  name: "resume",
  invocation: "resume",
  description:
    "Import and continue a Claude Code or Codex conversation in this project.",
  scope: "builtin",
  source: "monocode",
};

export function isResumeCommand(text: string): boolean {
  return /^\s*\/\s*resume\s*$/.test(text);
}
