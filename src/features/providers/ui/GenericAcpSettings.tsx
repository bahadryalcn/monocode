import { t, useLocale } from "../../../shared/i18n";
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { hostFeatureRequest } from "../../connections/model/hostFeatureClient";
import { parseRemotePath } from "../../connections/model/remoteProjects";
import { refreshGenericAcpCatalog } from "../../../integrations/harness/providers/generic-acp/genericAcpAdapter";
import { probeHarnessAvailability } from "../../../integrations/harness/core/availability";
import type { AcpRegistryEntry, GenericAcpConfig, GenericAcpSummary } from "../model/genericAcp";

export function GenericAcpSettings({ cwd = "" }: { cwd?: string }) {
  useLocale();
  const [configs, setConfigs] = useState<GenericAcpSummary[]>([]);
  const [registry, setRegistry] = useState<AcpRegistryEntry[]>([]);
  const [form, setForm] = useState<GenericAcpConfig>({ id: "", name: "", command: "", args: [] });
  const [argsText, setArgsText] = useState("[]");
  const [envText, setEnvText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const request = <T,>(command: string, params: Record<string, unknown> = {}) => parseRemotePath(cwd)
    ? hostFeatureRequest<T>(cwd, "generic-acp-v1", command, params)
    : invoke<T>(command, params);
  async function reload() {
    const result = await request<GenericAcpSummary[]>("generic_acp_list");
    if (!Array.isArray(result)) throw new Error("ACP configuration is unavailable on this machine. Update its app or host.");
    setConfigs(result);
  }
  useEffect(() => { void reload().catch((reason) => setError(String(reason))); }, [cwd]);
  async function run(label: string, action: () => Promise<void>) {
    setError(""); setBusy(label);
    try { await action(); await reload(); if (!parseRemotePath(cwd)) { await refreshGenericAcpCatalog(); await probeHarnessAvailability({ force: true }); } }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(""); }
  }
  return <section className="space-y-3 p-4" aria-label={t("Generic ACP agents")}>
    <h3 className="font-medium">{t("ACP agents")}</h3>
    <p className="text-sm text-muted-foreground">{t("Configure an executable on the session's machine. Credentials and environment values stay on that machine. Arguments are a JSON array; commands are launched without a shell.")}</p>
    {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
    {configs.map((config) => <div key={config.id} className="flex gap-2 items-center border rounded p-2">
      <span className="flex-1">{config.name} <small>{config.command} · {config.envKeys.length}{t(" environment values")}</small></span>
      <button disabled={!!busy} onClick={() => { const { envKeys: _keys, ...values } = config; setForm(values); setArgsText(JSON.stringify(config.args)); setEnvText(""); }}>{t("Edit")}</button>
      <button disabled={!!busy} onClick={() => void run("Removing", () => request("generic_acp_remove", { id: config.id }))}>{t("Remove")}</button>
    </div>)}
    <form className="grid gap-2" onSubmit={(event) => { event.preventDefault(); void run("Saving", async () => {
      const args = JSON.parse(argsText);
      const env = envText.trim() ? JSON.parse(envText) : undefined;
      await request("generic_acp_save", { config: { ...form, args, ...(env ? { env } : {}) } });
      setForm({ id: "", name: "", command: "", args: [] }); setArgsText("[]"); setEnvText("");
    }); }}>
      <label>{t("Agent id")}<input className="block w-full border rounded p-2" value={form.id} required pattern="[a-z0-9][a-z0-9._-]*" onChange={(event) => setForm({ ...form, id: event.target.value })} /></label>
      <label>{t("Name")}<input className="block w-full border rounded p-2" value={form.name} required onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
      <label>{t("Executable path")}<input className="block w-full border rounded p-2" value={form.command} required onChange={(event) => setForm({ ...form, command: event.target.value })} /></label>
      <label>{t("Arguments (JSON array)")}<input className="block w-full border rounded p-2" value={argsText} onChange={(event) => setArgsText(event.target.value)} /></label>
      <label>{t("Environment (JSON object; blank preserves stored values)")}<input type="password" autoComplete="off" className="block w-full border rounded p-2" value={envText} onChange={(event) => setEnvText(event.target.value)} /></label>
      <label>{t("ACP authentication method id (optional)")}<input className="block w-full border rounded p-2" value={form.authMethodId ?? ""} onChange={(event) => setForm({ ...form, authMethodId: event.target.value || undefined })} /></label>
      <label>{t("Context window tokens (optional)")}<input type="number" min={1024} className="block w-full border rounded p-2" value={form.contextWindow ?? ""} onChange={(event) => setForm({ ...form, contextWindow: event.target.value ? Number(event.target.value) : undefined })} /></label>
      <button disabled={!!busy} type="submit">{t("Save agent")}</button>
    </form>
    <button disabled={!!busy} onClick={() => void run("Loading registry", async () => setRegistry(await request("generic_acp_registry", { refresh: true })))}>{t("Browse ACP Registry")}</button>
    <p className="text-sm text-muted-foreground">{t("Install downloads an exact package version into isolated host storage and may run package installation scripts. Binary and Python distributions can be configured as local commands.")}</p>
    {registry.map((entry) => <div key={`${entry.id}:${entry.version}`} className="border rounded p-2">
      <strong>{entry.name} {entry.version}</strong><p className="text-sm">{entry.description}</p>
      {entry.supported ? <button disabled={!!busy} onClick={() => void run(`Installing ${entry.id}`, () => request("generic_acp_install", { id: entry.id, version: entry.version }))}>{t("Install ")}{entry.package}</button> : <p className="text-sm">{entry.unsupportedReason}</p>}
      {busy === `Installing ${entry.id}` && <button onClick={() => void request("generic_acp_cancel_install", { id: entry.id }).catch((reason) => setError(String(reason)))}>{t("Cancel installation")}</button>}
    </div>)}
    {busy && <p role="status">{busy}…</p>}
  </section>;
}
