# Flexible layout, narrower sidebars, pop-out windows

Date: 2026-10-03

## Goal

1. The left columns (project rail + sessions sidebar) can shrink much further.
2. Several sessions/files can be seen at once, arranged either by an
   auto-layout preset or by hand (drag), inside one tab.
3. A tab (session or file) can be pulled out into its own OS window, like
   VS Code, so it can live on another monitor.

## What already exists (reuse, don't rebuild)

- `src/features/workspace/model/layout.ts`: per-tab split tree (`LayoutNode`)
  with `splitPane`, `movePane`, `placePane`, `placeLayout`, sashes, drag
  edges. Session cards and title-bar tabs can already be dropped on pane edges
  (`onPlaceTabOnPane`). Cmd-D / Shift-Cmd-D split.
- `src/app/model/windowTransfer.ts` + `stage_window_transfer` /
  `take_window_transfer` (Rust) + `loadWindowTransfer` boot path: a new
  window can be seeded with tabs + sessions. The UI that used it
  (`onGroupMoveToNewWindow`) was removed in `d730a6c7`; `TabGroupMenu` still
  lists a `new-window` item.
- Harness events are emitted app-wide, so a session can move windows.

## Work packages

### A. Narrower sidebars (ProjectRail.tsx, Sidebar.tsx, appearance.ts)
- Project rail min 180 → 56. Below ~140px it switches to a compact,
  icon-only presentation (labels hidden, tooltips via `title`).
- Sessions sidebar min 260 → 180; width persisted in localStorage.
- Content must truncate cleanly at the new minimum.

### B. Auto layout presets (layout.ts + UI)
- Pure `arrangeLayout(node, preset)` with presets: `columns`, `rows`,
  `grid`, `main-left` (one large pane + stacked rest), `equalize`.
- A "Layout" menu (title bar + pane context) and command-palette entries
  apply a preset to the active tab.
- Sidebar multi-select "Open side by side" opens the selected sessions as
  a grid in one tab.

### C. Pop-out windows
- Restore move-to-new-window for a single tab and for a tab group
  (title-bar tab context menu "Move to New Window", `TabGroupMenu`
  `new-window`).
- File tabs: "Open in New Window" in the surface tab menu.
- Dragging a title-bar tab outside the window bounds pops it out at the
  drop point (Rust `open_new_window` optionally takes a position).

## Verification
- `npx vitest run` for touched areas, `npx tsc --noEmit`,
  `cargo check` for Rust changes.
