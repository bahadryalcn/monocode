import { randomUUID } from "node:crypto";
import type { HostSessionSummary } from "../src/features/connections/model/protocol";

export type SessionRef = {
  sessionId: string;
  revision: number;
  deleted?: boolean;
};
export type ProjectRef = {
  projectId: string;
  etag: string;
  base?: string;
  sessions?: HostSessionSummary[];
  upserts?: HostSessionSummary[];
  removed?: string[];
};
export type RemoteChangesInput = {
  instanceId?: string;
  sessions: { sessionId: string; revision: number }[];
  projects: { projectId: string; known?: string }[];
  tasksKnown?: string;
  waitMs?: number;
};
export type RemoteChangesValue = {
  instanceId: string;
  reset: boolean;
  sessions: SessionRef[];
  projects: ProjectRef[];
  tasks?: { etag: string };
};

/** One bounded metadata poll for a set of session and project cursors. */
export class RemoteChanges {
  readonly instanceId = randomUUID();
  private active = 0;
  private sessionCache = new Map<
    string,
    { at: number; revision: number | undefined }
  >();
  private projectBaselines = new Map<
    string,
    Map<string, HostSessionSummary[]>
  >();

  async read(
    input: RemoteChangesInput,
    readSession: (id: string) => number | undefined,
    readProject: (
      id: string,
    ) => Promise<{ etag: string; sessions: HostSessionSummary[] }>,
    cancelled: () => boolean = () => false,
    readTasks?: () => Promise<string>,
  ): Promise<RemoteChangesValue> {
    if (!Array.isArray(input.sessions) || input.sessions.length > 64)
      throw new Error("At most 64 session subscriptions are allowed");
    if (!Array.isArray(input.projects) || input.projects.length > 32)
      throw new Error("At most 32 project subscriptions are allowed");
    const sessions = input.sessions.map((entry) => {
      if (
        !entry ||
        typeof entry.sessionId !== "string" ||
        !entry.sessionId ||
        !Number.isSafeInteger(entry.revision) ||
        entry.revision < 0
      )
        throw new Error("Invalid session subscription");
      return entry;
    });
    const projects = input.projects.map((entry) => {
      if (
        !entry ||
        typeof entry.projectId !== "string" ||
        !entry.projectId ||
        (entry.known !== undefined && typeof entry.known !== "string")
      )
        throw new Error("Invalid project subscription");
      return entry;
    });
    const reset = input.instanceId !== this.instanceId;
    const readCachedSession = (id: string) => {
      const now = Date.now();
      const cached = this.sessionCache.get(id);
      if (cached && now - cached.at < 200) return cached.revision;
      const revision = readSession(id);
      this.sessionCache.set(id, { at: now, revision });
      while (this.sessionCache.size > 4096)
        this.sessionCache.delete(this.sessionCache.keys().next().value!);
      return revision;
    };
    const changed = async (): Promise<RemoteChangesValue> => {
      const sessionValues = sessions.flatMap(({ sessionId, revision }) => {
        const current = readCachedSession(sessionId);
        if (current === undefined)
          return reset
            ? [{ sessionId, revision: 0, deleted: true }]
            : [{ sessionId, revision, deleted: true }];
        return reset || current !== revision
          ? [{ sessionId, revision: current }]
          : [];
      });
      const projectValues: ProjectRef[] = [];
      for (const { projectId, known } of projects) {
        const value = await readProject(projectId);
        this.rememberProject(projectId, value.etag, value.sessions);
        if (reset || known !== value.etag) {
          const previous =
            known === undefined
              ? undefined
              : this.projectBaselines.get(projectId)?.get(known);
          if (
            !reset &&
            known !== undefined &&
            previous &&
            previous.length <= 512 &&
            value.sessions.length <= 512
          ) {
            if (
              previous.every((row) => this.summaryId(row) !== undefined) &&
              value.sessions.every((row) => this.summaryId(row) !== undefined)
            ) {
              const before = new Map<string, HostSessionSummary>(
                previous.map((row) => [this.summaryId(row)!, row]),
              );
              const after = new Map<string, HostSessionSummary>(
                value.sessions.map((row) => [this.summaryId(row)!, row]),
              );
              const upserts = [...after]
                .filter(([id, row]) => {
                  const old = before.get(id);
                  return (
                    old === undefined ||
                    JSON.stringify(old) !== JSON.stringify(row)
                  );
                })
                .map(([, row]) => row);
              const removed = [...before.keys()].filter((id) => !after.has(id));
              projectValues.push({
                projectId,
                etag: value.etag,
                base: known,
                upserts,
                removed,
              });
              continue;
            }
          }
          projectValues.push({
            projectId,
            etag: value.etag,
            ...(known === undefined ? {} : { base: known }),
            sessions: value.sessions,
          });
        }
      }
      let tasks: { etag: string } | undefined;
      if (input.tasksKnown !== undefined && readTasks) {
        const etag = await readTasks();
        if (input.tasksKnown !== etag) tasks = { etag };
      }
      return {
        instanceId: this.instanceId,
        reset,
        sessions: sessionValues,
        projects: projectValues,
        ...(tasks ? { tasks } : {}),
      };
    };
    const first = await changed();
    if (
      reset ||
      first.sessions.length ||
      first.projects.length ||
      first.tasks ||
      cancelled()
    )
      return first;
    if (this.active >= 64) return first;
    this.active++;
    const deadline =
      Date.now() + Math.min(10_000, Math.max(0, Number(input.waitMs) || 0));
    try {
      while (!cancelled() && Date.now() < deadline) {
        await new Promise<void>((resolve) =>
          setTimeout(resolve, Math.min(100, deadline - Date.now())),
        );
        const next = await changed();
        if (next.sessions.length || next.projects.length || next.tasks)
          return next;
      }
      return await changed();
    } finally {
      this.active--;
    }
  }

  private summaryId(value: unknown): string | undefined {
    return value &&
      typeof value === "object" &&
      typeof (value as { id?: unknown }).id === "string"
      ? (value as { id: string }).id
      : undefined;
  }

  private rememberProject(
    projectId: string,
    etag: string,
    sessions: HostSessionSummary[],
  ) {
    if (
      sessions.length > 512 ||
      sessions.some((session) => this.summaryId(session) === undefined)
    )
      return;
    let versions = this.projectBaselines.get(projectId);
    if (!versions) {
      versions = new Map();
      this.projectBaselines.set(projectId, versions);
    }
    versions.delete(etag);
    versions.set(etag, sessions);
    while (versions.size > 4) versions.delete(versions.keys().next().value!);
    while (this.projectBaselines.size > 32)
      this.projectBaselines.delete(this.projectBaselines.keys().next().value!);
  }
}
