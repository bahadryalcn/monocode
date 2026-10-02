import { invoke } from "@tauri-apps/api/core";
import type { TurnTailState } from "../../features/sessions/model/turnRecovery";

export type TurnTail = {
  state: TurnTailState;
  /** The final assistant message of a turn that ended. */
  finalText?: string;
};

/** Reads the end of the provider's own transcript (Claude Code or Codex), read-only. */
export function probeTurnTail(input: {
  provider: string;
  providerSessionId: string;
  cwd: string;
  providerAccountId?: string;
}): Promise<TurnTail> {
  return invoke<TurnTail>("probe_turn_tail", {
    provider: input.provider,
    providerSessionId: input.providerSessionId,
    cwd: input.cwd,
    providerAccountId: input.providerAccountId ?? null,
  });
}
