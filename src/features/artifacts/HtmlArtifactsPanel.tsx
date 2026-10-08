import { t, useLocale } from "../../shared/i18n";
import { useCallback, useEffect, useState } from "react";
import { HtmlArtifactCard } from "./HtmlArtifactCard";
import type { HtmlArtifact, HtmlArtifactSummary } from "./types";

export function HtmlArtifactsPanel({ sessionId, list, load, publish }: { sessionId: string; list: () => Promise<HtmlArtifactSummary[]>; load: (id: string) => Promise<HtmlArtifact>; publish?: (path: string, title: string) => Promise<HtmlArtifactSummary> }) {
  useLocale();
  const [artifacts, setArtifacts] = useState<HtmlArtifactSummary[]>([]);
  const [error, setError] = useState<string>();
  const [path, setPath] = useState("");
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const refresh = useCallback(async () => { try { setArtifacts(await list()); setError(undefined); } catch (cause) { setError(String(cause)); } }, [list]);
  useEffect(() => { let active = true; setArtifacts([]); setError(undefined); void list().then((value) => { if (active) setArtifacts(value); }, (cause: unknown) => { if (active) setError(String(cause)); }); return () => { active = false; }; }, [sessionId, list]);
  return <div className="p-3"><div className="flex justify-between"><h3 className="font-medium">{t("Saved visuals")}</h3><button type="button" onClick={() => void refresh()}>{t("Refresh")}</button></div>
    {error && <p role="alert">{error}</p>}
    {publish && <form className="my-3 flex flex-col gap-2 rounded border p-3" onSubmit={(event) => { event.preventDefault(); if (saving || !path.trim() || !title.trim()) return; setSaving(true); setError(undefined); void publish(path.trim(), title.trim()).then(async () => { setPath(""); setTitle(""); await refresh(); }, (cause: unknown) => { setError(String(cause)); }).finally(() => setSaving(false)); }}>
      <label className="text-sm">{t("Workspace HTML file")}<input className="mt-1 w-full rounded border bg-background p-2" value={path} onChange={(event) => setPath(event.target.value)} placeholder={t("visuals/chart.html")} required maxLength={4096} /></label>
      <label className="text-sm">{t("Visual title")}<input className="mt-1 w-full rounded border bg-background p-2" value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t("Revenue chart")} required maxLength={200} /></label>
      <p className="text-xs text-muted-foreground">{t("Ask the agent to write self-contained HTML in this conversation's workspace, then save its path here. The host saves a copy with this conversation.")}</p>
      <button type="submit" className="self-start rounded border px-3 py-1 text-sm" disabled={saving || !path.trim() || !title.trim()}>{saving ? t("Saving…") : t("Save visual")}</button>
    </form>}
    {!error && !artifacts.length && <p className="mt-2 text-sm text-muted-foreground">{t("Saved visuals will appear here. In an /operator conversation, the agent can publish directly with the app html_artifact_publish command.")}</p>}
    {artifacts.map((artifact) => <HtmlArtifactCard key={artifact.id} artifact={artifact} load={load} />)}
  </div>;
}
