import { NO_VERDICT, type TaskReviewNote } from "./hostTasks";

export type ReviewFinding = Pick<
  TaskReviewNote,
  "finding" | "suggestion" | "details" | "kind"
>;
const FINDING_LIMIT = 2000;
const SUGGESTION_LIMIT = 1000;
const MAX_FINDINGS = 12;

/** Explicit findings, with a legacy verdict as the fallback. Ordinary prose is
 * not classified as defects, nor are infrastructure errors treated as reviews. */
export function reviewFindings(
  reply: string,
  review: { verdict: "pass" | "fail"; note: string },
): ReviewFinding[] {
  const blocks = [...reply.matchAll(/```json\s*([\s\S]*?)```/gi)];
  for (const block of blocks.reverse()) {
    try {
      const value: unknown = JSON.parse(block[1]);
      if (
        !value ||
        typeof value !== "object" ||
        !Array.isArray((value as { reviewNotes?: unknown }).reviewNotes)
      )
        continue;
      const notes = (value as { reviewNotes: unknown[] }).reviewNotes
        .flatMap((entry): ReviewFinding[] => {
          if (!entry || typeof entry !== "object") return [];
          const note = entry as Record<string, unknown>;
          if (typeof note.finding !== "string" || !note.finding.trim())
            return [];
          const kind = note.kind === "suggestion" ? "suggestion" : "finding";
          if (review.verdict === "pass" && kind !== "suggestion") return [];
          return [
            {
              finding: note.finding.trim().slice(0, FINDING_LIMIT),
              ...(typeof note.suggestion === "string" && note.suggestion.trim()
                ? {
                    suggestion: note.suggestion
                      .trim()
                      .slice(0, SUGGESTION_LIMIT),
                  }
                : {}),
              kind,
            },
          ];
        })
        .slice(0, MAX_FINDINGS);
      if (notes.length) {
        if (
          review.verdict === "fail" &&
          !notes.some((note) => note.kind === "finding")
        )
          return [
            {
              finding: review.note.trim().slice(0, FINDING_LIMIT),
              kind: "finding" as const,
            },
            ...notes,
          ].slice(0, MAX_FINDINGS);
        return notes;
      }
    } catch {
      // Old reviews and malformed optional notes still retain their verdict.
    }
  }
  return review.verdict === "fail" &&
    review.note !== NO_VERDICT &&
    review.note.trim()
    ? [
        {
          finding: review.note.trim().slice(0, FINDING_LIMIT),
          ...(reply.trim()
            ? {
                details: reply
                  .trim()
                  .split(/\r?\n/)
                  .slice(0, -1)
                  .join("\n")
                  .trim()
                  .slice(0, 6000),
              }
            : {}),
          kind: "finding",
        },
      ]
    : [];
}

const findingKey = (finding: string) =>
  finding.trim().replace(/\s+/g, " ").toLowerCase();

/** Repeated findings retain their identity and read state. A resolved finding
 * returning is reopened and unread; repeating it in the same session is idempotent. */
export function addReviewNotes(
  previous: readonly TaskReviewNote[],
  findings: readonly ReviewFinding[],
  sessionId: string | undefined,
  now: number,
  nextId: () => string,
): TaskReviewNote[] {
  const notes = [...previous];
  for (const finding of findings) {
    const at = notes.findIndex(
      (note) =>
        note.kind === finding.kind &&
        findingKey(note.finding) === findingKey(finding.finding),
    );
    if (at < 0) {
      notes.push({
        ...finding,
        id: nextId(),
        sessionId,
        ...(sessionId ? { sessionIds: [sessionId] } : {}),
        createdAt: now,
        updatedAt: now,
        occurrences: 1,
      });
      continue;
    }
    const note = notes[at];
    if (sessionId && note.sessionId === sessionId) continue;
    notes[at] = {
      ...note,
      ...finding,
      sessionId,
      sessionIds: [
        ...new Set([
          ...(note.sessionIds ?? (note.sessionId ? [note.sessionId] : [])),
          ...(sessionId ? [sessionId] : []),
        ]),
      ],
      updatedAt: now,
      occurrences: note.occurrences + 1,
      readAt: note.resolvedAt !== undefined ? undefined : note.readAt,
      resolvedAt: undefined,
    };
  }
  return notes;
}

export function resolveReviewFindings(
  notes: readonly TaskReviewNote[],
  now: number,
): TaskReviewNote[] {
  return notes.map((note) =>
    note.kind === "finding" && note.resolvedAt === undefined
      ? { ...note, resolvedAt: now, updatedAt: now }
      : note,
  );
}

export function unreadReviewNotes(
  notes: readonly TaskReviewNote[] = [],
): number {
  return notes.filter((note) => note.readAt === undefined).length;
}

/** Only open findings are requirements; suggestions remain optional. */
export function openReviewNotesPrompt(
  notes: readonly TaskReviewNote[] = [],
): string {
  const open = notes.filter((note) => note.resolvedAt === undefined);
  if (!open.length) return "";
  return [
    "Open review notes for this task. Fix findings against the original spec; suggestions are optional. A note's status does not replace the task's checks or review.",
    ...open.map(
      (note) =>
        `[${note.kind}] ${note.finding}${note.suggestion ? `\nSuggested correction: ${note.suggestion}` : ""}${note.details ? `\nReview details: ${note.details}` : ""}`,
    ),
  ]
    .join("\n\n")
    .slice(0, 12_000);
}
