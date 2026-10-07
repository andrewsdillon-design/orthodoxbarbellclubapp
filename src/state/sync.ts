// Saving workouts, online or not, and sending the offline queue when signal comes back.
import NetInfo from '@react-native-community/netinfo';
import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { api, isOffline } from '../api';
import type { LogBody, LogResult, Session } from '../api/types';
import { OfflineQueue } from '../lib/offlineQueue';
import { getJson, KEYS, setJson } from '../lib/storage';
import { queryClient } from './queryClient';

export const queue = new OfflineQueue((item) => api.logSession(item.week, item.day_index, item.body), {
  load: () => getJson(KEYS.queue),
  save: (items) => setJson(KEYS.queue, items),
});

export function useQueue() {
  return useSyncExternalStore(queue.subscribe, queue.snapshot, queue.snapshot);
}

export async function syncNow() {
  const r = await queue.flush();
  if (r.sent.length) await queryClient.invalidateQueries();
  return r;
}

export type SaveOutcome = { queued: true } | { queued: false; result: LogResult };

/**
 * Log a session. With no signal it's kept on the phone and sent later. Validation errors still throw.
 * The caller refreshes the cached data once the lifter has seen the results (refreshing first would
 * swap today's session for the next one under them).
 */
export async function saveWorkout(session: Session, body: LogBody): Promise<SaveOutcome> {
  try {
    const result = await api.logSession(session.week, session.day_index, body);
    const stale = queue.pendingFor(session.week, session.day_index);
    if (stale) await queue.remove(stale.id);
    return { queued: false, result };
  } catch (e) {
    if (!isOffline(e)) throw e;
    await queue.add({ week: session.week, day_index: session.day_index, day: session.day, body });
    return { queued: true };
  }
}

/** Flush the queue on start-up, when the phone reconnects, and when the app comes back to the front. */
export function useAutoSync(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    queue.load().then(() => syncNow()).catch(() => {});
    let wasOnline = true;
    const unNet = NetInfo.addEventListener((s) => {
      const online = s.isConnected !== false && s.isInternetReachable !== false;
      if (online && !wasOnline) syncNow().catch(() => {});
      wasOnline = online;
    });
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') syncNow().catch(() => {});
    });
    return () => {
      unNet();
      sub.remove();
    };
  }, [enabled]);
}
