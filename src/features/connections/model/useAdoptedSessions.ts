import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, type MutableRefObject } from "react";
import {
  bindHarnessSession,
  isLiveHarness,
} from "../../../integrations/harness/core/registry";
import { sessionWorkCwd, type Session } from "../../sessions/model/session";
import { getSession, upsertSession } from "../../sessions/data/sessionStore";
import {
  ADOPTED_POLL_HIDDEN_MS,
  ADOPTED_POLL_VISIBLE_MS,
  mirrorAdoptedSessions,
  supportsAdoptedSessions,
  type AdoptedEntry,
} from "./adoptedSessions";
import {
  loadRemoteCapabilities,
  loadRemoteSession,
  remoteRequest,
} from "./connections";
import { isLocalSyncMachine } from "./localSync";
import type { RemoteMachine } from "./protocol";

/** Mirrors sessions the local MonoCode Host adopted from this desktop (another
 * computer continued them there) back into the loaded local sessions.
 * Returns whether such a host is reachable: then other computers can watch
 * this desktop's sessions through it. */
export function useAdoptedSessions(
  sessionsRef: MutableRefObject<Session[]>,
  setSessions: (update: (current: Session[]) => Session[]) => void,
): MutableRefObject<boolean> {
  const hostReachable = useRef(false);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let running = false;
    const mirrored = new Map<string, number>();
    const hold = new Set<string>();

    const pass = async () => {
      if (running) return;
      running = true;
      try {
        const machines = await invoke<RemoteMachine[]>("remote_machines");
        const machine = (Array.isArray(machines) ? machines : []).find(isLocalSyncMachine);
        if (!machine || stopped) {
          hostReachable.current = false;
          return;
        }
        const capabilities = await loadRemoteCapabilities(machine.environmentId);
        hostReachable.current = supportsAdoptedSessions(capabilities);
        if (!hostReachable.current || stopped) return;
        const held = await mirrorAdoptedSessions({
          list: () => remoteRequest<AdoptedEntry[]>(machine.id, "sessions.adopted", {}),
          load: (sessionId) => loadRemoteSession(machine.id, sessionId),
          local: () => sessionsRef.current,
          mirrored,
          stored: getSession,
          save: async (merged) => {
            await upsertSession(merged);
          },
          apply: (merged, previous) => {
            const swap = (list: Session[]) =>
              list.map((session) => (session.id === merged.id ? merged : session));
            sessionsRef.current = swap(sessionsRef.current);
            setSessions(swap);
            if (
              merged.providerSessionId &&
              merged.providerSessionId !== previous.providerSessionId &&
              !merged.worktreeRemoved &&
              isLiveHarness(merged.harness)
            ) {
              bindHarnessSession(
                merged.harness,
                merged.id,
                merged.providerSessionId,
                sessionWorkCwd(merged),
                merged.providerAccountId,
                merged.blocks,
              );
            }
          },
        });
        // Clear the hold on sessions the host finished without a new revision.
        const stale = [...hold].filter((id) => !held.has(id));
        hold.clear();
        for (const id of held) hold.add(id);
        if (stale.length > 0) {
          const release = (list: Session[]) =>
            list.map((session) =>
              stale.includes(session.id) && session.continuingElsewhere
                ? { ...session, continuingElsewhere: undefined }
                : session,
            );
          sessionsRef.current = release(sessionsRef.current);
          setSessions(release);
        }
      } catch {
        hostReachable.current = false;
        // Host unreachable or too old; the next pass tries again.
      } finally {
        running = false;
      }
    };

    const schedule = () => {
      if (stopped) return;
      timer = setTimeout(
        () => {
          void pass().finally(schedule);
        },
        document.visibilityState === "hidden"
          ? ADOPTED_POLL_HIDDEN_MS
          : ADOPTED_POLL_VISIBLE_MS,
      );
    };
    const onFocus = () => {
      void pass();
    };
    window.addEventListener("focus", onFocus);
    void pass().finally(schedule);
    return () => {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [sessionsRef, setSessions]);
  return hostReachable;
}
