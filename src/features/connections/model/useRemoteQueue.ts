import { useCallback, useEffect, useRef, useState } from "react";
import {
  loadStoredQueue,
  setSessionQueue,
} from "../../sessions/data/sessionStore";
import type { Attachment } from "../../sessions/model/session";
import {
  EMPTY_REMOTE_QUEUE,
  editRemoteMessage,
  enqueueRemoteMessage,
  pauseRemoteQueue,
  releaseRemoteQueue,
  removeRemoteMessage,
  reorderRemoteMessages,
  sentRemoteMessage,
  setRemoteEditing,
  type RemoteQueue,
  type RemoteQueueDraft,
} from "./remoteQueue";

/**
 * Queue state for one host conversation, keyed by the host's session id.
 *
 * It is written through to the session store on every change, the same table
 * a local chat's queue uses, and comes back after a restart as "restored" (it
 * waits for Send next, as a local one does). Within one run a remounted pane
 * picks the live queue up again from the module cache instead.
 */
const live = new Map<string, RemoteQueue>();

/** The conversation is gone: its queue goes from memory and from the store. */
export function forgetRemoteQueue(key: string): void {
  live.delete(key);
  void setSessionQueue(key, undefined).catch(() => {});
}

type Entry = { key?: string; queue: RemoteQueue; loaded: boolean };

const initial = (key?: string): Entry => {
  const cached = key ? live.get(key) : undefined;
  return { key, queue: cached ?? EMPTY_REMOTE_QUEUE, loaded: !key || !!cached };
};

export function useRemoteQueue(key: string | undefined) {
  const [entry, setEntry] = useState<Entry>(() => initial(key));
  const written = useRef(new Map<string, RemoteQueue>());
  // Follow the session this pane shows; its own queue is loaded, never shared.
  useEffect(() => {
    const next = initial(key);
    setEntry((current) => (current.key === key ? current : next));
    if (!key || next.loaded) return;
    let disposed = false;
    void loadStoredQueue(key)
      .then((messages) => messages, () => [])
      .then((messages) => {
        if (disposed) return;
        const queue: RemoteQueue =
          messages.length > 0 ? { messages, status: "restored" } : EMPTY_REMOTE_QUEUE;
        // What was saved is what is on disk; nothing to write back yet.
        written.current.set(key, queue);
        if (queue.messages.length > 0) live.set(key, queue);
        setEntry({ key, queue, loaded: true });
      });
    return () => {
      disposed = true;
    };
  }, [key]);

  // Write through, and keep the live copy for a remounted pane.
  useEffect(() => {
    const { key: owner, queue, loaded } = entry;
    if (!owner || !loaded || owner !== key) return;
    if (queue.messages.length > 0) live.set(owner, queue);
    else live.delete(owner);
    const before = written.current.get(owner);
    if (before === queue) return;
    // Nothing queued and nothing ever written: no row to create or clear.
    if (!queue.messages.length && !before?.messages.length) {
      written.current.set(owner, queue);
      return;
    }
    written.current.set(owner, queue);
    void setSessionQueue(
      owner,
      queue.messages.length > 0 ? queue.messages : undefined,
    ).catch(() => {
      // Try again on the next change instead of trusting a write that failed.
      written.current.delete(owner);
    });
  }, [entry, key]);

  const update = useCallback(
    (change: (queue: RemoteQueue) => RemoteQueue) =>
      setEntry((current) =>
        current.loaded ? { ...current, queue: change(current.queue) } : current,
      ),
    [],
  );

  return {
    queue: entry.queue,
    /** False while a saved queue is still being read; messages are not taken until then. */
    loaded: entry.loaded && entry.key === key,
    enqueue: useCallback(
      (message: RemoteQueueDraft) => update((queue) => enqueueRemoteMessage(queue, message)),
      [update],
    ),
    remove: useCallback(
      (id: string) => update((queue) => removeRemoteMessage(queue, id)),
      [update],
    ),
    edit: useCallback(
      (id: string, text: string, attachments: Attachment[]) =>
        update((queue) => editRemoteMessage(queue, id, text, attachments)),
      [update],
    ),
    setEditing: useCallback(
      (id?: string) => update((queue) => setRemoteEditing(queue, id)),
      [update],
    ),
    reorder: useCallback(
      (ids: string[]) => update((queue) => reorderRemoteMessages(queue, ids)),
      [update],
    ),
    release: useCallback(() => update(releaseRemoteQueue), [update]),
    pause: useCallback(() => update(pauseRemoteQueue), [update]),
    sent: useCallback(
      (id: string) => update((queue) => sentRemoteMessage(queue, id)),
      [update],
    ),
  };
}
