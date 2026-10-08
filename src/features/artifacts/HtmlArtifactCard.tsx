import { t, useLocale } from "../../shared/i18n";
import { useEffect, useState } from "react";
import { convertFileSrc, invoke, isTauri } from "@tauri-apps/api/core";
import { sandboxHtmlDocument, type HtmlArtifact, type HtmlArtifactSummary } from "./types";

export function HtmlArtifactCard({ artifact, load }: { artifact: HtmlArtifactSummary; load: (id: string) => Promise<HtmlArtifact> }) {
  useLocale();
  const [opened, setOpened] = useState(false);
  const [document, setDocument] = useState<string>();
  const [url, setUrl] = useState<string>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (!opened) return;
    let active = true;
    let token: string | undefined;
    setDocument(undefined); setUrl(undefined); setError(undefined);
    void load(artifact.id).then(async (value) => {
      if (!active) return;
      const content = sandboxHtmlDocument(value.html);
      if (isTauri()) {
        // srcdoc inherits the app's restrictive script CSP. The existing separate
        // preview protocol is already frame-allowlisted and has its own CSP.
        // A remote pseudo-path disables all local workspace asset reads.
        const id = await invoke<string>("create_html_preview", { path: `remote://artifact/${artifact.id}/index.html`, content });
        token = id;
        if (!active) { await invoke("close_html_preview", { token: id }); return; }
        setUrl(convertFileSrc(`${id}/index.html`, "html-preview"));
      } else setDocument(content);
    }).catch((cause: unknown) => { if (active) setError(String(cause)); });
    return () => { active = false; if (token) void invoke("close_html_preview", { token }).catch(() => {}); };
  }, [opened, artifact.id, load]);
  return <section className="my-3 rounded border border-border bg-background p-3" aria-label={t("HTML artifact: {p0}", { p0: artifact.title })}>
    <div className="flex items-center justify-between gap-2"><strong className="text-sm">{artifact.title}</strong><button type="button" className="rounded border px-2 py-1 text-xs" onClick={() => setOpened(!opened)}>{opened ? t("Close") : t("Open visual")}</button></div>
    <p className="mt-1 text-xs text-muted-foreground">{t("Saved HTML · ")}{Math.ceil(artifact.bytes / 1024)}{t(" KiB · external resources blocked")}</p>
    {opened && error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
    {opened && !error && !document && !url && <p role="status">{t("Loading visual…")}</p>}
    {opened && (document || url) && <iframe title={artifact.title} sandbox="allow-scripts" referrerPolicy="no-referrer" src={url} srcDoc={document} className="mt-2 h-[28rem] w-full rounded bg-white" />}
  </section>;
}
