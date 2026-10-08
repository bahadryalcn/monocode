import { t, useLocale } from "../../shared/i18n";
import { useCallback, useMemo, useState } from "react";
import { hostFeatureRequest } from "../connections/model/hostFeatureClient";
import { HtmlArtifactsPanel } from "../artifacts/HtmlArtifactsPanel";
import type { HtmlArtifact, HtmlArtifactSummary } from "../artifacts/types";
import { DevicePanel } from "../devices/DevicePanel";
import type { DevicePanelApi } from "../devices/types";
import { PrDeliveryTools } from "../inbox/ui/PrWatchPanel";
import { BrowserPanel } from "./BrowserPanel";
import { DiagnosticsPanel } from "./DiagnosticsPanel";

type Tab = "visuals" | "devices" | "delivery" | "browser" | "resources";

/** Only the visible tool mounts: closed panes do not own polling or background work. */
export function SessionHostTools({ cwd, sessionId, title }: { cwd: string; sessionId: string; title: string }) {
  useLocale();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("visuals");
  const list = useCallback(() => hostFeatureRequest<HtmlArtifactSummary[]>(cwd, "html.artifacts", "html.artifacts.list", { sessionId }), [cwd, sessionId]);
  const load = useCallback((id: string) => hostFeatureRequest<HtmlArtifact>(cwd, "html.artifacts", "html.artifacts.read", { sessionId, id }), [cwd, sessionId]);
  const publish = useCallback((path: string, title: string) => hostFeatureRequest<HtmlArtifactSummary>(cwd, "html.artifacts", "html_artifact_publish", { sessionId, path, title }), [cwd, sessionId]);
  const api = useMemo<DevicePanelApi>(() => {
    const request = <T,>(method: string, params: Record<string, unknown> = {}) => hostFeatureRequest<T>(cwd, "device.host", `devices.${method}`, params);
    return { status: () => request("status"), setup: agentAccess => request("setup", { agentAccess }),
      start: () => request("start"), stop: () => request("stop"), list: () => request("list"),
      boot: deviceId => request("boot", { deviceId }), capture: deviceId => request("capture", { deviceId }),
      action: (deviceId, action) => request("action", { deviceId, action }) };
  }, [cwd]);
  return <div className="shrink-0 border-t border-content/10">
    <button type="button" aria-expanded={open} onClick={() => setOpen(value => !value)} className="px-3 py-1.5 text-xs text-content/70">{open ? t("Close tools") : t("Conversation tools")}</button>
    {open ? <section aria-label={t("Conversation tools")} className="max-h-[55vh] overflow-auto border-t border-content/10">
      <nav aria-label={t("Conversation tool selection")} className="flex gap-2 px-3 py-2">
        {(["visuals", "devices", "delivery", "browser", "resources"] as const).map(id => <button key={id} type="button" aria-pressed={tab === id} onClick={() => setTab(id)} className="rounded px-2 py-1 text-xs hover:bg-content/5">{({visuals: "Saved visuals", devices: "Devices", delivery: "PR tracking", browser: "Browser", resources: "Resources"})[id]}</button>)}
      </nav>
      {tab === "visuals" ? <HtmlArtifactsPanel sessionId={sessionId} list={list} load={load} publish={publish} /> : null}
      {tab === "devices" ? <DevicePanel api={api} /> : null}
      {tab === "browser" ? <BrowserPanel key={cwd} cwd={cwd} /> : null}
      {tab === "resources" ? <DiagnosticsPanel key={cwd} cwd={cwd} /> : null}
      {tab === "delivery" ? <div className="p-3"><PrDeliveryTools cwd={cwd} targets={[{ id: sessionId, title, kind: "session" }]} /></div> : null}
    </section> : null}
  </div>;
}
