import { t, useLocale, getLocale } from "../../shared/i18n";
import { useState } from "react";
import { hostFeatureRequest } from "../connections/model/hostFeatureClient";

type Sample = { at: number; host: { totalMemoryBytes: number; freeMemoryBytes: number; logicalCpus: number; loadAverage: number[] | null }; process: { pid: number; rssBytes: number; heapUsedBytes: number; cpuPercent: number | null; uptimeSeconds: number } };
export function DiagnosticsPanel({ cwd }: { cwd: string }) {
  useLocale();
  const [samples, setSamples] = useState<Sample[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const sample = samples[samples.length - 1];
  const mib = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
  return <section className="space-y-3 p-3"><h3 className="font-medium">{t("Host resource diagnostics")}</h3><p className="text-xs text-content/60">{t("Samples only when requested. CPU and memory describe the host's Node process; provider child processes are excluded. Up to 60 samples are retained.")}</p><button className="rounded border border-content/15 px-3 py-1.5 text-sm disabled:opacity-50" disabled={busy} onClick={() => {
    setBusy(true); setError("");
    void hostFeatureRequest<{ samples: Sample[] }>(cwd, "resources.diagnostics", "resources.read")
      .then(result => setSamples(result.samples)).catch(e => setError(e instanceof Error ? e.message : "Diagnostics unavailable")).finally(() => setBusy(false));
  }}>{t("Sample now")}</button>{error && <p role="alert" className="text-sm text-red-400">{error}</p>}{sample && <dl className="grid grid-cols-2 gap-2 text-sm"><dt>{t("Node RSS")}</dt><dd>{mib(sample.process.rssBytes)}</dd><dt>{t("Node heap")}</dt><dd>{mib(sample.process.heapUsedBytes)}</dd><dt>{t("Node CPU")}</dt><dd>{sample.process.cpuPercent === null ? t("Need two samples ≥1s apart") : `${sample.process.cpuPercent.toFixed(1)}%`}</dd><dt>{t("Host free memory")}</dt><dd>{mib(sample.host.freeMemoryBytes)} / {mib(sample.host.totalMemoryBytes)}</dd><dt>{t("Logical CPUs")}</dt><dd>{sample.host.logicalCpus}</dd><dt>{t("Sampled at")}</dt><dd>{new Date(sample.at).toLocaleTimeString(getLocale())}</dd></dl>}</section>;
}
