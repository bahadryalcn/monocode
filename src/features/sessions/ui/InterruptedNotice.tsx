import { Pause, Play } from "../../../shared/ui/icons";

/**
 * A turn that was cut off when MonoCode quit, and was not continued on its own:
 * the setting is off, the transcript did not settle whether it ended, or the
 * user had follow-ups queued. Continue is the user's call.
 */
export function InterruptedNotice({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="px-2 text-content/55" data-interrupted-turn>
      <div className="relative z-0 flex h-8 items-center gap-2 rounded-t-[10px] border border-b-0 border-amber-400/25 bg-amber-400/10 px-2 text-[12px]">
        <Pause className="size-3.5 shrink-0 text-amber-400" />
        <span className="shrink-0 text-content/85">Interrupted</span>
        <span className="min-w-0 flex-1 truncate">
          This turn was cut off when MonoCode quit.
        </span>
        <button
          type="button"
          onClick={onContinue}
          className="flex h-6 shrink-0 items-center gap-1.5 rounded-md px-1.5 hover:bg-content/10 hover:text-content"
        >
          <Play className="size-3.5" />
          Continue
        </button>
      </div>
    </div>
  );
}
