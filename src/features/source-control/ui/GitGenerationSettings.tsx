import { useState } from "react";
import { t, useLocale } from "../../../shared/i18n";
import { ChevronDown } from "../../../shared/ui/icons";
import { ModelPicker } from "../../sessions/ui/ModelPicker";
import { defaultModelId, mergeModelSettings, resolveModel } from "../../sessions/model/models";
import type { HarnessId } from "../../sessions/model/session";
import { TEXT_HARNESSES, pickTextHarness, type GitGenerationChoice } from "../../../integrations/harness/core/textHarness";

const KEY = "monocode.gitGeneration.v1:";
function load(cwd: string): GitGenerationChoice | undefined {
  try {
    const value = JSON.parse(localStorage.getItem(KEY + cwd) ?? "null");
    if (!value || !TEXT_HARNESSES.includes(value.harness) || typeof value.model !== "string") return;
    const model = resolveModel(value.harness, value.model);
    const settings = Object.fromEntries(Object.entries(value.modelSettings ?? {}).filter(([, v]) => typeof v === "string")) as Record<string, string>;
    return { harness: value.harness, model: model.id, modelSettings: mergeModelSettings(model, settings) };
  } catch { return; }
}

export function useGitGenerationChoice(cwd: string) {
  const [saved, setSaved] = useState(() => ({ cwd, choice: load(cwd) }));
  if (saved.cwd !== cwd) setSaved({ cwd, choice: load(cwd) });
  const choice = saved.cwd === cwd ? saved.choice : load(cwd);
  const update = (next: GitGenerationChoice | undefined) => {
    setSaved({ cwd, choice: next });
    try {
      if (next) localStorage.setItem(KEY + cwd, JSON.stringify(next));
      else localStorage.removeItem(KEY + cwd);
    } catch { /* unavailable storage */ }
  };
  return [choice, update] as const;
}

export function GitGenerationSettings({ cwd, preferred, choice, onChange, disabled }: {
  cwd: string; preferred?: HarnessId; choice?: GitGenerationChoice;
  onChange: (choice: GitGenerationChoice | undefined) => void; disabled: boolean;
}) {
  useLocale();
  const [open, setOpen] = useState(false);
  const harness = choice?.harness ?? pickTextHarness(preferred);
  const model = resolveModel(harness, choice?.model ?? defaultModelId(harness));
  const values = mergeModelSettings(model, choice?.modelSettings);
  return (
    <div className="mb-1.5 min-w-0">
      <button type="button" aria-label={t("AI generation settings")} aria-expanded={open}
        disabled={disabled} onClick={() => setOpen(v => !v)}
        className="flex h-6 w-full items-center gap-1 rounded px-1 text-[11px] text-content/60 hover:bg-content/5 hover:text-content focus-visible:outline focus-visible:outline-1 disabled:opacity-40">
        <span className="shrink-0">{t("AI")}</span>
        <span className="min-w-0 flex-1 truncate text-left">{choice ? `${model.name}${values.advisor && !["default", "off"].includes(values.advisor) ? ` · Advisor: ${values.advisor}` : ""}` : t("Automatic")}</span>
        <ChevronDown className={`size-3 shrink-0 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <fieldset disabled={disabled} className="mt-1 min-w-0 rounded-md border border-stroke p-2">
        <legend className="px-1 text-[10px] text-content/50">{t("Commit and pull request generation")}</legend>
        <ModelPicker harness={harness} model={model.id} values={values} project={cwd} allowedHarnesses={TEXT_HARNESSES}
          onChange={(nextHarness, nextModel) => {
            const resolved = resolveModel(nextHarness, nextModel);
            onChange({ harness: nextHarness, model: resolved.id, modelSettings: mergeModelSettings(resolved, nextHarness === harness ? values : undefined) });
          }}
          onSettingsChange={modelSettings => onChange({ harness, model: model.id, modelSettings })} />
        {harness === "claude" && <p className="mt-1.5 text-[10px] leading-4 text-content/50">{t("Advisor is experimental and uses extra tokens. Availability depends on your Claude Code version and account.")}</p>}
        {choice && <button type="button" className="mt-1 text-[11px] text-content/60 hover:text-content" onClick={() => onChange(undefined)}>{t("Use automatic selection")}</button>}
      </fieldset>}
    </div>
  );
}
