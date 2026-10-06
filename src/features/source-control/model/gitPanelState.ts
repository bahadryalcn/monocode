import { useCallback, useSyncExternalStore } from "react";

export type AmendTarget = { branch: string | null; head: string | null };

type PanelState = {
  busy: string | null;
  pending: string | null;
  status: string | null;
  message: string;
  generating: boolean;
  amendTarget: AmendTarget | null;
};

function createEntry() {
  return {
    state: {
      busy: null,
      pending: null,
      status: null,
      message: "",
      generating: false,
      amendTarget: null,
    } as PanelState,
    listeners: new Set<() => void>(),
    generateAbort: { current: null as AbortController | null },
    fileActions: {
      current: { tail: Promise.resolve(), size: 0, paths: [] as string[] },
    },
  };
}

// Work and drafts belong to the checkout, not the lifetime of its visible panel.
// Controllers and queues stay in memory; restarting the app never restores a
// loading flag for a process that is no longer running.
const entries = new Map<string, ReturnType<typeof createEntry>>();

export function gitPanelRuntime(cwd: string) {
  let entry = entries.get(cwd);
  if (!entry) {
    entry = createEntry();
    entries.set(cwd, entry);
  }
  return entry;
}

export function useGitPanelState<K extends keyof PanelState>(
  cwd: string,
  key: K,
) {
  const entry = gitPanelRuntime(cwd);
  const subscribe = useCallback(
    (listener: () => void) => {
      entry.listeners.add(listener);
      return () => {
        entry.listeners.delete(listener);
      };
    },
    [entry],
  );
  const snapshot = useCallback(() => entry.state[key], [entry, key]);
  const value = useSyncExternalStore(subscribe, snapshot);
  // Async continuations retain the entry they started with, even if the same
  // component has since switched to another checkout.
  const setValue = useCallback(
    (next: PanelState[K]) => {
      if (Object.is(entry.state[key], next)) return;
      entry.state = { ...entry.state, [key]: next };
      entry.listeners.forEach((listener) => listener());
    },
    [entry, key],
  );
  return [value, setValue] as const;
}

export function resetGitPanelState() {
  for (const entry of entries.values()) entry.generateAbort.current?.abort();
  entries.clear();
}
