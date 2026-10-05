import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  getReportedCommands,
  subscribeReportedCommands,
} from "../../../integrations/harness/core/reportedCommands";
import {
  listClaudeCommands,
  type ClaudeCommandEntry,
} from "../../../platform/tauri/fs";
import {
  mergeCliCommands,
  mergeDollarSkills,
  registerCliCommands,
  usesSlashCommands,
  type DiskCommand,
} from "../../skills/model/cliCommands";
import { loadDisabledSkillPaths, type Skill } from "../../skills/model/skills";
import type { HarnessId } from "../model/session";

const DISK_TTL_MS = 30_000;
const disk = new Map<string, { at: number; commands: DiskCommand[] }>();

/**
 * Claude Code's own commands and Codex's `$` skills for the composer menus.
 * Disk discovery is local only; a remote session has just what its CLI reports.
 * The files are read when the composer opens and again when a menu opens after
 * the cache went stale, never on a timer.
 */
export function useCliCommands(input: {
  harness: HarnessId;
  /** Empty for remote sessions: their files are not on this machine. */
  localCwd: string;
  sessionId?: string;
  menuOpen: boolean;
  /** Names that already mean something else: MonoCode commands, file skills. */
  taken: ReadonlySet<string>;
  files: readonly Skill[];
}): { slashCommands: Skill[]; dollarSkills: Skill[] } {
  const { harness, localCwd, sessionId, menuOpen, taken, files } = input;
  const reported = useSyncExternalStore(
    (listener) => subscribeReportedCommands(sessionId, listener),
    () => getReportedCommands(sessionId),
  );
  const [found, setFound] = useState<DiskCommand[]>(
    () => disk.get(localCwd)?.commands ?? [],
  );

  useEffect(() => {
    if (!usesSlashCommands(harness) || !localCwd) {
      setFound([]);
      return;
    }
    const cached = disk.get(localCwd);
    setFound(cached?.commands ?? []);
    if (cached && Date.now() - cached.at < DISK_TTL_MS) return;
    // Opening the composer loads once; opening the menu refreshes a stale list.
    if (!menuOpen && cached) return;
    let live = true;
    listClaudeCommands(localCwd)
      .then((entries: ClaudeCommandEntry[]) => {
        disk.set(localCwd, { at: Date.now(), commands: entries });
        if (live) setFound(entries);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [harness, localCwd, menuOpen]);

  const slashCommands = useMemo(
    () => mergeCliCommands({ harness, reported, disk: found, taken }),
    [harness, reported, found, taken],
  );
  useEffect(
    () => registerCliCommands(harness, slashCommands),
    [harness, slashCommands],
  );
  const dollarSkills = useMemo(
    () =>
      mergeDollarSkills({
        harness,
        reported,
        files,
        disabledPaths: loadDisabledSkillPaths(),
      }),
    [harness, reported, files],
  );
  return { slashCommands, dollarSkills };
}
