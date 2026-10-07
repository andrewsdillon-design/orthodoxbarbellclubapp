// The sign-in token lives in the phone's keychain (expo-secure-store). Everything else that should
// survive a restart (cached data, the offline queue, preferences) goes in AsyncStorage.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const TOKEN_KEY = 'obc.token';

// expo-secure-store has no web build; the web preview (used for store screenshots) keeps it in localStorage.
const web = Platform.OS === 'web';

export async function loadToken(): Promise<string | null> {
  try {
    return web ? globalThis.localStorage?.getItem(TOKEN_KEY) ?? null : await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function saveToken(token: string | null): Promise<void> {
  if (web) {
    if (token) globalThis.localStorage?.setItem(TOKEN_KEY, token);
    else globalThis.localStorage?.removeItem(TOKEN_KEY);
    return;
  }
  if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
  else await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export async function getJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function setJson(key: string, value: unknown): Promise<void> {
  if (value === null || value === undefined) await AsyncStorage.removeItem(key);
  else await AsyncStorage.setItem(key, JSON.stringify(value));
}

export const KEYS = {
  queue: 'obc.queue.v1',
  cache: 'obc.cache.v1',
  theme: 'obc.theme',
};
