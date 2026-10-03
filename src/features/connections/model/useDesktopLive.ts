import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, type MutableRefObject } from "react";
import type { Session } from "../../sessions/model/session";
import {
  DESKTOP_LIVE_MS,
  runDesktopLiveTick,
  supportsDesktopLive,
  type DesktopLiveCommand,
  type DesktopLiveHandlers,
} from "./desktopLive";
import { loadRemoteCapabilities, remoteRequest } from "./connections";
import { isLocalSyncMachine } from "./localSync";
import type { RemoteMachine } from "./protocol";

const MACHINE_RECHECK_MS = 15_000;
// One identity per WebView, stable across StrictMode effect remounts.
const desktopClientId = crypto.randomUUID();

/** Tells the local host this desktop is alive and which sessions are busy or
 * waiting on input, and runs the stop/approve/answer commands watchers sent
 * through it. Plain interval: it must keep ticking while the window is hidden. */
export function useDesktopLive(
  sessionsRef: MutableRefObject<Session[]>,
  handlersRef: MutableRefObject<DesktopLiveHandlers>,
  hostReachable: MutableRefObject<boolean>,
): void {
  const state = useRef({
    unacked: new Set<string>(),
    handled: new Set<string>(),
  });
  useEffect(() => {
    let stopped = false;
    let running = false;
    let machineId: string | undefined;
    let checkedAt = 0;
    const { unacked, handled } = state.current;

    const tick = async () => {
      if (running || !hostReachable.current) return;
      running = true;
      try {
        if (!machineId || Date.now() - checkedAt > MACHINE_RECHECK_MS) {
          checkedAt = Date.now();
          machineId = undefined;
          const machines = await invoke<RemoteMachine[]>("remote_machines");
          const machine = (Array.isArray(machines) ? machines : []).find(isLocalSyncMachine);
          if (!machine || stopped) return;
          const capabilities = await loadRemoteCapabilities(machine.environmentId);
          if (!supportsDesktopLive(capabilities) || stopped) return;
          machineId = machine.id;
        }
        const id = machineId;
        await runDesktopLiveTick({
          clientId: desktopClientId,
          request: (payload) =>
            remoteRequest<{ commands?: DesktopLiveCommand[] }>(id, "sessions.desktopLive", payload),
          sessions: () => sessionsRef.current,
          handlers: {
            stop: (sessionId) => handlersRef.current.stop(sessionId),
            approve: (...args) => handlersRef.current.approve(...args),
            answer: (...args) => handlersRef.current.answer(...args),
          },
          unacked,
          handled,
        });
      } catch {
        machineId = undefined; // Host unreachable; the next tick looks again.
      } finally {
        running = false;
      }
    };
    const timer = window.setInterval(() => void tick(), DESKTOP_LIVE_MS);
    void tick();
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [sessionsRef, handlersRef, hostReachable]);
}
