import { useEffect } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  applyWindowDragPreview, clearWindowDragPreview,
} from "../../features/workspace/model/paneDrop";
import type { WindowTabDragHover } from "./windowDragPreview";

export function useWindowDragPreview() {
  useEffect(() => {
    const revisions = new Map<string, number>();
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    let active: string | undefined;
    let disposed = false;
    const listening = getCurrentWebviewWindow().listen<WindowTabDragHover>("window_tab_drag_hover", ({ payload }) => {
      if (disposed || payload.revision <= (revisions.get(payload.sourceWindowLabel) ?? -1)) return;
      revisions.set(payload.sourceWindowLabel, payload.revision);
      const token = `window:${payload.sourceWindowLabel}:${payload.dragId}`;
      if (payload.ended) {
        clearWindowDragPreview(token);
        if (active === token) { clearTimeout(watchdog); active = undefined; }
        return;
      }
      if (typeof payload.x !== "number" || typeof payload.y !== "number") return;
      if (active && active !== token) clearWindowDragPreview(active);
      active = token;
      applyWindowDragPreview(token, payload.x, payload.y);
      clearTimeout(watchdog);
      // Source sends heartbeats while hovering; a crashed source cannot leave an overlay behind.
      watchdog = setTimeout(() => { clearWindowDragPreview(token); active = undefined; }, 1800);
    });
    return () => {
      disposed = true;
      clearTimeout(watchdog);
      if (active) clearWindowDragPreview(active);
      void listening.then((unlisten) => unlisten()).catch(() => {});
    };
  }, []);
}
