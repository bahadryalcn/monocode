import type { HostTask } from "../src/features/tasks/model/hostTasks";
import { readTaskInstructions } from "../src/features/tasks/model/taskInstructions";

export function taskContract(task: HostTask): string {
  return JSON.stringify({
    schema: "monocode.task-contract.v1",
    task: { id: task.id, title: task.title, instructions: readTaskInstructions(task.prompt) ?? { objective: task.prompt } },
    workspace: { path: task.worktreeCwd, branch: task.branch, baseCommit: task.baseCommit },
    integration: task.mergeRepair,
    verification: { command: task.verifyCommand, reviewRequired: task.review !== false },
  }, null, 2);
}

export function blockedHandoff(task: HostTask): string {
  return [
    "You are the independent recovery agent taking over a BLOCKED task. Inspect the retained work and diagnose why earlier attempts failed before editing. Complete the original task using a different, evidence-backed approach; do not repeat unsuccessful attempts. Work alone in the assigned checkout, preserve completed work, and do not spawn another recovery agent.",
    "Investigate whether a claimed external blocker has a valid local solution or available alternative. Never weaken acceptance criteria, invent evidence, bypass checks, obtain credentials, or claim unavailable device tests passed. If genuinely impossible with current access, stop and ask one specific question naming the missing resource and the exact next action. Do not ask the owner to restate the task or monitor progress.",
    "The original checks and an independent review still decide completion. Return a concise handoff: root cause, changes, evidence, remaining blockers and (only if necessary) one concrete owner request.",
    JSON.stringify({
      schema: "monocode.blocked-handoff.v1",
      blocker: task.blockedTakeover?.blocker,
      previousSessionId: task.blockedTakeover?.previousSessionId,
      attempts: (task.attemptHistory ?? []).slice(-3).map((entry) => ({
        verdict: entry.verdict, note: entry.note,
        workerSummary: entry.workerSummary.slice(-2000),
        findings: entry.findings.slice(0, 12).map((finding) => finding.slice(0, 1200)),
      })),
      openFindings: (task.reviewNotes ?? []).filter((note) => note.kind === "finding" && !note.resolvedAt)
        .slice(0, 20).map((note) => ({ finding: note.finding.slice(0, 1200), suggestion: note.suggestion?.slice(0, 1200), category: note.category })),
    }, null, 2),
  ].join("\n\n");
}
