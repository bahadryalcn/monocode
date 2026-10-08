/** Persisted on the project's host, never in browser-local polling state. */
export const HOST_PR_WATCHES = "delivery.pr";
export type PrWatchInput = {
  projectId: string;
  repo: string;
  number: number;
  sessionId?: string;
  taskId?: string;
  /** Agent wakeups require an explicit opt-in; linking alone only observes. */
  autoWake?: boolean;
};
export type PrWatchSnapshot = {
  headOid: string;
  state: "OPEN" | "CLOSED" | "MERGED";
  failedChecks: string[];
  reviewIds: string[];
  conflicting: boolean;
};
export type PrWatch = PrWatchInput & {
  id: string;
  createdAt: number;
  updatedAt: number;
  status: "watching" | "paused" | "closed";
  wakes: number;
  readFailures: number;
  snapshot?: PrWatchSnapshot;
  pendingEvent?: { id: string; prompt: string };
  lastEventId?: string;
  notice?: string;
};

export function parseGithubPrUrl(value: string): { repo: string; number: number } | null {
  try {
    const url = new URL(value);
    if (url.origin !== "https://github.com" || url.username || url.password) return null;
    const match = /^\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/pull\/([1-9]\d*)\/?$/.exec(url.pathname);
    if (!match || !Number.isSafeInteger(Number(match[3]))) return null;
    return { repo: `${match[1]}/${match[2]}`, number: Number(match[3]) };
  } catch { return null; }
}

/** Only new evidence wakes an agent; reordered API results do not. */
export function prWatchReasons(before: PrWatchSnapshot | undefined, next: PrWatchSnapshot): string[] {
  const reasons: string[] = [];
  if (next.state !== "OPEN") return reasons;
  const previousFailures = before?.headOid === next.headOid ? before.failedChecks : [];
  const failed = next.failedChecks.filter((name) => !previousFailures?.includes(name));
  if (failed.length) reasons.push(`Failing checks: ${failed.join(", ")}`);
  const reviews = next.reviewIds.filter((id) => !before?.reviewIds.includes(id));
  if (reviews.length) reasons.push(`${reviews.length} new submitted review(s)`);
  if (next.conflicting && (!before?.conflicting || before.headOid !== next.headOid)) reasons.push("The pull request has merge conflicts");
  return reasons;
}
