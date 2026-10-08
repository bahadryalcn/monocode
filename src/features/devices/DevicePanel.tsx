import { t, useLocale } from "../../shared/i18n";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DeviceAction, DeviceFrame, DeviceHostStatus, DevicePanelApi, DeviceSummary } from "./types";

/** RPC only: tool origins/tokens never enter the renderer, and viewing is opt-in. */
export function DevicePanel({ api, hostLabel = "Connected host" }: { api: DevicePanelApi; hostLabel?: string }) {
  useLocale();
  const [status, setStatus] = useState<DeviceHostStatus>();
  const [devices, setDevices] = useState<DeviceSummary[]>([]);
  const [selected, setSelected] = useState("");
  const [frame, setFrame] = useState<DeviceFrame>();
  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [control, setControl] = useState(false);
  const [text, setText] = useState("");
  const [output, setOutput] = useState("");
  const [x, setX] = useState(0);
  const [y, setY] = useState(0);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { let active = true; setStatus(undefined); setDevices([]); setSelected(""); setFrame(undefined); setLive(false); void api.status().then((value) => { if (active) setStatus(value); }, (cause: unknown) => { if (active) setError(String(cause)); }); return () => { active = false; }; }, [api]);
  const execute = useCallback(async (operation: () => Promise<void>) => { setBusy(true); setError(undefined); try { await operation(); } catch (cause) { if (mounted.current) setError(String(cause)); } finally { if (mounted.current) setBusy(false); } }, []);
  const refresh = useCallback(async () => { const value = await api.list(); if (!mounted.current) return; setDevices(value.devices); if (value.errors.length) setError(value.errors.join("\n")); }, [api]);
  useEffect(() => {
    if (!live || !selected) return;
    let cancelled = false; let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      if (cancelled) return;
      if (!document.hidden) {
        try { const value = await api.capture(selected); if (!cancelled) setFrame(value); }
        catch (cause) { if (!cancelled) { setError(String(cause)); setLive(false); } return; }
      }
      if (!cancelled) timer = setTimeout(() => { void poll(); }, 1000);
    };
    void poll(); return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [live, selected, api]);
  const action = (value: DeviceAction) => void execute(async () => { setOutput(await api.action(selected, value)); setFrame(await api.capture(selected)); });
  return <section className="flex h-full flex-col gap-3 overflow-auto p-3" aria-label={t("Devices")}>
    <h3 className="font-medium">{t("Devices · ")}{hostLabel}</h3>
    <p className="text-xs text-muted-foreground">{t("Screens and controls run on this host. iOS requires Xcode; Android requires an SDK and an AVD. Live view captures at most one frame per second while this panel is visible.")}</p>
    {error && <p role="alert" className="whitespace-pre-wrap text-sm text-destructive">{error}</p>}
    {!status && !error && <p role="status">{t("Checking device support…")}</p>}
    {status && <>
      <ul className="text-xs">{status.platforms.map((item) => <li key={item.platform}>{item.platform === "ios" ? t("iOS") : t("Android")}: {item.available ? t("SDK detected") : item.reason}</li>)}</ul>
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={control} onChange={(event) => setControl(event.target.checked)} />{t("Allow control tools (installs agent-device 0.21.12)")}</label>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy || !status.platforms.some((item) => item.available)} className="rounded border px-2 py-1 text-sm" onClick={() => void execute(async () => { setStatus(await api.setup(control)); })}>{status.installed ? t("Update setup") : t("Set up device tools")}</button>
        <button type="button" disabled={busy || !status.installed || status.running} className="rounded border px-2 py-1 text-sm" onClick={() => void execute(async () => { setStatus(await api.start()); await refresh(); })}>{t("Start device host")}</button>
        <button type="button" disabled={busy || !status.running} className="rounded border px-2 py-1 text-sm" onClick={() => void execute(async () => { setLive(false); setStatus(await api.stop()); setFrame(undefined); })}>{t("Stop device host")}</button>
        <button type="button" disabled={busy || !status.running} className="rounded border px-2 py-1 text-sm" onClick={() => void execute(refresh)}>{t("Refresh devices")}</button>
      </div>
      <p className="text-xs text-muted-foreground">{t("Setup downloads pinned expo-device-hub 0.12.0 and optional control tools into the host cache. Closing this panel pauses viewing; Stop ends the owned tool processes.")}</p>
    </>}
    {status?.running && <>
      <select aria-label={t("Selected device")} className="rounded border bg-background p-2" value={selected} onChange={(event) => { setSelected(event.target.value); setFrame(undefined); setLive(false); setOutput(""); }}><option value="">{t("Select simulator or emulator")}</option>{devices.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.platform} · {item.booted ? t("Running") : t("Stopped")}</option>)}</select>
      <div className="flex gap-2"><button type="button" disabled={busy || !selected} onClick={() => void execute(async () => { const device = await api.boot(selected); setSelected(device.id); await refresh(); })}>{t("Boot")}</button><button type="button" disabled={busy || !selected} onClick={() => void execute(async () => { setFrame(await api.capture(selected)); })}>{t("Capture")}</button><label className="flex gap-2"><input type="checkbox" disabled={!selected} checked={live} onChange={(event) => setLive(event.target.checked)} />{t("Live view")}</label></div>
      {frame && <div className="overflow-auto rounded border bg-black"><img className="mx-auto max-h-[60vh] max-w-full" alt={t("Current device screen")} src={`data:${frame.mime};base64,${frame.base64}`} onClick={(event) => {
        if (!control || busy || !status.agentInstalled || devices.find((device) => device.id === selected)?.platform !== "android") return;
        const image = event.currentTarget; const bounds = image.getBoundingClientRect();
        action({ type: "press", x: Math.round((event.clientX - bounds.left) * image.naturalWidth / bounds.width), y: Math.round((event.clientY - bounds.top) * image.naturalHeight / bounds.height) });
      }} /></div>}
      {control && status.agentInstalled && selected && <div className="flex flex-wrap gap-2"><input aria-label={t("Text to type on device")} className="min-w-0 rounded border bg-background p-1" value={text} onChange={(event) => setText(event.target.value)} /><button type="button" disabled={busy || !text} onClick={() => action({ type: "type", text })}>{t("Type text")}</button><button type="button" disabled={busy} onClick={() => action({ type: "home" })}>{t("Home")}</button><button type="button" disabled={busy} onClick={() => action({ type: "snapshot" })}>{t("Accessibility snapshot")}</button><label>X <input type="number" aria-label={t("Device X coordinate")} min={0} max={20000} className="w-16 border bg-background" value={x} onChange={(event) => setX(Number(event.target.value))} /></label><label>Y <input type="number" aria-label={t("Device Y coordinate")} min={0} max={20000} className="w-16 border bg-background" value={y} onChange={(event) => setY(Number(event.target.value))} /></label><button type="button" disabled={busy} onClick={() => action({ type: "press", x, y })}>{t("Press coordinate")}</button><p className="w-full text-xs text-muted-foreground">{t("Android: click the screen to press at that pixel. iOS: use logical point coordinates from the accessibility snapshot.")}</p></div>}
      {output && <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-xs">{output}</pre>}
    </>}
    {busy && <p role="status" className="text-xs">{t("Working on the host…")}</p>}
  </section>;
}
