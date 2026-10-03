import { expect, it } from "vitest";
import { remoteSessionPollDelay } from "./remotePollingPolicy";

it("slows hidden active tabs and minimized windows while retaining fast foreground updates", () => {
  expect(remoteSessionPollDelay(true, true, false)).toBe(750);
  expect(remoteSessionPollDelay(true, false, false)).toBe(3_000);
  expect(remoteSessionPollDelay(true, true, true)).toBe(5_000);
  expect(remoteSessionPollDelay(false, true, true)).toBe(30_000);
  expect(remoteSessionPollDelay(false, true, false)).toBe(3_000);
  expect(remoteSessionPollDelay(true, false, true, 6)).toBe(30_000);
});
