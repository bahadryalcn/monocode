import type { HostSessionSummary } from "./protocol";

/** Completed and in-flight reads are shared by the sidebar and project rail. */
export class RemoteSessionLists {
  private entries = new Map<
    string,
    { at: number; value: HostSessionSummary[]; json: string }
  >();
  private pending = new Map<string, Promise<HostSessionSummary[]>>();
  private generation = 0;

  constructor(
    private readonly request: (
      machineId: string,
      projectId: string,
    ) => Promise<HostSessionSummary[]>,
  ) {}

  invalidate(): void {
    this.generation++;
    this.entries.clear();
    this.pending.clear();
  }

  load(machineId: string, projectId: string): Promise<HostSessionSummary[]> {
    const key = JSON.stringify([machineId, projectId]);
    const entry = this.entries.get(key);
    const age = entry?.value.some(
      (session) => session.status === "running" || session.needsInput,
    )
      ? 1_000
      : 5_000;
    if (entry && Date.now() - entry.at < age)
      return Promise.resolve(entry.value);
    const pending = this.pending.get(key);
    if (pending) return pending;
    const generation = this.generation;
    const read = this.request(machineId, projectId)
      .then((next) => {
        if (generation !== this.generation) return this.load(machineId, projectId);
        if (!Array.isArray(next)) throw new Error("Invalid host session list");
        const json = JSON.stringify(next);
        const value = entry?.json === json ? entry.value : next;
        if (generation === this.generation) {
          this.entries.delete(key);
          this.entries.set(key, { at: Date.now(), value, json });
          if (this.entries.size > 256)
            this.entries.delete(this.entries.keys().next().value!);
        }
        return value;
      })
      .finally(() => {
        if (this.pending.get(key) === read) this.pending.delete(key);
      });
    this.pending.set(key, read);
    return read;
  }
}
