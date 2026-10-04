import { describe, expect, it } from "vitest";
import {
  sameBlocksIgnoringStreamingText,
  sameLastTurnRecall,
  shallowArrayEqual,
} from "./stableBlocks";
import type { Block } from "./session";

const user: Block = { id: "u1", role: "user", text: "hi" };
const reply: Block = { id: "a1", role: "assistant", text: "He", streaming: true };

describe("sameBlocksIgnoringStreamingText", () => {
  it("ignores new text on the last streamed assistant block", () => {
    expect(
      sameBlocksIgnoringStreamingText(
        [user, reply],
        [user, { ...reply, text: "Hello" }],
      ),
    ).toBe(true);
  });

  it("sees any other change to the last block", () => {
    expect(
      sameBlocksIgnoringStreamingText(
        [user, reply],
        [user, { ...reply, text: "Hello", streaming: false }],
      ),
    ).toBe(false);
  });

  it("sees a changed earlier block, a new block, or a text change on a tool", () => {
    expect(
      sameBlocksIgnoringStreamingText(
        [user, reply],
        [{ ...user }, { ...reply, text: "Hello" }],
      ),
    ).toBe(false);
    expect(
      sameBlocksIgnoringStreamingText([user, reply], [user, reply, user]),
    ).toBe(false);
    const tool: Block = { id: "t1", role: "tool", text: "a" };
    expect(
      sameBlocksIgnoringStreamingText([tool], [{ ...tool, text: "ab" }]),
    ).toBe(false);
  });
});

describe("sameLastTurnRecall / shallowArrayEqual", () => {
  it("compares recall content, not identity", () => {
    const file = { id: "f" } as never;
    expect(
      sameLastTurnRecall(
        { text: "x", attachments: [file] },
        { text: "x", attachments: [file] },
      ),
    ).toBe(true);
    expect(
      sameLastTurnRecall(
        { text: "x", attachments: [] },
        { text: "y", attachments: [] },
      ),
    ).toBe(false);
    expect(sameLastTurnRecall(null, null)).toBe(true);
    expect(sameLastTurnRecall(null, { text: "x", attachments: [] })).toBe(false);
  });

  it("treats equal-content arrays as equal", () => {
    expect(shallowArrayEqual(["a"], ["a"])).toBe(true);
    expect(shallowArrayEqual(["a"], ["b"])).toBe(false);
    expect(shallowArrayEqual(undefined, undefined)).toBe(true);
    expect(shallowArrayEqual(undefined, [])).toBe(false);
  });
});
