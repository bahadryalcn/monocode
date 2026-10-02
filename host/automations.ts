import { randomUUID } from "node:crypto";
import {
  automationLimits,
  dailyRunLimitSkip,
  runLimitBreach,
} from "../src/features/automations/model/automationLimits";
import { nextAutomationRunAt } from "../src/features/automations/model/automationSchedule";
import {
  parseHostAutomation,
  type HostAutomation,
  type HostAutomationRun,
} from "../src/features/automations/model/hostAutomations";
import type { HostEngine } from "./engine";
import type { HostStore } from "./store";

const TICK_MS = 30_000;
const MAX_RUNS_PER_AUTOMATION = 100;
/** A run this overdue was missed while the machine was off or asleep. */
const MISSED_RUN_GRACE_MS = 12 * 60 * 60_000;

export const MISSED_RUN_SKIP = "Skipped: missed while this machine was off.";
export const PREVIOUS_RUN_SKIP = "Skipped: the previous run is still going.";
const STOPPED_BY_USER = "Stopped by you.";

/** Runs saved automations on this machine's own clock, so they keep going
 * with no desktop open. Each run is an ordinary host session. */
export class HostAutomations {
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly store: HostStore,
    private readonly engine: Pick<HostEngine, "command" | "updateSession">,
    private readonly now: () => number = Date.now,
  ) {
    store.db.exec(`
      CREATE TABLE IF NOT EXISTS automations (id TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS automation_runs (id TEXT PRIMARY KEY, automation_id TEXT NOT NULL REFERENCES automations(id) ON DELETE CASCADE, created_at INTEGER NOT NULL, value TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS automation_runs_history_idx ON automation_runs (automation_id, created_at DESC);`);
  }

  start(): void {
    this.tick();
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.timer.unref?.();
  }

  stop(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  list(): HostAutomation[] {
    return this.store.db
      .prepare("SELECT value FROM automations")
      .all()
      .map((row) => JSON.parse(String(row.value)) as HostAutomation)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  /** Newest first. */
  runs(automationId: string): HostAutomationRun[] {
    return this.store.db
      .prepare(
        "SELECT value FROM automation_runs WHERE automation_id=? ORDER BY created_at DESC, rowid DESC",
      )
      .all(automationId)
      .map((row) => JSON.parse(String(row.value)) as HostAutomationRun);
  }

  save(raw: unknown): HostAutomation {
    const input = parseHostAutomation(raw);
    this.store.project(input.projectId);
    const now = this.now();
    const previous = this.find(input.id);
    return this.write({
      ...input,
      nextRunAt: nextAutomationRunAt(input, now),
      lastRunAt: previous?.lastRunAt,
      lastRunStatus: previous?.lastRunStatus,
      lastRunError: previous?.lastRunError,
      lastSessionId: previous?.lastSessionId,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    });
  }

  delete(id: string): void {
    this.store.db.prepare("DELETE FROM automations WHERE id=?").run(id);
  }

  runNow(id: string): HostAutomationRun {
    const automation = this.find(id);
    if (!automation) throw new Error("Automation not found.");
    const now = this.now();
    return this.launch(automation, this.newRun(automation, "manual", now), now);
  }

  /** Settles finished runs, stops runs past their time limit, starts due ones. */
  tick(): void {
    const now = this.now();
    for (const run of this.activeRuns()) {
      try {
        this.settle(run, now);
      } catch (error) {
        console.error("Could not settle an automation run:", message(error));
      }
    }
    for (const automation of this.list()) {
      if (!automation.enabled || automation.nextRunAt > now) continue;
      try {
        const scheduledFor = automation.nextRunAt;
        const due = this.write({
          ...automation,
          nextRunAt: nextAutomationRunAt(automation, now),
        });
        const run = this.newRun(due, "scheduled", scheduledFor);
        if (now - scheduledFor > MISSED_RUN_GRACE_MS)
          this.finish(run, "skipped", MISSED_RUN_SKIP, now);
        else this.launch(due, run, now);
      } catch (error) {
        console.error("Could not start an automation:", message(error));
      }
    }
  }

  private find(id: string): HostAutomation | undefined {
    const row = this.store.db
      .prepare("SELECT value FROM automations WHERE id=?")
      .get(id);
    return row ? (JSON.parse(String(row.value)) as HostAutomation) : undefined;
  }

  private write(automation: HostAutomation): HostAutomation {
    this.store.db
      .prepare(
        "INSERT INTO automations VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET value=excluded.value",
      )
      .run(automation.id, JSON.stringify(automation));
    return automation;
  }

  private writeRun(run: HostAutomationRun): HostAutomationRun {
    this.store.db
      .prepare(
        "INSERT INTO automation_runs VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET value=excluded.value",
      )
      .run(run.id, run.automationId, run.createdAt, JSON.stringify(run));
    return run;
  }

  private newRun(
    automation: HostAutomation,
    trigger: HostAutomationRun["trigger"],
    scheduledFor: number,
  ): HostAutomationRun {
    return this.writeRun({
      id: randomUUID(),
      automationId: automation.id,
      trigger,
      scheduledFor,
      createdAt: this.now(),
      status: "pending",
    });
  }

  private activeRuns(): HostAutomationRun[] {
    return this.list()
      .flatMap((automation) => this.runs(automation.id))
      .filter((run) => run.status === "running");
  }

  private launch(
    automation: HostAutomation,
    run: HostAutomationRun,
    now: number,
  ): HostAutomationRun {
    const history = this.runs(automation.id);
    const skip = history.some(
      (other) => other.id !== run.id && other.status === "running",
    )
      ? PREVIOUS_RUN_SKIP
      : run.trigger === "manual"
        ? null
        : dailyRunLimitSkip(automationLimits(automation), history, run.id, now);
    if (skip) return this.finish(run, "skipped", skip, now);
    let sessionId: string | undefined;
    try {
      sessionId = this.engine.command({
        type: "create",
        commandId: randomUUID(),
        projectId: automation.projectId,
        harness: automation.harness,
        model: automation.model,
        modelSettings: automation.modelSettings,
        runtimeMode: automation.runtimeMode,
      }).sessionId;
      this.engine.updateSession(sessionId, { title: automation.name });
      this.engine.command({
        type: "send",
        commandId: randomUUID(),
        sessionId,
        text: automation.prompt,
      });
      return this.writeRun({
        ...run,
        status: "running",
        startedAt: now,
        sessionId,
        runId: this.store.session(sessionId).runId,
      });
    } catch (error) {
      return this.finish({ ...run, sessionId }, "failed", message(error), now);
    }
  }

  private settle(run: HostAutomationRun, now: number): void {
    let session;
    try {
      session = this.store.session(run.sessionId ?? "");
    } catch {
      this.finish(run, "failed", "The run's session was deleted.", now);
      return;
    }
    if (session.status === "running" && session.runId === run.runId) {
      const automation = this.find(run.automationId);
      const breach =
        !run.error && automation
          ? runLimitBreach(automationLimits(automation), {
              startedAt: run.startedAt ?? run.createdAt,
              now,
            })
          : null;
      if (!breach) return;
      // The reason is saved first: the turn settles asynchronously, and a
      // later tick records it as the run's outcome.
      this.writeRun({ ...run, error: breach });
      this.engine.command({
        type: "cancel",
        commandId: randomUUID(),
        sessionId: session.session.id,
        runId: run.runId,
      });
      return;
    }
    if (run.error) {
      this.finish(run, "failed", run.error, now);
    } else if (session.status === "interrupted") {
      this.finish(run, "failed", "The host stopped during this run.", now);
    } else {
      // The host ends a failed or stopped turn with a system note.
      const last = session.session.blocks.at(-1);
      const note = last?.role === "system" ? last.text.trim() : "";
      if (!note) this.finish(run, "succeeded", undefined, now);
      else if (note === STOPPED_BY_USER)
        this.finish(run, "cancelled", undefined, now);
      else this.finish(run, "failed", note, now);
    }
  }

  private finish(
    run: HostAutomationRun,
    status: HostAutomationRun["status"],
    error: string | undefined,
    now: number,
  ): HostAutomationRun {
    const finished = this.writeRun({
      ...run,
      status,
      completedAt: now,
      error: error || undefined,
    });
    const automation = this.find(run.automationId);
    if (automation)
      this.write({
        ...automation,
        lastRunAt: now,
        lastRunStatus: status,
        lastRunError: finished.error,
        lastSessionId: finished.sessionId ?? automation.lastSessionId,
      });
    this.store.db
      .prepare(
        "DELETE FROM automation_runs WHERE automation_id=? AND id NOT IN (SELECT id FROM automation_runs WHERE automation_id=? ORDER BY created_at DESC, rowid DESC LIMIT ?)",
      )
      .run(run.automationId, run.automationId, MAX_RUNS_PER_AUTOMATION);
    return finished;
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
