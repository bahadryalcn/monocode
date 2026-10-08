import { t, useLocale } from "../../shared/i18n";
import { useState } from "react";
import { hostFeatureRequest } from "../connections/model/hostFeatureClient";

type BrowserState = { open: boolean; url: string | null; controlling: boolean; leaseId?: string; leaseExpiresAt?: number; data?: string; mimeType?: string };
const buttonClass = "rounded border border-content/15 px-3 py-1.5 text-sm disabled:opacity-50";

/** Explicit frame refresh avoids a hidden screenshot stream while closed. */
export function BrowserPanel({ cwd }: { cwd: string }) {
  useLocale();
  const [state, setState] = useState<BrowserState>();
  const [url, setUrl] = useState("http://localhost:3000");
  const [text, setText] = useState("");
  const [frame, setFrame] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = async (method: string, params: Record<string, unknown> = {}) => {
    const result = await hostFeatureRequest<BrowserState>(cwd, "browser.shared", method, { ...params, leaseId: state?.leaseId });
    setState(result);
    if (result.data) setFrame(`data:${result.mimeType};base64,${result.data}`);
    if (!result.open) setFrame(undefined);
    return result;
  };
  const action = async (work: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true); setError("");
    try { await work(); } catch (e) { setError(e instanceof Error ? e.message : "Browser request failed"); } finally { setBusy(false); }
  };
  const input = async (params: Record<string, unknown>) => { await request("browser.input", params); await request("browser.frame"); };
  return <section className="space-y-3 p-3">
    <h3 className="font-medium">{t("Shared host browser")}</h3>
    <p className="text-xs text-content/60">{t("Ephemeral Chromium on this project's machine. Authenticated devices share its view; one device controls it for 30 seconds. Playwright and Chromium must be installed on that host. No setup runs automatically.")}</p>
    {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
    <div className="flex flex-wrap gap-2">
      <button className={buttonClass} disabled={busy} onClick={() => void action(() => request("browser.status"))}>{t("Status")}</button>
      <button className={buttonClass} disabled={busy} onClick={() => void action(() => request("browser.claim"))}>{t("Claim control")}</button>
      <button className={buttonClass} disabled={busy || !state?.controlling} onClick={() => void action(() => request("browser.release"))}>{t("Release")}</button>
      <button className={buttonClass} disabled={busy || !state?.controlling} onClick={() => void action(() => request("browser.close"))}>{t("Close browser")}</button>
    </div>
    <div className="flex flex-wrap gap-2"><input className="min-w-0 flex-1 rounded border border-content/15 bg-transparent p-2 text-sm" aria-label={t("Host browser URL")} value={url} onChange={e => setUrl(e.target.value)} /><button className={buttonClass} disabled={busy || !state?.controlling} onClick={() => void action(async () => { await request("browser.open", { url }); await request("browser.frame"); })}>{t("Open")}</button><button className={buttonClass} disabled={busy} onClick={() => void action(() => request("browser.frame"))}>{t("Refresh frame")}</button></div>
    <p className="break-all text-xs text-content/60">{state?.open ? state.url : t("Browser closed")} {state?.controlling && t(" · Your device controls")}</p>
    {frame && <img src={frame} alt={t("Shared host browser screenshot; click to interact when controlling")} className="w-full cursor-crosshair rounded" onClick={e => {
      if (!state?.controlling) return;
      const box = e.currentTarget.getBoundingClientRect();
      const x = (e.clientX - box.left) * 1280 / box.width, y = (e.clientY - box.top) * 720 / box.height;
      void action(() => input({ kind: "click", x, y }));
    }} />}
    <div className="flex flex-wrap gap-2"><input className="min-w-0 flex-1 rounded border border-content/15 bg-transparent p-2 text-sm" aria-label={t("Text to type into host browser")} value={text} maxLength={4096} onChange={e => setText(e.target.value)} /><button className={buttonClass} disabled={busy || !state?.controlling} onClick={() => void action(async () => { await input({ kind: "text", text }); setText(""); })}>{t("Type")}</button><button className={buttonClass} disabled={busy || !state?.controlling} onClick={() => void action(() => input({ kind: "key", key: "Enter" }))}>{t("Enter")}</button><button className={buttonClass} disabled={busy || !state?.controlling} onClick={() => void action(() => input({ kind: "scroll", y: 500 }))}>{t("Scroll down")}</button></div>
  </section>;
}
