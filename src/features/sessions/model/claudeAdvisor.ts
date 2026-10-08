import type { AgentModel, ModelSetting } from "./models";

/** Conservative family pairings; the CLI/account remains the authority. */
export function claudeAdvisorSetting(native: string): ModelSetting | undefined {
  const id = native.replace(/\[.*$/, "").replace(/\./g, "-").replace(/^claude-/, "");
  const supported = /^(opus-(?:4-[678]|5(?:-5)?)|sonnet-(?:4-6|5(?:-5)?)|haiku-(?:4-5|5-5)|fable-5(?:-1)?|opus|sonnet|haiku|fable)$/.test(id);
  if (!supported) return undefined;
  const families = id.startsWith("fable") ? ["fable"]
    : /^(sonnet|haiku)/.test(id) ? ["opus", "sonnet", "fable"]
    : ["opus", "fable"];
  return {
    id: "advisor", label: "Advisor", kind: "select", value: "default",
    description: "Experimental second opinion. Uses extra tokens; requires a compatible Claude Code version, model and account. Fable may require usage-credit consent in Claude Code.",
    options: [
      { value: "default", label: "Claude default" },
      { value: "off", label: "Off" },
      ...families.map(value => ({ value, label: value[0].toUpperCase() + value.slice(1) })),
    ],
  };
}

export function withClaudeAdvisor(model: AgentModel): AgentModel {
  if (model.harness !== "claude" || model.settings?.some(s => s.id === "advisor")) return model;
  const setting = claudeAdvisorSetting(model.nativeId ?? model.id.replace(/^claude:/, ""));
  return setting ? { ...model, settings: [...(model.settings ?? []), setting] } : model;
}
