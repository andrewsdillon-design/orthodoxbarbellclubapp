// React Query, set up for bad signal: cached answers are kept on the phone for a week and shown first,
// and the client knows when the phone is offline.
import NetInfo from '@react-native-community/netinfo';
import { dehydrate, focusManager, hydrate, onlineManager, QueryClient } from '@tanstack/react-query';
import { AppState, Platform } from 'react-native';
import { ApiError } from '../api/client';
import { getJson, KEYS, setJson } from '../lib/storage';

const WEEK = 7 * 24 * 3600 * 1000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      networkMode: 'offlineFirst',
      staleTime: 60 * 1000,
      gcTime: WEEK,
      retry: (count, e) => !(e instanceof ApiError && e.status >= 400 && e.status < 500) && count < 2,
    },
    // Mutations always run, so an offline save reaches our code and goes in the queue
    mutations: { networkMode: 'always' },
  },
});

onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((s) => setOnline(s.isConnected !== false && s.isInternetReachable !== false)),
);

if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (status) => focusManager.setFocused(status === 'active'));
}

export async function restoreCache(): Promise<void> {
  const saved = await getJson<unknown>(KEYS.cache);
  if (saved) hydrate(queryClient, saved);
}

/** Save successful answers to the phone (debounced), so the app opens with data even with no signal. */
export function persistCache(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const unsubscribe = queryClient.getQueryCache().subscribe(() => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const state = dehydrate(queryClient, { shouldDehydrateQuery: (q) => q.state.status === 'success' });
      setJson(KEYS.cache, state).catch(() => {});
    }, 1500);
  });
  return () => {
    clearTimeout(timer);
    unsubscribe();
  };
}

export async function clearCache(): Promise<void> {
  queryClient.clear();
  await setJson(KEYS.cache, null);
}
