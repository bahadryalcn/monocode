import { describe, expect, it } from "vitest";
import { hasConflictMarkers, resolveConflictMarkers } from "./conflictMarkers";

const TEXT = [
  "top",
  "<<<<<<< HEAD",
  "mine 1",
  "mine 2",
  "=======",
  "theirs 1",
  ">>>>>>> feature",
  "middle",
  "<<<<<<< HEAD",
  "=======",
  "added",
  ">>>>>>> feature",
  "bottom",
  "",
].join("\n");

describe("resolveConflictMarkers", () => {
  it("keeps the current side", () => {
    expect(resolveConflictMarkers(TEXT, "ours")).toBe(
      "top\nmine 1\nmine 2\nmiddle\nbottom\n",
    );
  });

  it("keeps the incoming side", () => {
    expect(resolveConflictMarkers(TEXT, "theirs")).toBe(
      "top\ntheirs 1\nmiddle\nadded\nbottom\n",
    );
  });

  it("keeps both sides, current first", () => {
    expect(resolveConflictMarkers(TEXT, "both")).toBe(
      "top\nmine 1\nmine 2\ntheirs 1\nmiddle\nadded\nbottom\n",
    );
  });

  it("drops the diff3 base section", () => {
    const diff3 = "<<<<<<< HEAD\nmine\n||||||| base\nold\n=======\ntheirs\n>>>>>>> x\n";
    expect(resolveConflictMarkers(diff3, "both")).toBe("mine\ntheirs\n");
  });

  it("preserves CRLF line endings", () => {
    const crlf = "a\r\n<<<<<<< HEAD\r\nmine\r\n=======\r\ntheirs\r\n>>>>>>> x\r\nb\r\n";
    expect(resolveConflictMarkers(crlf, "theirs")).toBe("a\r\ntheirs\r\nb\r\n");
  });

  it("leaves an unterminated block and plain text untouched", () => {
    const broken = "a\n<<<<<<< HEAD\nmine\n=======\ntheirs\n";
    expect(resolveConflictMarkers(broken, "ours")).toBe(broken);
    expect(resolveConflictMarkers("a\n=======\nb\n", "ours")).toBe("a\n=======\nb\n");
  });
});

describe("hasConflictMarkers", () => {
  it("detects an opening marker", () => {
    expect(hasConflictMarkers(TEXT)).toBe(true);
    expect(hasConflictMarkers(resolveConflictMarkers(TEXT, "both"))).toBe(false);
    expect(hasConflictMarkers("<<<<<<<< eight\n")).toBe(false);
  });
});
