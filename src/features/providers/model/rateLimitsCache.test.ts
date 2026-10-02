import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  errorRateLimits,
  idleRateLimits,
  type ProviderRateLimits,
} from "./rateLimits";
import { fetchClaudeRateLimits } from "./rateLimitsFetch";
import {
  clearCachedRateLimits,
  getCachedRateLimits,
  loadFreshRateLimits,
  loadRateLimits,
} from "./rateLimitsCache";

vi.mock("./rateLimitsFetch", () => ({
  fetchClaudeRateLimits: vi.fn(),
  fetchCodexRateLimits: vi.fn(),
  fetchOpencodeGoRateLimits: vi.fn(),
}));

const fetchClaude = vi.mocked(fetchClaudeRateLimits);

function usage(usedPercent: number): ProviderRateLimits {
  return {
    ...idleRateLimits("claude"),
    session: { usedPercent, windowMinutes: 300, resetsAt: null },
    updatedAt: Date.now(),
    status: "ok",
  };
}

const rateLimited = () =>
  errorRateLimits("claude", "Claude usage request failed (429)");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
  fetchClaude.mockReset();
  clearCachedRateLimits();
});

afterEach(() => {
  clearCachedRateLimits();
  vi.useRealTimers();
});

it("keeps the last usage, with its own age, when a refresh is rate limited", async () => {
  fetchClaude.mockResolvedValueOnce(usage(40));
  await loadRateLimits("claude");
  vi.setSystemTime(1_000_000 + 8 * 60_000);
  fetchClaude.mockResolvedValueOnce(rateLimited());

  const result = await loadRateLimits("claude", "default", true);

  expect(result).toMatchObject({
    status: "error",
    error: "Claude usage request failed (429)",
    session: { usedPercent: 40 },
    updatedAt: 1_000_000,
  });
  expect(getCachedRateLimits("claude")).toBe(result);
});

it("tries again by itself after a failed read, and stops once it works", async () => {
  fetchClaude.mockResolvedValueOnce(rateLimited());
  await loadRateLimits("claude");
  expect(getCachedRateLimits("claude").status).toBe("error");

  fetchClaude.mockResolvedValueOnce(usage(12));
  await vi.advanceTimersByTimeAsync(60_000);
  expect(getCachedRateLimits("claude")).toMatchObject({
    status: "ok",
    session: { usedPercent: 12 },
  });

  await vi.advanceTimersByTimeAsync(60 * 60_000);
  expect(fetchClaude).toHaveBeenCalledTimes(2);
});

it("shares a recent read instead of asking the provider again", async () => {
  fetchClaude.mockResolvedValue(usage(70));
  await loadRateLimits("claude");

  await loadFreshRateLimits("claude", "default", 60_000);
  expect(fetchClaude).toHaveBeenCalledTimes(1);

  vi.setSystemTime(1_000_000 + 61_000);
  await loadFreshRateLimits("claude", "default", 60_000);
  expect(fetchClaude).toHaveBeenCalledTimes(2);
});
