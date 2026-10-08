import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { promisify } from "node:util";
import type { HostStore } from "./store";
import { prWatchReasons, type PrWatch, type PrWatchInput, type PrWatchSnapshot } from "../src/features/inbox/model/prWatches";

const exec = promisify(execFile);
export const MAX_PR_WATCH_WAKEUPS = 3;
export const MAX_PR_WATCH_READ_FAILURES = 3;
export const MAX_PR_WATCHES = 100;
const INTERVAL_MS = 60_000;

/** Uses the existing gh credential chain; never stores a token. */
export async function readGithubPr(cwd: string, repo: string, number: number): Promise<PrWatchSnapshot> {
  const { stdout } = await exec("gh", ["pr", "view", String(number), "--repo", repo, "--json", "headRefOid,state,statusCheckRollup,reviews,mergeable"], {
    cwd, timeout: 30_000, maxBuffer: 1024 * 1024, windowsHide: true,
    env: { ...process.env, GH_PROMPT_DISABLED: "1", GIT_TERMINAL_PROMPT: "0" },
  });
  const value = JSON.parse(stdout) as {
    headRefOid: string; state: PrWatchSnapshot["state"]; mergeable: string;
    reviews?: { id: string; state: string }[];
    statusCheckRollup?: { name?: string; context?: string; conclusion?: string; state?: string }[];
  };
  if (!value.headRefOid || !["OPEN", "CLOSED", "MERGED"].includes(value.state)) throw new Error("GitHub returned an incomplete pull request snapshot");
  return {
    headOid: value.headRefOid, state: value.state, conflicting: value.mergeable === "CONFLICTING",
    failedChecks: [...new Set((value.statusCheckRollup ?? []).filter((check) => ["FAILURE", "ERROR", "TIMED_OUT", "ACTION_REQUIRED", "STARTUP_FAILURE"].includes(check.conclusion ?? check.state ?? "")).map((check) => check.name ?? check.context ?? "Unnamed check"))].sort(),
    reviewIds: [...new Set((value.reviews ?? []).filter((review) => ["APPROVED", "CHANGES_REQUESTED", "COMMENTED"].includes(review.state)).map((review) => review.id))].sort(),
  };
}

export type PrWatchHooks = {
  /** Must be receipt-deduplicated by eventId. Return false while busy/offline. */
  wake: (watch: PrWatch, prompt: string, eventId: string) => Promise<boolean>;
  read?: typeof readGithubPr;
  now?: () => number;
};

export class HostPrWatches {
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;
  private readonly now: () => number;
  constructor(private readonly store: HostStore, private readonly hooks: PrWatchHooks) {
    this.now = hooks.now ?? Date.now;
    store.db.exec("CREATE TABLE IF NOT EXISTS pr_watches (id TEXT PRIMARY KEY, value TEXT NOT NULL)");
  }
  start(): void {
    if (this.timer) return;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), INTERVAL_MS);
    this.timer.unref?.();
  }
  stop(): void { clearInterval(this.timer); this.timer = undefined; }
  idle(): Promise<void> { return this.running ?? Promise.resolve(); }
  list(projectId?: string): PrWatch[] {
    return this.store.db.prepare("SELECT value FROM pr_watches").all().map((row) => JSON.parse(String(row.value)) as PrWatch).filter((watch) => !projectId || watch.projectId === projectId);
  }
  private save(watch: PrWatch): PrWatch {
    const existing = this.store.db.prepare("SELECT value FROM pr_watches WHERE id=?").get(watch.id);
    const previous = existing ? JSON.parse(String(existing.value)) as PrWatch : undefined;
    watch.updatedAt = Math.max(this.now(), (previous?.updatedAt ?? 0) + 1);
    this.store.db.prepare("INSERT OR REPLACE INTO pr_watches VALUES (?, ?)").run(watch.id, JSON.stringify(watch));
    return watch;
  }
  private get(id: string): PrWatch {
    const watch = this.list().find((entry) => entry.id === id);
    if (!watch) throw new Error("Pull request link was not found");
    return watch;
  }
  private validateTarget(input: PrWatchInput): void {
    this.store.project(input.projectId);
    if (!input.sessionId && !input.taskId) throw new Error("Select a session or task to link");
    if (input.sessionId && this.store.session(input.sessionId).projectId !== input.projectId) throw new Error("Session belongs to another project");
    if (input.taskId) {
      const row = this.store.db.prepare("SELECT value FROM tasks WHERE id=?").get(input.taskId);
      if (!row || (JSON.parse(String(row.value)) as { projectId: string }).projectId !== input.projectId) throw new Error("Task belongs to another project or no longer exists");
    }
  }
  link(input: PrWatchInput): PrWatch {
    if (!input || typeof input.projectId !== "string" || typeof input.repo !== "string" || input.repo.length > 256 || (input.sessionId !== undefined && typeof input.sessionId !== "string") || (input.taskId !== undefined && typeof input.taskId !== "string")) throw new Error("Invalid pull request link");
    this.validateTarget(input);
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(input.repo) || !Number.isSafeInteger(input.number) || input.number < 1) throw new Error("Enter a valid GitHub repository and pull request number");
    const existing = this.list().find((watch) => watch.projectId === input.projectId && watch.repo.toLowerCase() === input.repo.toLowerCase() && watch.number === input.number && watch.taskId === input.taskId && watch.sessionId === input.sessionId);
    if (existing) return this.save({ ...existing, autoWake: input.autoWake === true });
    if (this.list().length >= MAX_PR_WATCHES) throw new Error("Remove an old PR link before adding another (limit 100)");
    return this.save({ projectId: input.projectId, repo: input.repo, number: input.number, sessionId: input.sessionId, taskId: input.taskId, autoWake: input.autoWake === true, id: randomUUID(), createdAt: this.now(), updatedAt: this.now(), status: "watching", wakes: 0, readFailures: 0 });
  }
  remove(id: string): void { this.get(id); this.store.db.prepare("DELETE FROM pr_watches WHERE id=?").run(id); }
  resume(id: string): PrWatch {
    const watch = this.get(id);
    this.validateTarget(watch);
    // Explicit owner action renews the finite wakeup budget.
    return this.save({ ...watch, status: "watching", readFailures: 0, wakes: 0, notice: undefined });
  }
  pause(id: string): PrWatch { return this.save({ ...this.get(id), status: "paused", notice: "Paused by owner" }); }
  check(id: string): Promise<void> {
    if (this.running) return this.running.then(() => this.check(id));
    this.running = this.observe(this.get(id)).finally(() => { this.running = undefined; });
    return this.running;
  }
  tick(): Promise<void> {
    if (this.running) return this.running;
    this.running = (async () => {
      for (const watch of this.list().filter((entry) => entry.status === "watching")) await this.observe(watch);
    })().finally(() => { this.running = undefined; });
    return this.running;
  }
  private async observe(watch: PrWatch): Promise<void> {
    if (watch.status !== "watching") return;
    try {
      this.validateTarget(watch);
      const snapshot = await (this.hooks.read ?? readGithubPr)(this.store.project(watch.projectId).cwd, watch.repo, watch.number);
      // Do not resurrect a removed link or overwrite an owner action during I/O.
      const current = this.list().find((entry) => entry.id === watch.id);
      if (!current || current.updatedAt !== watch.updatedAt || current.status !== "watching") return;
      const reasons = prWatchReasons(watch.snapshot, snapshot);
      watch.readFailures = 0;
      watch.notice = undefined;
      if (!watch.snapshot) {
        // Linking an existing PR establishes a baseline, not a new review event.
        reasons.splice(0, reasons.length);
      }
      watch.snapshot = snapshot;
      if (snapshot.state !== "OPEN") { watch.status = "closed"; watch.pendingEvent = undefined; }
      else if (reasons.length && watch.autoWake) {
        const id = createHash("sha256").update(JSON.stringify([watch.id, snapshot.headOid, snapshot.failedChecks, snapshot.reviewIds, snapshot.conflicting])).digest("hex");
        if (watch.lastEventId !== id) watch.pendingEvent = { id, prompt: `Linked PR https://github.com/${watch.repo}/pull/${watch.number} changed.\n${reasons.join("\n")}\nInspect current evidence and fix only relevant failures. Do not push, merge or publish without owner authorization.` };
      }
      this.save(watch); // Persist intent before invoking the engine.
      if (watch.pendingEvent && watch.autoWake && watch.status === "watching") {
        if (watch.wakes >= MAX_PR_WATCH_WAKEUPS) { watch.status = "paused"; watch.notice = "Three automatic wakeups reached. Inspect the result and resume explicitly."; }
        else if (await this.hooks.wake(watch, watch.pendingEvent.prompt, watch.pendingEvent.id)) {
          watch.lastEventId = watch.pendingEvent.id;
          watch.pendingEvent = undefined;
          watch.wakes++;
          if (watch.wakes >= MAX_PR_WATCH_WAKEUPS) { watch.status = "paused"; watch.notice = "Three automatic wakeups reached. Inspect the result and resume explicitly."; }
        } else watch.notice = "Waiting for the linked target to be available";
        const latest = this.list().find((entry) => entry.id === watch.id);
        if (latest?.updatedAt === watch.updatedAt && latest.status === "watching") this.save(watch);
      }
    } catch (error) {
      const latest = this.list().find((entry) => entry.id === watch.id);
      if (!latest || latest.updatedAt !== watch.updatedAt || latest.status !== "watching") return;
      watch.readFailures++;
      // Do not include stderr: credential helpers can print sensitive content.
      watch.notice = error instanceof Error && error.message.startsWith("Session belongs") ? error.message : "PR read or wake failed. Check GitHub login, target and network access.";
      if (watch.readFailures >= MAX_PR_WATCH_READ_FAILURES) { watch.status = "paused"; watch.notice += " Paused after three failures."; }
      this.save(watch);
    }
  }
}
