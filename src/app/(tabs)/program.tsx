import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ApiError, api, errorMessage } from '../../api';
import type { Enrollment, Units } from '../../api/types';
import { Banner, Button, Card, Display, ErrorBox, Field, GoldRule, Loading, Row, Screen, T, Tag } from '../../components/ui';
import { fmtDate } from '../../lib/dates';
import { fmtNum, parseWeight, toUnits } from '../../lib/units';
import { useEnrollment, useLoggedSessions, useUnits } from '../../state/queries';
import { fonts, useTheme } from '../../theme';

export default function ProgramTab() {
  const enrollment = useEnrollment();
  const units = useUnits();

  if (enrollment.isPending) return <Loading />;
  if (enrollment.isError && !(enrollment.error instanceof ApiError && enrollment.error.status === 404))
    return (
      <Screen>
        <ErrorBox error={enrollment.error} onRetry={enrollment.refetch} />
      </Screen>
    );

  const e = enrollment.data ?? null;
  return (
    <Screen refreshing={enrollment.isRefetching} onRefresh={enrollment.refetch}>
      {e ? (
        <>
          <ProgramCard e={e} />
          <MaxesCard e={e} units={units} />
          <Calendar e={e} />
        </>
      ) : (
        <Card title="No program yet">
          <T style={{ marginBottom: 12 }}>
            Programs come from RuskiMaxxing and new ones appear here as they're published. Pick one to start.
          </T>
          <Button title="Choose a program" onPress={() => router.push('/enroll')} />
        </Card>
      )}
    </Screen>
  );
}

function ProgramCard({ e }: { e: Enrollment }) {
  const { c } = useTheme();
  const p = e.program;
  return (
    <Card>
      <T muted size={12}>{`${p.level} · ${p.days_per_week} days a week · ${p.weeks} weeks`.toUpperCase()}</T>
      <Display size={22} style={{ marginVertical: 4 }}>{p.name}</Display>
      <T size={14} muted>{p.description}</T>
      <GoldRule style={{ marginVertical: 10 }} />
      <T size={14}>Started {fmtDate(e.start_date)} at week {e.start_week}.</T>
      {e.next ? (
        <T size={14}>Next up: week {e.next.week}, day {e.next.day_index + 1}.</T>
      ) : (
        <T size={14}>Every session is logged.</T>
      )}
      {e.addons.length ? (
        <Row style={{ marginTop: 8, flexWrap: 'wrap' }}>
          <T size={13} muted>Add-ons:</T>
          {e.addons.map((a) => (
            <Tag key={a.slug} label={a.name} color={c.kinds.strongman} />
          ))}
        </Row>
      ) : null}
      <Button title="Change program or add-ons" kind="secondary" small style={{ marginTop: 12, alignSelf: 'flex-start' }} onPress={() => router.push('/enroll')} />
    </Card>
  );
}

function MaxesCard({ e, units }: { e: Enrollment; units: Units }) {
  const { c } = useTheme();
  const qc = useQueryClient();
  const lifts = useMemo(() => {
    const names = [...e.program.main_lifts];
    for (const k of Object.keys(e.maxes_kg)) if (!names.includes(k)) names.push(k);
    return names;
  }, [e]);
  const initial = useMemo(
    () => Object.fromEntries(lifts.map((l) => [l, e.maxes_kg[l] != null ? fmtNum(toUnits(e.maxes_kg[l], units)) : ''])),
    [lifts, e, units],
  );
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [error, setError] = useState('');
  useEffect(() => setValues(initial), [initial]);

  const save = useMutation({
    mutationFn: (maxes: Record<string, number>) => api.updateMaxes(maxes),
    onSuccess: (data) => {
      qc.setQueryData(['enrollment'], data);
      qc.invalidateQueries();
    },
    onError: (err) => setError(errorMessage(err)),
  });

  function submit() {
    setError('');
    const out: Record<string, number> = {};
    for (const l of lifts) {
      if (values[l] === initial[l] || !values[l]?.trim()) continue;
      try {
        const kg = parseWeight(values[l], units);
        if (kg) out[l] = kg;
      } catch {
        return setError(`Check the ${l} max.`);
      }
    }
    if (!Object.keys(out).length) return setError('Change a max first.');
    save.mutate(out);
  }

  return (
    <Card title="Training maxes">
      <T size={13} muted style={{ marginBottom: 8 }}>
        Every percentage in the program is worked from these. A test week updates them for you.
      </T>
      {lifts.map((l) => (
        <Row key={l} style={{ marginBottom: 6 }}>
          <T style={{ flex: 1 }} bold>{l}</T>
          <Field
            value={values[l] ?? ''}
            onChangeText={(v) => setValues((s) => ({ ...s, [l]: v }))}
            keyboardType="decimal-pad"
            placeholder="–"
            style={{ width: 110, marginBottom: 0 }}
            inputStyle={{ textAlign: 'right' }}
            accessibilityLabel={`${l} max in ${units}`}
          />
          <T muted style={{ width: 22 }}>{units}</T>
        </Row>
      ))}
      {error ? <T style={{ color: c.danger, marginTop: 6 }}>{error}</T> : null}
      {save.isSuccess && !error ? <Banner tone="good">Maxes saved. Weights are updated.</Banner> : null}
      <Button title="Save maxes" onPress={submit} busy={save.isPending} style={{ marginTop: 10 }} />
    </Card>
  );
}

function Calendar({ e }: { e: Enrollment }) {
  const { c } = useTheme();
  const logged = useLoggedSessions();
  const done = useMemo(() => {
    const program = e.program.name;
    return new Set((logged.data ?? []).filter((w) => w.program === program).map((w) => `${w.week}/${w.day_index}`));
  }, [logged.data, e.program.name]);
  const [open, setOpen] = useState<number | null>(e.next?.week ?? null);
  const days = e.program.days_per_week;

  return (
    <Card title="Phase calendar">
      {e.program.phases.map(([phase, weeks], i) => {
        const test = /test|baseline/i.test(phase);
        return (
          <View key={`${phase}-${i}`} style={{ marginBottom: 10 }}>
            <Row style={{ marginBottom: 6 }}>
              <T bold style={{ color: test ? c.danger : c.accent, fontFamily: fonts.display }}>{phase}</T>
              <T size={12} muted>weeks {weeks[0]}{weeks.length > 1 ? `–${weeks[weeks.length - 1]}` : ''}</T>
            </Row>
            <View style={s.weeks}>
              {weeks.map((w) => {
                const complete = Array.from({ length: days }, (_, d) => done.has(`${w}/${d}`)).every(Boolean);
                const current = e.next?.week === w;
                return (
                  <Pressable
                    key={w}
                    onPress={() => setOpen(open === w ? null : w)}
                    accessibilityLabel={`Week ${w}${complete ? ', done' : ''}${current ? ', current' : ''}`}
                    style={[
                      s.week,
                      {
                        borderColor: current ? c.gold : test ? c.danger : c.borderSoft,
                        borderWidth: current ? 2 : 1,
                        backgroundColor: complete ? c.accent : c.field,
                      },
                    ]}
                  >
                    <T size={13} bold style={{ color: complete ? c.onAccent : c.text }}>{w}</T>
                  </Pressable>
                );
              })}
            </View>
            {open !== null && weeks.includes(open) ? (
              <View style={[s.days, { borderColor: c.borderSoft }]}>
                {Array.from({ length: days }, (_, d) => {
                  const key = `${open}/${d}`;
                  return (
                    <Button
                      key={key}
                      small
                      kind={done.has(key) ? 'primary' : 'secondary'}
                      title={`Day ${d + 1}${done.has(key) ? ' ✓' : ''}`}
                      onPress={() => router.push({ pathname: '/session/[week]/[day]', params: { week: String(open), day: String(d) } })}
                    />
                  );
                })}
              </View>
            ) : null}
          </View>
        );
      })}
    </Card>
  );
}

const s = StyleSheet.create({
  weeks: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  week: { width: 38, height: 34, borderRadius: 5, alignItems: 'center', justifyContent: 'center' },
  days: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8, paddingTop: 8, borderTopWidth: 1 },
});
