import { TASK_INPUT_REQUIRED, canTakeOverBlockedTask, taskRequiresInstructions, type HostTask } from "../model/hostTasks";

export function repairStopLabel(task: HostTask): string | undefined {
  if (canTakeOverBlockedTask(task)) return "AI takeover pending";
  if (task.blockedTakeover && ["queued", "running", "verifying"].includes(task.status))
    return "Independent AI completing blocked work";
  if (taskRequiresInstructions(task)) return "Waiting for your instructions";
  if (task.repairStop?.reason === "external")
    return "Waiting for external verification";
  if (task.repairStop?.reason === "no_progress")
    return "Correction stopped · findings unchanged";
  if (
    task.repairStop?.reason === "limit" ||
    (task.status === "blocked" && (task.repairAttempts ?? 0) >= 3)
  )
    return "Correction stopped · attempt limit reached";
  return undefined;
}

export function TaskAttemptHistory({
  task,
  onOpenSession,
}: {
  task: HostTask;
  onOpenSession: (sessionId: string) => void;
}) {
  const stop = repairStopLabel(task);
  if (!stop && !task.attemptHistory?.length) return null;
  return (
    <section
      aria-label="Attempt history"
      className="space-y-2 border-t border-stroke pt-3"
    >
      {stop ? (
        <div className="space-y-1 text-[12px] text-amber-400">
          <p className="font-medium">{stop}</p>
          <p className="whitespace-pre-wrap break-words">
            {canTakeOverBlockedTask(task) ? "A fresh AI session will inspect the previous attempts and continue the retained work automatically when capacity is available." : task.blockedTakeover && task.status !== "blocked" ? "The recovery agent must pass the original checks and review before delivery." : task.repairStop?.message ??
              "Inspect the previous worker and review before retrying."}
          </p>
          <p className="text-content/55">
            {taskRequiresInstructions(task) ? `${TASK_INPUT_REQUIRED} ` : ""}
            Dependent tasks stay queued until this task passes its checks and is
            delivered. Independent queued tasks can continue.
          </p>
        </div>
      ) : null}
      {task.attemptHistory?.length ? (
        <>
          <h3 className="text-[12px] font-medium text-content/80">
            Attempt outcomes
          </h3>
          <p className="text-[11px] text-content/45">
            Worker summaries describe what the agent reported. The review below
            records verification.
          </p>
          {[...task.attemptHistory].reverse().map((entry) => (
            <details
              key={entry.reviewerSessionId}
              className="rounded-md border border-content/10 p-2 text-[12px]"
            >
              <summary className="cursor-pointer text-content/80">
                {entry.reviewOnly ? "Review recheck" : entry.attempt
                  ? `Correction ${entry.attempt}`
                  : "Initial attempt"}{" "}
                · {entry.verdict === "pass" ? "Review passed" : "Review failed"}{" "}
                · {new Date(entry.at).toLocaleString()}
              </summary>
              <p className="mt-2 whitespace-pre-wrap break-words text-content/70">
                {entry.workerSummary}
              </p>
              <p className="mt-2 whitespace-pre-wrap break-words text-content/70">
                Review: {entry.note}
              </p>
              <div className="mt-2 flex gap-3 text-[11px] text-sky-400">
                {entry.workerSessionId ? (
                  <button
                    type="button"
                    onClick={() => onOpenSession(entry.workerSessionId!)}
                  >
                    Open worker
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => onOpenSession(entry.reviewerSessionId)}
                >
                  Open review
                </button>
              </div>
            </details>
          ))}
        </>
      ) : null}
    </section>
  );
}
