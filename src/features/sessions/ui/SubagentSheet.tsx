import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { GlassBackdrop } from "../../../app/shell/GlassBackdrop";
import { CornerDownRight, X } from "../../../shared/ui/icons";
import type { AgentStep, Block } from "../model/session";
import {
  isSubagentBlock,
  subagentModelName,
  subagentName,
  subagentReport,
  subagentStatusLine,
  toolCallState,
} from "../model/transcriptActivity";
import { AgentClock } from "./AgentClock";
import { ActivityPhases, agentStepBlock } from "./AgentTranscript";
import { AgentMarkdown } from "./AgentMarkdown";
import { VIEW_SUBAGENT_EVENT } from "./subagentFocus";

/**
 * Which delegated run's panel is open in a session pane. The pane that owns the
 * block answers `requestViewSubagent`; panes that do not have it ignore it, so
 * one request opens one panel and asking for another agent swaps the content.
 */
export function useSubagentSheet(blocks: Block[], visible: boolean) {
  const [openId, setOpenId] = useState<string | null>(null);
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;
  // Where focus was when the panel opened, so closing puts it back.
  const returnFocus = useRef<HTMLElement | null>(null);

  const open = useCallback((blockId: string) => {
    setOpenId((current) => {
      if (current === null) {
        returnFocus.current =
          document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
      }
      return blockId;
    });
  }, []);

  const close = useCallback(() => {
    setOpenId((current) => {
      if (current === null) return null;
      const target = returnFocus.current;
      returnFocus.current = null;
      // After the panel has gone, so it cannot reclaim focus first.
      queueMicrotask(() => {
        if (target?.isConnected) target.focus({ preventScroll: true });
      });
      return null;
    });
  }, []);

  useEffect(() => {
    if (!visible) return;
    const onView = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      if (typeof id !== "string") return;
      const block = blocksRef.current.find((entry) => entry.id === id);
      if (block && isSubagentBlock(block)) open(id);
    };
    window.addEventListener(VIEW_SUBAGENT_EVENT, onView);
    return () => window.removeEventListener(VIEW_SUBAGENT_EVENT, onView);
  }, [visible, open]);

  const block = openId
    ? blocks.find((entry) => entry.id === openId)
    : undefined;
  // The run vanished (a rewind, a deleted turn): nothing left to show.
  const gone = openId !== null && !block;
  useEffect(() => {
    if (gone) close();
  }, [gone, close]);

  return { block, open, close };
}

const stepBlocks = new WeakMap<AgentStep, Block>();

/** Stable block per step, so an unchanged step does not re-render as it arrives. */
function blockForStep(step: AgentStep): Block {
  let block = stepBlocks.get(step);
  if (!block) {
    block = agentStepBlock(step);
    stepBlocks.set(step, block);
  }
  return block;
}

function runLabel(block: Block, busy: boolean): string {
  const state = toolCallState(block);
  if (state === "rejected") return "Failed";
  if (state === "pending") return busy ? "Running" : "Stopped";
  return "Done";
}

/**
 * One subagent's trail in a sheet over the session pane. It reads the same
 * block the transcript row does, so it fills in live, and renders the steps
 * through the transcript's own rows. There is no composer: subagents cannot be
 * messaged.
 */
export function SubagentSheet({
  block,
  busy,
  visible,
  cwd,
  onClose,
  onShowInTranscript,
  onOpenFile,
  onOpenDiff,
}: {
  block: Block;
  busy: boolean;
  visible: boolean;
  cwd?: string;
  onClose: () => void;
  onShowInTranscript: (blockId: string) => void;
  onOpenFile?: (path: string) => void;
  onOpenDiff?: (path: string) => void;
}) {
  const sheetRef = useRef<HTMLElement>(null);
  const name = subagentName(block);
  const model = subagentModelName(block);
  const run = block.agentRun;
  const state = toolCallState(block);
  const running = busy && state === "pending";
  const steps = run?.steps ?? [];
  const summary = subagentStatusLine(block, steps);

  // Esc closes from anywhere in this pane, as the side-question sheet does.
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!visible || !sheet) return;
    const pane = sheet.closest("[data-session-drop]") ?? sheet.parentElement;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (event.isComposing) return;
      const target = event.target instanceof Node ? event.target : null;
      if (target !== document.body && !(target && pane?.contains(target))) {
        return;
      }
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, onClose]);

  // Focus moves into the panel when it opens; swapping agents leaves it where
  // the reader put it.
  useEffect(() => {
    const sheet = sheetRef.current;
    if (sheet && !sheet.contains(document.activeElement)) sheet.focus();
  }, []);

  return (
    <div
      data-subagent-overlay
      className="subagent-overlay absolute inset-0 z-40"
    >
      <div aria-hidden className="absolute inset-0" onMouseDown={onClose} />
      <section
        ref={sheetRef}
        role="dialog"
        aria-label={`Subagent: ${name}`}
        tabIndex={-1}
        className="subagent-sheet absolute inset-y-0 right-0 isolate w-[min(34rem,94%)] outline-none"
      >
        <GlassBackdrop className="subagent-sheet-glass popover-backdrop" />
        <div className="relative z-[1] flex h-full min-h-0 flex-col font-sans text-sm text-content">
          <header className="flex shrink-0 flex-col gap-1 border-b border-content/8 py-2.5 pr-2 pl-4">
            <div className="flex min-w-0 items-center gap-2">
              <h2
                className="min-w-0 flex-1 truncate text-sm font-medium"
                title={name}
              >
                {name}
              </h2>
              <button
                type="button"
                onClick={() => onShowInTranscript(block.id)}
                title="Scroll to this agent in the transcript"
                className="flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs text-content/55 transition-colors hover:bg-content/8 hover:text-content focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
              >
                <CornerDownRight className="size-3.5" strokeWidth={1.75} />
                Show in transcript
              </button>
              <button
                type="button"
                aria-label="Close agent panel"
                title="Close (Esc)"
                onClick={onClose}
                className="grid size-7 shrink-0 place-items-center rounded-md text-content/45 transition-colors hover:bg-content/8 hover:text-content focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
              >
                <X className="size-4" strokeWidth={1.75} />
              </button>
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-content/45">
              <span
                className={
                  state === "rejected"
                    ? "text-red-400"
                    : running
                      ? "text-accent"
                      : ""
                }
              >
                {runLabel(block, busy)}
              </span>
              {run?.agentType ? <span>{run.agentType}</span> : null}
              {model ? <span title={`Model: ${model}`}>{model}</span> : null}
              {summary && state !== "rejected" ? <span>{summary}</span> : null}
              <AgentClock
                startedAt={run?.startedAt}
                endedAt={run?.endedAt}
                live={running}
              />
            </div>
          </header>
          <SubagentTrail
            key={block.id}
            block={block}
            steps={steps}
            running={running}
            cwd={cwd}
            onOpenFile={onOpenFile}
            onOpenDiff={onOpenDiff}
          />
          <p className="shrink-0 border-t border-content/8 px-4 py-2 text-xs text-content/40">
            Read-only. Subagents cannot be messaged.
          </p>
        </div>
      </section>
    </div>
  );
}

/** Keyed by run, so each agent starts pinned to its newest step. */
function SubagentTrail({
  block,
  steps,
  running,
  cwd,
  onOpenFile,
  onOpenDiff,
}: {
  block: Block;
  steps: AgentStep[];
  running: boolean;
  cwd?: string;
  onOpenFile?: (path: string) => void;
  onOpenDiff?: (path: string) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  // Follow the newest step until the reader scrolls up; scrolling back to the
  // end picks the follow up again.
  const following = useRef(true);
  const blocks = useMemo(() => steps.map(blockForStep), [steps]);
  const report = subagentReport(block);
  const failed = toolCallState(block) === "rejected";

  const pin = useCallback(() => {
    const el = scroller.current;
    if (el && following.current) el.scrollTop = el.scrollHeight;
  }, []);

  useLayoutEffect(pin, [pin, steps, report]);

  useEffect(() => {
    const el = scroller.current;
    const inner = el?.firstElementChild;
    if (!el || !inner) return;
    const onScroll = () => {
      following.current =
        el.scrollHeight - el.scrollTop - el.clientHeight <= 32;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    // Rows grow after they land (a diff opening, a fold), not only on arrival.
    const observer = new ResizeObserver(pin);
    observer.observe(inner);
    return () => {
      el.removeEventListener("scroll", onScroll);
      observer.disconnect();
    };
  }, [pin]);

  return (
    <div
      ref={scroller}
      className="min-h-0 flex-1 overflow-y-auto overscroll-none"
    >
      <div className="flex min-w-0 flex-col gap-2 px-4 py-3">
        {blocks.length === 0 && !report ? (
          <p className="text-xs text-content/45">
            {running
              ? "Waiting for the first step."
              : "This agent did not report any steps."}
          </p>
        ) : null}
        <ActivityPhases
          blocks={blocks}
          cwd={cwd}
          done={!running}
          padded={false}
          onOpenFile={onOpenFile}
          onOpenDiff={onOpenDiff}
        />
        {report ? (
          <div className="py-1">
            {failed ? (
              <pre className="min-w-0 whitespace-pre-wrap break-words font-mono text-[12px] leading-5 text-red-400/80">
                {report}
              </pre>
            ) : (
              <AgentMarkdown text={report} cwd={cwd} onOpenFile={onOpenFile} />
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
