// Choose (or change) the program and add-ons, where to start, and the maxes. Programs are whatever
// GET /programs lists; nothing here knows any program by name.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Platform, Pressable, View } from 'react-native';
import { api, errorMessage } from '../api';
import type { ProgramSummary } from '../api/types';
import { Button, Card, Chip, Display, ErrorBox, Field, Loading, Row, Screen, T } from '../components/ui';
import { isoDate, isValidIsoDate } from '../lib/dates';
import { fmtNum, parseWeight, toUnits } from '../lib/units';
import { useEnrollment, useMe, usePrograms, useUnits } from '../state/queries';
import { useTheme } from '../theme';

export default function Enroll() {
  const { c } = useTheme();
  const qc = useQueryClient();
  const programs = usePrograms();
  const current = useEnrollment().data ?? null;
  const me = useMe().data;
  const units = useUnits();

  const [slug, setSlug] = useState<string | null>(current?.program.slug ?? null);
  const [addons, setAddons] = useState<string[]>(current?.addons.map((a) => a.slug) ?? []);
  const [baseline, setBaseline] = useState(false);
  const [startWeek, setStartWeek] = useState('1');
  const [startDate, setStartDate] = useState(isoDate());
  const [maxes, setMaxes] = useState<Record<string, string>>({});
  const [club, setClub] = useState<string | undefined>(current?.club ?? undefined);
  const [problems, setProblems] = useState<string[]>([]);

  const program: ProgramSummary | undefined = programs.data?.programs.find((p) => p.slug === slug);
  const hasBaseline = !!program?.phases.some(([, weeks]) => weeks.includes(0));

  // Carry over the maxes we already know when a program is picked
  useEffect(() => {
    if (!program) return;
    setMaxes((m) => {
      const next: Record<string, string> = {};
      for (const l of program.main_lifts) {
        const known = current?.maxes_kg[l];
        next[l] = m[l] ?? (known != null ? fmtNum(toUnits(known, units)) : '');
      }
      return next;
    });
  }, [program, current, units]);

  const enroll = useMutation({
    mutationFn: api.enroll,
    onSuccess: async (data) => {
      qc.setQueryData(['enrollment'], data);
      await qc.invalidateQueries();
      router.back();
    },
    onError: (e) => setProblems([errorMessage(e)]),
  });

  const sorted = useMemo(
    () => [...(programs.data?.programs ?? [])].sort((a, b) => a.days_per_week - b.days_per_week || a.name.localeCompare(b.name)),
    [programs.data],
  );

  function submit() {
    if (!program) return setProblems(['Choose a program.']);
    const errs: string[] = [];
    const week = baseline ? 0 : parseInt(startWeek, 10);
    if (!Number.isInteger(week) || week < 0 || week > program.weeks) errs.push(`Start week is 0 to ${program.weeks}.`);
    if (!isValidIsoDate(startDate)) errs.push('Enter the start date as YYYY-MM-DD.');
    const maxes_kg: Record<string, number> = {};
    for (const [lift, text] of Object.entries(maxes)) {
      try {
        const kg = parseWeight(text, units);
        if (kg) maxes_kg[lift] = kg;
      } catch {
        errs.push(`Check the ${lift} max.`);
      }
    }
    if (!Object.keys(maxes_kg).length && week !== 0) errs.push('Enter your maxes, or start with the baseline test week.');
    setProblems(errs);
    if (errs.length) return;
    const go = () =>
      enroll.mutate({ program: program.slug, start_week: week, start_date: startDate, addons, maxes_kg, ...(club ? { club } : {}) });
    if (current && Platform.OS !== 'web') {
      Alert.alert('Start this program?', `This replaces ${current.program.name}. Your logged workouts stay in your history.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Start', onPress: go },
      ]);
    } else go();
  }

  if (programs.isPending) return <Loading label="Loading programs…" />;
  if (programs.isError)
    return (
      <Screen>
        <ErrorBox error={programs.error} onRetry={programs.refetch} />
      </Screen>
    );

  return (
    <Screen>
      <T muted size={13}>Programs are published on RuskiMaxxing and show up here automatically.</T>
      {sorted.map((p) => {
        const on = p.slug === slug;
        return (
          <Pressable key={p.slug} onPress={() => setSlug(p.slug)} accessibilityRole="radio" accessibilityState={{ selected: on }}>
            <Card accent={on ? c.accent : undefined} style={on ? { borderWidth: 2.5 } : undefined}>
              <T muted size={12}>{`${p.level} · ${p.days_per_week} days a week · ${p.weeks} weeks`.toUpperCase()}</T>
              <Display size={18} style={{ marginVertical: 3 }}>{p.name}</Display>
              <T size={14} muted numberOfLines={on ? undefined : 2}>{p.description}</T>
              {on ? <T size={13} style={{ marginTop: 6 }}>Main lifts: {p.main_lifts.join(', ')}</T> : null}
            </Card>
          </Pressable>
        );
      })}

      {programs.data.addons.length ? (
        <Card title="Add-ons">
          {programs.data.addons.map((a) => {
            const on = addons.includes(a.slug);
            return (
              <Pressable
                key={a.slug}
                onPress={() => setAddons((x) => (on ? x.filter((y) => y !== a.slug) : [...x, a.slug]))}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                style={{ marginBottom: 8 }}
              >
                <Row>
                  <T size={20} style={{ color: c.accent }}>{on ? '☑' : '☐'}</T>
                  <View style={{ flex: 1 }}>
                    <T bold>{a.name}</T>
                    <T size={13} muted>{a.description}</T>
                  </View>
                </Row>
              </Pressable>
            );
          })}
        </Card>
      ) : null}

      {program ? (
        <Card title="Start">
          {hasBaseline ? (
            <Row style={{ marginBottom: 10, flexWrap: 'wrap' }}>
              <Chip label="I know my maxes" on={!baseline} onPress={() => setBaseline(false)} />
              <Chip label="Start with the test week" on={baseline} onPress={() => setBaseline(true)} />
            </Row>
          ) : null}
          {!baseline ? (
            <Field label={`Start at week (0–${program.weeks})`} value={startWeek} onChangeText={setStartWeek} keyboardType="number-pad" />
          ) : (
            <T size={13} muted style={{ marginBottom: 10 }}>Week 0 finds your maxes. Maxes are optional.</T>
          )}
          <Field label="Start date" value={startDate} onChangeText={setStartDate} placeholder="YYYY-MM-DD" autoCapitalize="none" />
          <T bold style={{ marginTop: 4, marginBottom: 6 }}>Training maxes ({units})</T>
          {program.main_lifts.map((l) => (
            <Row key={l} style={{ marginBottom: 6 }}>
              <T style={{ flex: 1 }}>{l}</T>
              <Field
                value={maxes[l] ?? ''}
                onChangeText={(v) => setMaxes((m) => ({ ...m, [l]: v }))}
                keyboardType="decimal-pad"
                placeholder="–"
                style={{ width: 110, marginBottom: 0 }}
                inputStyle={{ textAlign: 'right' }}
                accessibilityLabel={`${l} max in ${units}`}
              />
            </Row>
          ))}
          {me?.clubs.length ? (
            <>
              <T bold style={{ marginTop: 8, marginBottom: 6 }}>Train with a club (optional)</T>
              <Row style={{ flexWrap: 'wrap' }}>
                <Chip label="On my own" on={!club} onPress={() => setClub(undefined)} />
                {me.clubs.map((cl) => (
                  <Chip key={cl.slug} label={cl.name} on={club === cl.slug} onPress={() => setClub(cl.slug)} />
                ))}
              </Row>
            </>
          ) : null}
          {problems.map((p) => (
            <T key={p} style={{ color: c.danger, marginTop: 6 }}>{p}</T>
          ))}
          <Button title={current ? 'Switch to this program' : 'Start this program'} onPress={submit} busy={enroll.isPending} style={{ marginTop: 12 }} />
        </Card>
      ) : null}
    </Screen>
  );
}
