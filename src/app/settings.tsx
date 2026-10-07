import { useMutation, useQueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, Platform } from 'react-native';
import { api, errorMessage } from '../api';
import type { Units } from '../api/types';
import { Banner, Button, Card, Field, Loading, Row, Screen, Segmented, T, Tag } from '../components/ui';
import { API_MODE, LINKS } from '../config';
import { fmtDate } from '../lib/dates';
import { fmtWeight } from '../lib/units';
import { useAuth } from '../state/auth';
import { keys, useMaxes, useMe } from '../state/queries';
import { queue, syncNow, useQueue } from '../state/sync';
import { useTheme, type ThemePref } from '../theme';

const LIFT_NAMES: Record<string, string> = { squat: 'Squat', bench: 'Bench Press', deadlift: 'Deadlift' };

function ask(title: string, message: string, yes: string, onYes: () => void) {
  if (Platform.OS === 'web') return onYes();
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: yes, style: 'destructive', onPress: onYes },
  ]);
}

export default function Settings() {
  const { c, pref, setPref } = useTheme();
  const me = useMe();
  const maxes = useMaxes();
  const qc = useQueryClient();
  const { signOut, deleteAccount } = useAuth();
  const pending = useQueue();
  const [syncing, setSyncing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const units = useMutation({
    mutationFn: (u: Units) => api.updateMe({ units: u }),
    onSuccess: (user) => {
      qc.setQueryData(keys.me, user);
      qc.invalidateQueries();
    },
    onError: (e) => setError(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: () => deleteAccount(password),
    onError: (e) => setError(errorMessage(e)),
  });

  if (me.isPending) return <Loading />;
  const user = me.data;
  const u = user?.units ?? 'lb';

  return (
    <Screen>
      {user ? (
        <Card title="Account">
          <T bold>{user.name}</T>
          <T muted>{user.email}</T>
          {user.bodyweight_kg ? <T size={13} muted>Body weight {fmtWeight(user.bodyweight_kg, u)}</T> : null}
        </Card>
      ) : null}

      {user?.is_staff ? (
        <Card title="Admin">
          <T size={14} muted style={{ marginBottom: 8 }}>Club applications, lifts waiting, and every club you oversee.</T>
          <Button title="Open admin" onPress={() => router.push('/admin')} />
        </Card>
      ) : null}

      <Card title="Units">
        <Segmented
          value={units.isPending ? (units.variables as Units) : u}
          onChange={(v) => v !== u && units.mutate(v)}
          options={[
            { value: 'lb', label: 'Pounds (lb)' },
            { value: 'kg', label: 'Kilograms (kg)' },
          ]}
        />
        <T size={12} muted style={{ marginTop: 6 }}>Saved to your account, so the website matches.</T>
      </Card>

      <Card title="Appearance">
        <Segmented<ThemePref>
          value={pref}
          onChange={setPref}
          options={[
            { value: 'system', label: 'Automatic' },
            { value: 'light', label: 'Parchment' },
            { value: 'dark', label: 'Night' },
          ]}
        />
      </Card>

      <Card title="Offline saves">
        {pending.length ? (
          <>
            {pending.map((p) => (
              <Row key={p.id} style={{ marginBottom: 6 }}>
                <T style={{ flex: 1 }} size={14}>
                  Week {p.week} · {p.day} ({fmtDate(p.body.performed_on, true)})
                  {p.error ? `\n${p.error}` : ''}
                </T>
                {p.error ? (
                  <Button small kind="danger" title="Discard" onPress={() => ask('Discard this workout?', 'It was never saved to your account.', 'Discard', () => queue.remove(p.id))} />
                ) : (
                  <Tag label="waiting" color={c.gold} />
                )}
              </Row>
            ))}
            <Button
              title="Sync now"
              busy={syncing}
              onPress={async () => {
                setSyncing(true);
                await syncNow().catch(() => {});
                setSyncing(false);
              }}
            />
          </>
        ) : (
          <T muted>Everything is synced. Workouts saved without signal wait here until you're back online.</T>
        )}
      </Card>

      <Card title="Leaderboard submissions">
        {maxes.data?.results.length ? (
          maxes.data.results.map((r) => (
            <Row key={r.id} style={{ marginBottom: 6 }}>
              <T style={{ flex: 1 }} size={14}>
                {LIFT_NAMES[r.lift] ?? r.lift} {fmtWeight(r.weight_kg, u)} · {fmtDate(r.performed_on, true)}
              </T>
              <Tag label={r.status} color={r.status === 'verified' ? c.success : r.status === 'rejected' ? c.danger : c.gold} />
            </Row>
          ))
        ) : (
          <T muted>None yet. Film a max in a test week and submit it.</T>
        )}
        <Button title="Submit a max" kind="secondary" small style={{ marginTop: 8, alignSelf: 'flex-start' }} onPress={() => router.push('/submit-max')} />
      </Card>

      <Card title="Help">
        <Button title="Website" kind="ghost" small style={{ alignSelf: 'flex-start' }} onPress={() => Linking.openURL(LINKS.site)} />
        <Button title="Support" kind="ghost" small style={{ alignSelf: 'flex-start' }} onPress={() => Linking.openURL(LINKS.support)} />
        <Button title="Privacy policy" kind="ghost" small style={{ alignSelf: 'flex-start' }} onPress={() => Linking.openURL(LINKS.privacy)} />
      </Card>

      {error ? <Banner tone="warn">{error}</Banner> : null}

      <Button
        title="Sign out"
        kind="secondary"
        onPress={() =>
          pending.length
            ? ask('Sign out?', `${pending.length} workout(s) haven't synced yet and will be lost.`, 'Sign out', signOut)
            : signOut()
        }
      />

      <Card title="Delete account" accent={c.danger}>
        {!deleting ? (
          <>
            <T size={14} muted style={{ marginBottom: 10 }}>
              Deletes your OBC account and every workout, max and measurement, on the website too. This can't be undone.
            </T>
            <Button title="Delete my account" kind="danger" onPress={() => setDeleting(true)} />
          </>
        ) : (
          <>
            <Field label="Enter your password to confirm" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" />
            <Row>
              <Button title="Cancel" kind="secondary" style={{ flex: 1 }} onPress={() => setDeleting(false)} />
              <Button
                title="Delete forever"
                kind="danger"
                style={{ flex: 1 }}
                busy={remove.isPending}
                disabled={!password}
                onPress={() => ask('Delete your account?', 'Everything goes, for good.', 'Delete', () => remove.mutate())}
              />
            </Row>
          </>
        )}
      </Card>

      <T size={12} muted style={{ textAlign: 'center' }}>
        Orthodox Barbell Club {Constants.expoConfig?.version ?? ''}
        {API_MODE === 'mock' ? ' · demo data' : ''}
      </T>
    </Screen>
  );
}
