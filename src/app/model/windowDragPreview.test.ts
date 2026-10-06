// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { beginWindowTabDrag } from "./windowDragPreview";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockResolvedValue(undefined) }));
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

describe("native drag preview source", () => {
  it("refreshes stationary hover and ends with a newer tombstone than in-flight moves", async () => {
    vi.useFakeTimers();
    const drag = beginWindowTabDrag("session-a");
    drag.move({ clientX: -200, clientY: 120 });
    await Promise.resolve(); await Promise.resolve();
    await vi.advanceTimersByTimeAsync(350);
    const hoverCalls = vi.mocked(invoke).mock.calls.filter(([command]) => command === "preview_window_tab_drag");
    expect(hoverCalls.length).toBeGreaterThanOrEqual(2);
    drag.finish();
    const [command, clear] = vi.mocked(invoke).mock.calls.at(-1)!;
    expect(command).toBe("clear_window_tab_drag");
    expect((clear as any).revision).toBeGreaterThan((hoverCalls.at(-1)![1] as any).revision);
    const count = vi.mocked(invoke).mock.calls.length;
    drag.move({ clientX: -100, clientY: 100 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(vi.mocked(invoke).mock.calls).toHaveLength(count);
    const next = beginWindowTabDrag("session-b");
    next.move({ clientX: -20, clientY: 30 });
    expect((vi.mocked(invoke).mock.calls.at(-1)![1] as any).revision).toBeGreaterThan((clear as any).revision);
    next.finish();
  });
});
