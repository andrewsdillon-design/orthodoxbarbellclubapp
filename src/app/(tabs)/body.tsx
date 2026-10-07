import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, Platform, Pressable } from 'react-native';
import { api, errorMessage } from '../../api';
import type { BodyFatEntry, BodyWeightEntry, Units } from '../../api/types';
import { LineChart } from '../../components/LineChart';
import { Button, Card, Chip, ErrorBox, Field, Loading, Row, Screen, Stat, T } from '../../components/ui';
import { daysBetween, fmtDate, isoDate, isValidIsoDate, parseIsoDate } from '../../lib/dates';
import { fmtNum, fmtWeight, leanMass, parseWeight, toUnits } from '../../lib/units';
import { keys, useBodyfat, useBodyweight, useUnits } from '../../state/queries';
import { useTheme } from '../../theme';

function confirm(title: string, onYes: () => void) {
  if (Platform.OS === 'web') return onYes();
  Alert.alert(title, undefined, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: onYes },
  ]);
}

export default function BodyTab() {
  const bw = useBodyweight();
  const bf = useBodyfat();
  const units = useUnits();
  if (bw.isPending || bf.isPending) return <Loading />;
  return (
    <Screen refreshing={bw.isRefetching || bf.isRefetching} onRefresh={() => { bw.refetch(); bf.refetch(); }}>
      {bw.isError ? <ErrorBox error={bw.error} onRetry={bw.refetch} /> : <BodyWeight entries={bw.data.entries} units={units} />}
      {bf.isError ? (
        <ErrorBox error={bf.error} onRetry={bf.refetch} />
      ) : (
        <BodyFat entries={bf.data.entries} methods={bf.data.methods} weights={bw.data?.entries ?? []} units={units} />
      )}
    </Screen>
  );
}

function BodyWeight({ entries, units }: { entries: BodyWeightEntry[]; units: Units }) {
  const { c } = useTheme();
  const qc = useQueryClient();
  const [weight, setWeight] = useState('');
  const [date, setDate] = useState(isoDate());
  const [error, setError] = useState('');
  const refresh = () => {
    qc.invalidateQueries({ queryKey: keys.bodyweight });
    qc.invalidateQueries({ queryKey: keys.me });
  };
  const add = useMutation({
    mutationFn: ({ d, kg }: { d: string; kg: number }) => api.addBodyweight(d, kg),
    onSuccess: () => {
      setWeight('');
      refresh();
    },
    onError: (e) => setError(errorMessage(e)),
  });
  const remove = useMutation({ mutationFn: api.deleteBodyweight, onSuccess: refresh, onError: (e) => setError(errorMessage(e)) });

  function submit() {
    setError('');
    if (!isValidIsoDate(date)) return setError('Enter the date as YYYY-MM-DD.');
    try {
      const kg = parseWeight(weight, units);
      if (!kg) return setError('Enter your body weight.');
      add.mutate({ d: date, kg });
    } catch {
      setError('Check the weight.');
    }
  }

  const latest = entries[0];
  const month = entries.find((e) => latest && daysBetween(e.date, latest.date) >= 28);
  return (
    <Card title="Body weight">
      {latest ? (
        <Row style={{ marginBottom: 10 }}>
          <Stat label={`on ${fmtDate(latest.date, true)}`} value={fmtWeight(latest.weight_kg, units)} />
          {month ? (
            <Stat
              label="over a month"
              value={`${latest.weight_kg >= month.weight_kg ? '+' : '−'}${fmtNum(Math.abs(toUnits(latest.weight_kg - month.weight_kg, units)))} ${units}`}
            />
          ) : null}
        </Row>
      ) : null}
      <LineChart unit={units} points={entries.map((e) => ({ date: e.date, value: toUnits(e.weight_kg, units) }))} />
      <Row style={{ marginTop: 12, alignItems: 'flex-end' }}>
        <Field label={`Weight (${units})`} value={weight} onChangeText={setWeight} keyboardType="decimal-pad" style={{ flex: 1, marginBottom: 0 }} />
        <Field label="Date" value={date} onChangeText={setDate} style={{ flex: 1.2, marginBottom: 0 }} autoCapitalize="none" />
        <Button title="Add" onPress={submit} busy={add.isPending} />
      </Row>
      <T size={12} muted style={{ marginTop: 4 }}>One a day; a second entry the same day replaces the first. Your latest sets your weight class.</T>
      {error ? <T style={{ color: c.danger, marginTop: 6 }}>{error}</T> : null}
      {entries.slice(0, 8).map((e) => (
        <Row key={e.id} style={{ paddingVertical: 5, borderTopWidth: 1, borderTopColor: c.borderSoft, marginTop: 4 }}>
          <T style={{ flex: 1 }}>{fmtDate(e.date)}</T>
          <T bold>{fmtWeight(e.weight_kg, units)}</T>
          <Pressable onPress={() => confirm('Delete this weigh-in?', () => remove.mutate(e.id))} hitSlop={10} accessibilityLabel={`Delete ${fmtDate(e.date)}`}>
            <T style={{ color: c.danger, paddingLeft: 12 }}>✕</T>
          </Pressable>
        </Row>
      ))}
    </Card>
  );
}

function BodyFat({ entries, methods, weights, units }: { entries: BodyFatEntry[]; methods: string[]; weights: BodyWeightEntry[]; units: Units }) {
  const { c } = useTheme();
  const qc = useQueryClient();
  const [percent, setPercent] = useState('');
  const [method, setMethod] = useState(methods[0] ?? '');
  const [weight, setWeight] = useState('');
  const [error, setError] = useState('');
  const refresh = () => qc.invalidateQueries({ queryKey: keys.bodyfat });
  const add = useMutation({
    mutationFn: api.addBodyfat,
    onSuccess: () => {
      setPercent('');
      setWeight('');
      refresh();
    },
    onError: (e) => setError(errorMessage(e)),
  });
  const remove = useMutation({ mutationFn: api.deleteBodyfat, onSuccess: refresh, onError: (e) => setError(errorMessage(e)) });

  /** Lean mass from the entry's own weight, or the nearest weigh-in if it didn't record one. */
  const lean = (e: BodyFatEntry): number | null => {
    if (e.lean_kg != null) return e.lean_kg;
    if (!weights.length) return null;
    const near = [...weights].sort((a, b) => Math.abs(daysBetween(a.date, e.date)) - Math.abs(daysBetween(b.date, e.date)))[0];
    return Math.abs(daysBetween(near.date, e.date)) <= 14 ? leanMass(near.weight_kg, e.percent) : null;
  };

  function submit() {
    setError('');
    const pct = parseFloat(percent.replace(',', '.'));
    if (!Number.isFinite(pct)) return setError('Enter your body-fat percentage.');
    let kg: number | null = null;
    try {
      kg = parseWeight(weight, units);
    } catch {
      return setError('Check the weight.');
    }
    add.mutate({ date: isoDate(), percent: pct, method, ...(kg ? { weight_kg: kg } : {}) });
  }

  const latest = entries[0];
  const due = !latest || daysBetween(latest.date, isoDate()) >= 28;
  return (
    <Card title="Body fat (monthly)">
      {latest ? (
        <Row style={{ marginBottom: 10 }}>
          <Stat label={fmtDate(latest.date, true)} value={`${fmtNum(latest.percent)}%`} />
          <Stat label="lean mass" value={lean(latest) != null ? fmtWeight(lean(latest), units) : '–'} />
        </Row>
      ) : null}
      {entries.length > 1 ? <LineChart unit="%" height={140} points={entries.map((e) => ({ date: e.date, value: e.percent }))} /> : null}
      <T size={13} muted style={{ marginVertical: 8 }}>
        {due ? 'Time for this month’s measurement.' : `Next measurement around ${fmtDate(isoDate(new Date(parseIsoDate(latest.date).getTime() + 30 * 86400000)), true)}.`} Use
        the same method each time so the trend means something.
      </T>
      <Row style={{ flexWrap: 'wrap', marginBottom: 8 }}>
        {methods.map((m) => (
          <Chip key={m} label={m} on={m === method} onPress={() => setMethod(m)} />
        ))}
      </Row>
      <Row style={{ alignItems: 'flex-end' }}>
        <Field label="Body fat %" value={percent} onChangeText={setPercent} keyboardType="decimal-pad" style={{ flex: 1, marginBottom: 0 }} />
        <Field label={`Weight (${units}, optional)`} value={weight} onChangeText={setWeight} keyboardType="decimal-pad" style={{ flex: 1.3, marginBottom: 0 }} />
        <Button title="Add" onPress={submit} busy={add.isPending} />
      </Row>
      {error ? <T style={{ color: c.danger, marginTop: 6 }}>{error}</T> : null}
      {entries.map((e) => {
        const l = lean(e);
        return (
          <Row key={e.id} style={{ paddingVertical: 5, borderTopWidth: 1, borderTopColor: c.borderSoft, marginTop: 4 }}>
            <T style={{ width: 96 }}>{fmtDate(e.date, true)}</T>
            <T bold style={{ width: 54 }}>{fmtNum(e.percent)}%</T>
            <T size={12} muted style={{ flex: 1 }} numberOfLines={1}>
              {e.method}
              {l != null ? ` · lean ${fmtWeight(l, units)}` : ''}
            </T>
            <Pressable onPress={() => confirm('Delete this measurement?', () => remove.mutate(e.id))} hitSlop={10} accessibilityLabel={`Delete ${fmtDate(e.date)}`}>
              <T style={{ color: c.danger, paddingLeft: 12 }}>✕</T>
            </Pressable>
          </Row>
        );
      })}
    </Card>
  );
}
