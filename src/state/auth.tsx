// Signing in and out. The token is kept in the keychain; the user record comes from GET /me (cached).
import * as Device from 'expo-device';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, onUnauthorized, setApiToken } from '../api';
import { loadToken, saveToken } from '../lib/storage';
import { clearCache, queryClient, restoreCache } from './queryClient';
import { queue, syncNow } from './sync';

type Status = 'loading' | 'signedOut' | 'signedIn';

interface AuthValue {
  status: Status;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');

  const forget = useCallback(async () => {
    setApiToken(null);
    await saveToken(null);
    await clearCache();
    setStatus('signedOut');
  }, []);

  useEffect(() => {
    onUnauthorized(() => {
      forget();
    });
    (async () => {
      const token = await loadToken();
      setApiToken(token);
      if (token) await restoreCache();
      setStatus(token ? 'signedIn' : 'signedOut');
    })();
  }, [forget]);

  const value = useMemo<AuthValue>(
    () => ({
      status,
      async signIn(email, password) {
        const device = Device.modelName || Device.deviceName || 'Phone';
        const { token, user } = await api.login(email.trim(), password, device);
        setApiToken(token);
        await saveToken(token);
        queryClient.setQueryData(['me'], user);
        setStatus('signedIn');
        syncNow().catch(() => {});
      },
      async signOut() {
        try {
          await api.logout();
        } catch {
          // Signing out works offline too; the token just expires on the server.
        }
        for (const item of queue.snapshot()) await queue.remove(item.id);
        await forget();
      },
      async deleteAccount(password) {
        await api.deleteMe(password);
        for (const item of queue.snapshot()) await queue.remove(item.id);
        await forget();
      },
    }),
    [status, forget],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(AuthContext);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}
