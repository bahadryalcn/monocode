import { getSyncStatus } from "./syncClient";
import { describe, expect, it, vi } from "vitest";
import {
  collectSyncMachineIds,
  createDebouncer,
  machineSupportsSync,
  recordCapabilityStatus,
  shouldLoadCapabilities,
  UNSUPPORTED_RECHECK_MS,
} from "./useSync";

describe("collectSyncMachineIds", () => {
  it("returns every known machine id", () => {
    const ids = collectSyncMachineIds([
      { id: "m1", name: "A", endpoint: "https://a", environmentId: "e1", ssh: null },
      { id: "m2", name: "B", endpoint: "https://b", environmentId: "e2", ssh: null },
    ]);
    expect(ids).toEqual(["m1", "m2"]);
  });
});

describe("machineSupportsSync", () => {
  it("is true only when the host advertises sync", () => {
    expect(machineSupportsSync(["sessions", "sync"])).toBe(true);
    expect(machineSupportsSync(["sessions"])).toBe(false);
    expect(machineSupportsSync([])).toBe(false);
    expect(machineSupportsSync(undefined)).toBe(false);
  });
});

describe("shouldLoadCapabilities", () => {
  it("loads when unknown, rechecks unsupported after 5 minutes, never rechecks supported", () => {
    expect(shouldLoadCapabilities(undefined, undefined, 0)).toBe(true);
    expect(shouldLoadCapabilities(["sync"], 0, 10 * UNSUPPORTED_RECHECK_MS)).toBe(false);
    expect(shouldLoadCapabilities([], undefined, 0)).toBe(true);
    expect(shouldLoadCapabilities([], 1000, 1000 + UNSUPPORTED_RECHECK_MS - 1)).toBe(false);
    expect(shouldLoadCapabilities(["sessions"], 1000, 1000 + UNSUPPORTED_RECHECK_MS)).toBe(true);
  });
});

describe("createDebouncer", () => {
  it("collapses bursts into one trailing call and can be cancelled", () => {
    vi.useFakeTimers();
    const run = vi.fn();
    const d = createDebouncer(run, 500);
    d.trigger();
    vi.advanceTimersByTime(300);
    d.trigger();
    vi.advanceTimersByTime(499);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledTimes(1);
    d.trigger();
    d.cancel();
    vi.advanceTimersByTime(1000);
    expect(run).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});

describe("recordCapabilityStatus", () => {
  it("marks hosts without sync as unsupported and unreadable ones as unlinked", () => {
    recordCapabilityStatus("cap-old", ["sessions"]);
    expect(getSyncStatus("cap-old").state).toBe("unsupported");
    recordCapabilityStatus("cap-none", undefined);
    expect(getSyncStatus("cap-none").state).toBe("unlinked");
    recordCapabilityStatus("cap-new", ["sync"]);
    expect(getSyncStatus("cap-new").state).toBe("idle");
  });
});
