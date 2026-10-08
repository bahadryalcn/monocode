import { t, useLocale } from "../../../shared/i18n";
import { useEffect, useState } from "react";
import { linkPrWatch, listPrWatches, updatePrWatch } from "../model/prWatchClient";
import { parseGithubPrUrl, type PrWatch } from "../model/prWatches";
import { hostFeatureRequest } from "../../connections/model/hostFeatureClient";

export type PrWatchTarget = { id: string; title: string; kind?: "session" | "task" };

/** Suitable for a task/session tools drawer; same host-owned links as Inbox. */
export function PrDeliveryTools({ cwd, targets }: { cwd: string; targets: readonly PrWatchTarget[] }) {
  useLocale();
  const [url, setUrl] = useState("");
  const [tasks, setTasks] = useState<PrWatchTarget[]>([]);
  const [taskError, setTaskError] = useState("");
  const [loadingTasks, setLoadingTasks] = useState(false);
  const pr = parseGithubPrUrl(url);
  return <div className="space-y-2 p-3">
    <label className="block text-xs">{t("GitHub pull request URL")}<input className="mt-1 w-full rounded border border-content/20 bg-transparent px-2 py-1" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://github.com/owner/repo/pull/123" />
    </label>
    <button type="button" disabled={loadingTasks} onClick={() => {
      setLoadingTasks(true); setTaskError("");
      void hostFeatureRequest<{id: string; title: string}[]>(cwd, "tasks", "tasks.list")
        .then(values => setTasks(values.map(task => ({id: task.id, title: task.title, kind: "task"}))))
        .catch(reason => setTaskError(String(reason))).finally(() => setLoadingTasks(false));
    }}>{t("Load project tasks")}</button>
    {taskError ? <p role="alert" className="text-xs">{taskError}</p> : null}
    {url && !pr ? <p role="alert" className="text-xs">{t("Enter a public GitHub pull request URL.")}</p> : null}
    {pr ? <PrWatchPanel key={`${cwd}:${pr.repo}:${pr.number}`} cwd={cwd} repo={pr.repo} number={pr.number} targets={[...targets, ...tasks]} /> : null}
  </div>;
}

/** The host polls independently of this component. Refresh is explicit. */
export function PrWatchPanel({ cwd, repo, number, targets }: {
  cwd: string; repo: string; number: number;
  targets: readonly PrWatchTarget[];
}) {
  useLocale();
  const [watches, setWatches] = useState<PrWatch[]>([]);
  const [selected, setSelected] = useState("");
  const [autoWake, setAutoWake] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => {
    let cancelled = false;
    setWatches([]);
    setSelected("");
    setError(undefined);
    void listPrWatches(cwd).then((value) => { if (!cancelled) setWatches(value); }).catch((reason: unknown) => { if (!cancelled) setError(String(reason)); });
    return () => { cancelled = true; };
  }, [cwd, repo, number]);
  async function act(action: () => Promise<unknown>) {
    setBusy(true); setError(undefined);
    try { await action(); setWatches(await listPrWatches(cwd)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }
  const linked = watches.filter((watch) => watch.repo.toLowerCase() === repo.toLowerCase() && watch.number === number);
  return <section aria-label={t("Linked PR watches")} className="rounded-md border border-content/10 p-2 text-xs">
    <div className="flex flex-wrap items-center gap-2">
      <span>{t("Host PR tracking")}</span>
      <button type="button" disabled={busy} onClick={() => void act(async () => { for (const watch of linked) if (watch.status === "watching") await updatePrWatch(cwd, watch.id, "check"); })}>{t("Refresh")}</button>
    </div>
    {linked.map((watch) => <div key={watch.id} className="mt-2 flex flex-wrap items-center gap-2">
      <span>{targets.find((entry) => entry.id === (watch.taskId ?? watch.sessionId))?.title ?? (watch.taskId ? t("Linked task") : t("Linked session"))}: {watch.status} · {watch.wakes}{t("/3 wakeups")}{watch.autoWake ? t(" · automatic") : t(" · observe only")}</span>
      <button type="button" disabled={busy} onClick={() => void act(() => updatePrWatch(cwd, watch.id, watch.status === "paused" ? "resume" : "pause"))}>{watch.status === "paused" ? t("Resume") : t("Pause")}</button>
      <button type="button" disabled={busy} onClick={() => void act(() => updatePrWatch(cwd, watch.id, "remove"))}>{t("Unlink")}</button>
      {watch.notice ? <span className="w-full text-content/60">{watch.notice}</span> : null}
    </div>)}
    {targets.length > 0 ? <div className="mt-2 flex flex-wrap items-center gap-2">
      <select aria-label={t("Session or task to link")} value={selected} onChange={(event) => setSelected(event.target.value)} className="bg-transparent">
        <option value="">{t("Select a session or task")}</option>
        {targets.map((entry) => <option key={`${entry.kind ?? "session"}:${entry.id}`} value={`${entry.kind ?? "session"}:${entry.id}`}>{entry.title}</option>)}
      </select>
      <label><input type="checkbox" checked={autoWake} onChange={(event) => setAutoWake(event.target.checked)} />{t(" Wake agent on new failures, reviews or conflicts (max 3)")}</label>
      <button type="button" disabled={busy || !selected} onClick={() => void act(() => {
        const split = selected.indexOf(":");
        const kind = selected.slice(0, split);
        const id = selected.slice(split + 1);
        return linkPrWatch(cwd, { repo, number, autoWake, ...(kind === "task" ? { taskId: id } : { sessionId: id }) });
      })}>{t("Link PR")}</button>
    </div> : <p className="mt-2 text-content/60">{t("Start a related session to link this PR.")}</p>}
    {error ? <p role="alert" className="mt-2 text-content/70">{error}</p> : null}
  </section>;
}
