# Opt-in performance scenarios

No baseline or device acceptance has been run. Collect on installed Windows and Mac WebViews matching the source/package revision. Never paste prompts, attachment content, paths, credentials or session IDs into diagnostic metadata.

The renderer collector lives in `src/shared/lib/performanceTrace.ts`. In a development diagnostic entry point, call `configurePerformanceTracing({ enabled: true, capacity: 2048 })`; use `createPerformanceTraceId()` for one submission and pass that opaque ID to each event/span's third argument. Export `getPerformanceTrace()` as JSON, then disable and clear it. Collection is local, bounded to at most 10,000 records, and has no network transport. Durations use monotonic `performance.now()`; do not subtract host timestamps from renderer timestamps.

Run separate fixtures for 1/10/100 KiB text bursts, 3,000-word prose, long code fences and tables. Compare paced mode with `localStorage.setItem('monocode-low-latency-text','true')` followed by reload; remove the key and reload to restore. Completion shows all text immediately, large bursts skip pacing, and active backlog has a 500ms display cap while RAF runs. Reduced motion also bypasses pacing. Browser background scheduling can exceed that wall-clock cap.

Exercise 20/200/2,000 turns, 1/5/10 simultaneous streams, and 12 parked transcripts. Record long tasks, scripting/paint time and React commits with browser tooling alongside numeric traces. `markdown-render` measures block parsing only, not full Shiki/render/paint cost; `composer-resize` measures the scheduled resize only. Use native Performance profiling for the rest.

For Composer test long paste, IME composition, caret movement, attachment-token deletion and narrow resizing during a stream. Synchronous value/token handling remains; input layout work coalesces to one RAF. Programmatic edits keep their immediate resize behavior.

Use `setPerformanceVisualEffects({ shimmer: false })` and `{ blur: false }` independently for matched screenshots and paint/raster CPU A/B recordings. Restore both to true afterwards; these controls never persist. Manual appearance/reduced-motion acceptance remains required.

For each fixture report sample count, p50/p95/p99/max, device/OS/WebView, source revision, installed version and controlled RTT. Separate provider time from application preparation and display lag. Verify queue/steer/edit-last-turn/stop/reconnect and actual auto-answer deadlines independently: presentation visibility only suppresses display refresh timers. Agree budgets after collecting baseline.
