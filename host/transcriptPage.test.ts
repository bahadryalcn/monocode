import { expect, it } from "vitest";
import type { HostSession } from "../src/features/connections/model/protocol";
import { TranscriptPages, transcriptPage } from "./transcriptPage";
const snapshot = (): HostSession => ({ session: { id: "s", blocks: Array.from({ length: 150 }, (_, index) => ({ id: String(index), role: "assistant", text: "x".repeat(350_000) })) }, revision: 1 } as HostSession);
it("opens a bounded tail then reconstructs every block in order", () => {
  const value = snapshot();
  let page = transcriptPage(value);
  let blocks = page.value.session.blocks;
  expect(blocks.length).toBeLessThan(100);
  while (page.before !== undefined) {
    page = transcriptPage(value, page.before, value.revision);
    blocks = [...page.value.session.blocks, ...blocks];
  }
  expect(blocks).toEqual(value.session.blocks);
  expect(() => transcriptPage(value, 5, 2)).toThrow("changed");
});
it("pins history pages while a live revision advances", () => {
  const pages = new TranscriptPages();
  const old = snapshot();
  const first = pages.page(() => old, "s");
  const read = () => ({ ...old, revision: 2, session: { ...old.session, blocks: [] } });
  const previous = pages.page(read, "s", first.before, first.revision);
  expect(previous.revision).toBe(1);
  expect(previous.totalBlocks).toBe(150);
});
