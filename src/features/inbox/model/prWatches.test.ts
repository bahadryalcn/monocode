import { expect, it } from "vitest";
import { parseGithubPrUrl, prWatchReasons, type PrWatchSnapshot } from "./prWatches";
const baseline: PrWatchSnapshot = { headOid: "a", state: "OPEN", failedChecks: ["build"], reviewIds: ["r1"], conflicting: false };
it("recognizes only public GitHub PR URLs without credential or host confusion", () => {
  expect(parseGithubPrUrl("https://github.com/acme/app/pull/42")).toEqual({ repo: "acme/app", number: 42 });
  for (const url of ["https://github.com.evil.com/acme/app/pull/42", "https://user@github.com/acme/app/pull/42", "http://github.com/acme/app/pull/42", "https://github.com/acme/app/issues/42"]) expect(parseGithubPrUrl(url)).toBeNull();
});
it("ignores ordering and closed PRs but reports new checks, reviews and conflicts", () => {
  expect(prWatchReasons(baseline, { ...baseline })).toEqual([]);
  expect(prWatchReasons(baseline, { ...baseline, state: "MERGED", conflicting: true })).toEqual([]);
  expect(prWatchReasons(baseline, { ...baseline, failedChecks: ["build", "lint"], reviewIds: ["r1", "r2"], conflicting: true })).toHaveLength(3);
  expect(prWatchReasons(baseline, { ...baseline, headOid: "b" })).toEqual(["Failing checks: build"]);
});
