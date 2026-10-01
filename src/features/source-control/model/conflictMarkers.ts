export type ConflictSide = "ours" | "theirs" | "both";

const OURS = /^<{7}( |$)/;
const BASE = /^\|{7}( |$)/;
const SPLIT = /^={7}$/;
const THEIRS = /^>{7}( |$)/;

/** Whether the text still holds git conflict markers. */
export function hasConflictMarkers(text: string): boolean {
  return text.split("\n").some((line) => OURS.test(line.trimEnd()));
}

/**
 * Resolve every conflict block in a file the same way. `both` keeps the
 * current side followed by the incoming one. The diff3 base section is dropped.
 * Text outside the blocks, and an unterminated block, are left as they are.
 */
export function resolveConflictMarkers(text: string, side: ConflictSide): string {
  const out: string[] = [];
  let block: { ours: string[]; theirs: string[]; raw: string[] } | null = null;
  let part: "ours" | "base" | "theirs" = "ours";

  for (const line of text.split("\n")) {
    const marker = line.trimEnd();
    if (!block) {
      if (OURS.test(marker)) {
        block = { ours: [], theirs: [], raw: [line] };
        part = "ours";
      } else out.push(line);
      continue;
    }
    block.raw.push(line);
    if (BASE.test(marker) && part === "ours") part = "base";
    else if (SPLIT.test(marker) && part !== "theirs") part = "theirs";
    else if (THEIRS.test(marker) && part === "theirs") {
      if (side !== "theirs") out.push(...block.ours);
      if (side !== "ours") out.push(...block.theirs);
      block = null;
    } else if (part === "ours") block.ours.push(line);
    else if (part === "theirs") block.theirs.push(line);
  }
  if (block) out.push(...block.raw);
  return out.join("\n");
}
