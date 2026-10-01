import { useEffect, useRef, useState } from "react";
import { useLockOverscroll } from "../../../shared/hooks/useLockOverscroll";
import { Shimmer } from "../../../shared/ui/Shimmer";
import {
  Bot,
  Check,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  X,
} from "../../../shared/ui/icons";
import {
  deriveActivityDock,
  dockCountLabel,
  dockStateLabel,
  nextUnseenDone,
  type ActivityDock as ActivityDockModel,
  type DockAgent,
} from "../model/activityDock";
import type { Block } from "../model/session";
import { AgentClock } from "./AgentClock";
import { formatElapsed, useElapsedFrom } from "./useElapsedFrom";

/** Expanded or not, per session, for as long as the app is open. */
const expandedBySession = new Map<string, boolean>();

type Props = {
  sessionId: string;
  blocks: Block[];
  busy: boolean;
  pendingQuestion: boolean;
  backgroundTasks?: string[];
  backgroundAgents?: number;
  /** False while another tab is in front; nothing counts as seen then. */
  visible?: boolean;
  /** The transcript is scrolled to its last line. */
  atEnd: boolean;
  /**
   * A row was clicked: a subagent opens its own panel, a background command
   * takes the reader to its row in the transcript.
   */
  onOpenAgent: (agent: DockAgent) => void;
};

/**
 * Turn state that stays beside the input. The transcript's own status line and
 * agent rows scroll away with the turn they belong to; this reads the same
 * data (one `deriveActivityDock`) from the one place the reader always is.
 */
export function ActivityDock({
  sessionId,
  blocks,
  busy,
  pendingQuestion,
  backgroundTasks,
  backgroundAgents,
  visible = true,
  atEnd,
  onOpenAgent,
}: Props) {
  const root = useRef<HTMLDivElement>(null);
  const [unseenDone, setUnseenDone] = useState(false);
  const wasBusy = useRef(busy);
  const wasAtEnd = useRef(atEnd);

  useEffect(() => {
    setUnseenDone((unseen) => nextUnseenDone(unseen, wasBusy.current, busy));
    wasBusy.current = busy;
  }, [busy]);

  // The result has been seen once the reader is at the input or back at the
  // end of the transcript. Hidden panes do not count: nobody is looking.
  useEffect(() => {
    const arrivedAtEnd = atEnd && !wasAtEnd.current;
    wasAtEnd.current = atEnd;
    if (arrivedAtEnd && visible) setUnseenDone(false);
  }, [atEnd, visible]);
  useEffect(() => {
    const composer = root.current?.closest("[data-composer]");
    if (!composer) return;
    const acknowledge = () => setUnseenDone(false);
    composer.addEventListener("focusin", acknowledge);
    return () => composer.removeEventListener("focusin", acknowledge);
  }, []);

  const dock = deriveActivityDock({
    blocks,
    busy,
    pendingQuestion,
    backgroundTasks,
    backgroundAgents,
    unseenDone,
  });
  const label = dockStateLabel(dock);

  return (
    <div ref={root}>
      {/* Always mounted, so a state change is announced rather than the dock
          appearing. The ticking clock stays out of it. */}
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {label}
      </span>
      {dock.state === "idle" ? null : (
        <DockBody
          key={dock.state === "done" ? "done" : "live"}
          sessionId={sessionId}
          dock={dock}
          label={label}
          onOpenAgent={onOpenAgent}
        />
      )}
    </div>
  );
}

function DockBody({
  sessionId,
  dock,
  label,
  onOpenAgent,
}: {
  sessionId: string;
  dock: ActivityDockModel;
  label: string;
  onOpenAgent: (agent: DockAgent) => void;
}) {
  const [expanded, setExpandedState] = useState(
    () => expandedBySession.get(sessionId) ?? false,
  );
  const lockList = useLockOverscroll<HTMLDivElement>();
  const setExpanded = (next: boolean) => {
    expandedBySession.set(sessionId, next);
    setExpandedState(next);
  };
  const hasAgents = dock.agents.length > 0;
  const open = expanded && hasAgents;
  const listId = `activity-dock-agents-${sessionId}`;
  const counts = dockCountLabel(dock);
  const clock = dock.state === "working" || dock.state === "waiting";

  return (
    <section
      aria-label="Turn activity"
      data-activity-dock={dock.state}
      className={`mb-1.5 overflow-hidden rounded-lg border border-content/10 bg-content/5 font-sans text-xs ${
        dock.state === "done" ? "activity-dock-done" : ""
      }`}
    >
      <div className="flex min-h-8 items-center gap-2 px-3">
        <DockMark state={dock.state} />
        <span
          className={`min-w-0 truncate ${
            dock.state === "needs-input"
              ? "text-amber-400"
              : dock.state === "done"
                ? "text-emerald-400"
                : "text-content/60"
          }`}
        >
          {dock.state === "working" ? (
            <Shimmer className="truncate" duration={1.6}>
              {label}
            </Shimmer>
          ) : (
            label
          )}
        </span>
        {clock ? <DockClock startedAt={dock.startedAt} /> : null}
        <span className="flex-1" />
        {hasAgents ? (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={listId}
            aria-label={`Background agents, ${counts}. ${open ? "Hide" : "Show"} list`}
            title={open ? "Hide agents" : "Show agents"}
            onClick={() => setExpanded(!open)}
            className="flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-[11px] text-content/50 hover:bg-content/8 hover:text-content focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
          >
            <Bot className="size-3" strokeWidth={1.75} />
            <span className="tabular-nums">{counts}</span>
            <ChevronUp
              className={`size-3 transition-transform duration-150 motion-reduce:transition-none ${
                open ? "" : "rotate-180"
              }`}
              strokeWidth={1.75}
            />
          </button>
        ) : null}
      </div>
      {open ? (
        <div
          id={listId}
          ref={lockList}
          className="flex max-h-40 flex-col gap-px overflow-y-auto overscroll-none border-t border-content/10 px-1 py-1"
        >
          {dock.agents.map((agent) => (
            <DockAgentRow
              key={agent.blockId}
              agent={agent}
              onOpen={onOpenAgent}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

/** Its own component so only the clock re-renders each second. */
function DockClock({ startedAt }: { startedAt?: number }) {
  const elapsed = formatElapsed(useElapsedFrom(startedAt, false));
  return (
    <span className="shrink-0 tabular-nums text-content/40">{elapsed}</span>
  );
}

function DockMark({ state }: { state: ActivityDockModel["state"] }) {
  if (state === "done" || state === "background") {
    return (
      <Check
        className={`size-3.5 shrink-0 ${
          state === "done"
            ? "activity-dock-check text-emerald-400"
            : "text-emerald-400/70"
        }`}
        strokeWidth={2.25}
      />
    );
  }
  if (state === "needs-input") {
    return (
      <CircleAlert
        className="size-3.5 shrink-0 text-amber-400"
        strokeWidth={1.75}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={`size-1.5 shrink-0 rounded-full bg-accent ${
        state === "working"
          ? "shadow-[0_0_8px_var(--color-accent)] motion-safe:animate-pulse"
          : "activity-dock-waiting"
      }`}
    />
  );
}

function DockAgentRow({
  agent,
  onOpen,
}: {
  agent: DockAgent;
  onOpen: (agent: DockAgent) => void;
}) {
  const status =
    agent.status === "running"
      ? "running"
      : agent.status === "failed"
        ? "failed"
        : "done";
  const summary = [agent.name, agent.model, agent.detail, status]
    .filter(Boolean)
    .join(", ");
  return (
    <button
      type="button"
      aria-label={`${agent.kind === "agent" ? "Open" : "Show"} ${summary}`}
      title={agent.name}
      data-dock-agent={agent.blockId}
      onClick={() => onOpen(agent)}
      className="group flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1 text-left hover:bg-content/8 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
    >
      <AgentStatusDot status={agent.status} />
      <span className="min-w-0 flex-1 truncate text-[12px] text-content/75 group-hover:text-content">
        {agent.name}
      </span>
      {agent.model ? (
        <span className="max-w-[35%] shrink-0 truncate text-[11px] text-content/40">
          {agent.model}
        </span>
      ) : null}
      {agent.detail ? (
        <span className="shrink-0 text-[11px] text-content/40">
          {agent.detail}
        </span>
      ) : null}
      <AgentClock
        startedAt={agent.startedAt}
        endedAt={agent.endedAt}
        live={agent.status === "running"}
        className="text-[11px] text-content/40"
      />
      <ChevronRight
        className="size-3 shrink-0 text-content/35 group-hover:text-content/60"
        strokeWidth={1.75}
      />
    </button>
  );
}

function AgentStatusDot({ status }: { status: DockAgent["status"] }) {
  if (status === "failed") {
    return <X className="size-3 shrink-0 text-red-400" strokeWidth={2} />;
  }
  return (
    <span
      aria-hidden
      className={`size-1.5 shrink-0 rounded-full ${
        status === "running"
          ? "bg-accent motion-safe:animate-pulse"
          : "bg-emerald-400/70"
      }`}
    />
  );
}
