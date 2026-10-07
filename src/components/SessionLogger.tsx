// A session's exercises with fast set logging, the rest timer, and the save + results flow.
import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { errorMessage } from '../api';
import type { LogResult, Session, SessionExercise, Units } from '../api/types';
import { siteUrl } from '../config';
import { fmtDate, isoDate, isValidIsoDate } from '../lib/dates';
import {
  buildLogBody,
  fillPrescribed,
  FormProblems,
  initForm,
  prescribedFor,
  type SessionFormState,
  type SetInput,
} from '../lib/sessionForm';
import { fmtWeight } from '../lib/units';
import { queryClient } from '../state/queryClient';
import { saveWorkout, useQueue } from '../state/sync';
import { fonts, useTheme } from '../theme';
import { RestTimer } from './RestTimer';
import { Banner, Button, Card, Display, Field, GoldRule, KindTag, Row, Screen, T, Tag } from './ui';

const LIFT_NAMES = { squat: 'Squat', bench: 'Bench Press', deadlift: 'Deadlift' };

export function SessionLogger({
  session,
  units,
  refreshing,
  onRefresh,
}: {
  session: Session;
  units: Units;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  const { c } = useTheme();
  const pending = useQueue().find((q) => q.week === session.week && q.day_index === session.day_index);
  const [form, setForm] = useState<SessionFormState>(() => initForm(session, units, pending?.body));
  const [date, setDate] = useState(pending?.body.performed_on ?? session.performed_on ?? isoDate());
  const [notes, setNotes] = useState(pending?.body.notes ?? session.notes ?? '');
  const [problems, setProblems] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<LogResult | 'queued' | null>(null);

  const setBox = (i: number, n: number, field: keyof SetInput, value: string) =>
    setForm((f) => f.map((sets, a) => (a !== i ? sets : sets.map((s, b) => (b !== n ? s : { ...s, [field]: value })))));

  async function save() {
    setProblems([]);
    if (!isValidIsoDate(date)) return setProblems(['Enter the date as YYYY-MM-DD.']);
    let body;
    try {
      body = buildLogBody(form, session, units, date, notes);
    } catch (e) {
      return setProblems(e instanceof FormProblems ? e.problems : [errorMessage(e)]);
    }
    setBusy(true);
    try {
      const out = await saveWorkout(session, body);
      setResult(out.queued ? 'queued' : out.result);
    } catch (e) {
      setProblems([errorMessage(e)]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <Screen refreshing={refreshing} onRefresh={onRefresh}>
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <T muted size={13}>
              Week {session.week}
              {session.cycle ? ` · Cycle ${session.cycle}` : ''}
            </T>
            {session.phase ? <Tag label={session.phase} color={/test/i.test(session.phase) ? c.danger : c.gold} /> : null}
          </Row>
          <Display size={22} style={{ marginTop: 4 }}>{session.day}</Display>
          {session.logged ? <T muted size={13}>Logged {fmtDate(session.performed_on)}. Saving again replaces it.</T> : null}
          <GoldRule style={{ marginVertical: 10 }} />
          <Button title="Fill all as prescribed" kind="secondary" small onPress={() => setForm((f) => fillPrescribed(f, session, units))} />
        </Card>

        {pending ? (
          <Banner tone={pending.error ? 'warn' : 'info'}>
            {pending.error
              ? `This session couldn't sync: ${pending.error} Fix it and save again.`
              : 'Saved on this phone. It will sync when you have signal.'}
          </Banner>
        ) : null}

        {session.exercises.map((ex, i) => (
          <ExerciseCard
            key={`${ex.index}`}
            ex={ex}
            units={units}
            sets={form[i] ?? []}
            onChange={(n, field, v) => setBox(i, n, field, v)}
            onFill={() => setForm((f) => fillPrescribed(f, session, units, i))}
          />
        ))}

        <Card title="Finish">
          <Field label="Date" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" autoCapitalize="none" />
          <Field label="Notes" value={notes} onChangeText={setNotes} placeholder="How did it go?" multiline inputStyle={{ minHeight: 60 }} />
          {problems.length ? (
            <View style={{ marginBottom: 10 }}>
              {problems.map((p) => (
                <T key={p} style={{ color: c.danger }}>{p}</T>
              ))}
            </View>
          ) : null}
          <Button title={session.logged ? 'Save changes' : 'Save workout'} onPress={save} busy={busy} />
        </Card>
      </Screen>
      <RestTimer />
      <ResultModal
        result={result}
        units={units}
        onClose={() => {
          setResult(null);
          queryClient.invalidateQueries();
        }}
      />
    </View>
  );
}

function ExerciseCard({
  ex,
  units,
  sets,
  onChange,
  onFill,
}: {
  ex: SessionExercise;
  units: Units;
  sets: SetInput[];
  onChange: (n: number, field: keyof SetInput, v: string) => void;
  onFill: () => void;
}) {
  const { c } = useTheme();
  const p = prescribedFor(ex, units);
  const isTest = ex.kind === 'test';
  const target =
    ex.prescribed_kg != null
      ? ` @ ${fmtWeight(ex.prescribed_kg, units)}${ex.percent ? ` (${ex.percent}%)` : ''}`
      : ex.percent
        ? ` @ ${ex.percent}%`
        : '';
  return (
    <Card accent={isTest ? c.danger : undefined}>
      <Row style={{ alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <Display size={17}>{ex.exercise}</Display>
          <T bold style={{ marginTop: 2 }}>
            {ex.sets} × {ex.reps}
            {target}
          </T>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <KindTag kind={ex.kind} />
          {ex.addon ? <Tag label={ex.addon} color={c.muted} /> : null}
        </View>
      </Row>
      {ex.prescribed_kg == null && ex.percent ? (
        <T size={13} style={{ color: c.danger, marginTop: 4 }}>
          Enter your {ex.exercise} max on the Program tab to get a weight.
        </T>
      ) : null}
      {ex.tm_estimated ? <T size={13} muted>Weight from an estimated max.</T> : null}
      {ex.note ? <T size={13} muted style={{ marginTop: 4, fontStyle: 'italic' }}>{ex.note}</T> : null}
      {ex.learn ? (
        <Pressable onPress={() => Linking.openURL(siteUrl(ex.learn as string))} accessibilityRole="link">
          <T size={13} style={{ color: c.accent, marginTop: 4, textDecorationLine: 'underline' }}>How to do it</T>
        </Pressable>
      ) : null}

      <View style={[st.head, { borderBottomColor: c.borderSoft }]}>
        <T size={11} muted style={st.setCol}>SET</T>
        <T size={11} muted style={st.col}>{units.toUpperCase()}</T>
        <T size={11} muted style={st.col}>REPS</T>
        <T size={11} muted style={st.rpeCol}>RPE</T>
      </View>
      {sets.map((s, n) => (
        <View key={n} style={st.row}>
          <T bold style={st.setCol}>{ex.first_set + n}</T>
          <Box value={s.weight} placeholder={p.weight || '–'} onChangeText={(v) => onChange(n, 'weight', v)} decimal label={`${ex.exercise} set ${ex.first_set + n} weight`} />
          <Box value={s.reps} placeholder={p.reps || ex.reps} onChangeText={(v) => onChange(n, 'reps', v)} label={`${ex.exercise} set ${ex.first_set + n} reps`} />
          <Box value={s.rpe} placeholder="–" onChangeText={(v) => onChange(n, 'rpe', v)} decimal small label={`${ex.exercise} set ${ex.first_set + n} RPE`} />
        </View>
      ))}
      {p.weight || p.reps ? <Button title="Fill as prescribed" kind="ghost" small onPress={onFill} style={{ alignSelf: 'flex-start', marginTop: 4 }} /> : null}
    </Card>
  );
}

function Box({
  value,
  placeholder,
  onChangeText,
  decimal,
  small,
  label,
}: {
  value: string;
  placeholder: string;
  onChangeText: (v: string) => void;
  decimal?: boolean;
  small?: boolean;
  label: string;
}) {
  const { c } = useTheme();
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={c.muted}
      keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
      selectTextOnFocus
      accessibilityLabel={label}
      style={[
        small ? st.rpeCol : st.col,
        st.box,
        { backgroundColor: c.field, borderColor: c.borderSoft, color: c.text, fontFamily: fonts.bodySemi },
      ]}
    />
  );
}

function ResultModal({ result, units, onClose }: { result: LogResult | 'queued' | null; units: Units; onClose: () => void }) {
  const { c } = useTheme();
  if (!result) return null;
  const offer = result !== 'queued' ? result.submit_max : null;
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <View style={st.backdrop}>
        <Card title={result === 'queued' ? 'Saved on this phone' : 'Workout saved'} style={{ width: '100%', maxWidth: 420 }}>
          {result === 'queued' ? (
            <T>No signal right now. Your sets are safe on this phone and will sync as soon as you're back online.</T>
          ) : (
            <>
              {result.prs.length ? (
                <View style={{ marginBottom: 8 }}>
                  <T bold style={{ color: c.danger }}>New personal records</T>
                  {result.prs.map((p) => (
                    <T key={p} style={{ color: c.danger }}>✦ {p}</T>
                  ))}
                </View>
              ) : null}
              {result.new_maxes.length ? (
                <View style={{ marginBottom: 8 }}>
                  <T bold>New training maxes for next cycle</T>
                  {result.new_maxes.map((m) => (
                    <T key={m}>• {m}</T>
                  ))}
                </View>
              ) : null}
              {!result.prs.length && !result.new_maxes.length ? <T>Well done. Logged and counted.</T> : null}
              {offer ? (
                <View style={{ marginTop: 6 }}>
                  <T>
                    That's a {LIFT_NAMES[offer.lift]} single at {fmtWeight(offer.weight_kg, units)}. Submit it to the club
                    leaderboard with a video?
                  </T>
                  <Button
                    title="Submit to leaderboard"
                    style={{ marginTop: 10 }}
                    onPress={() => {
                      onClose();
                      router.push({
                        pathname: '/submit-max',
                        params: { lift: offer.lift, weight_kg: String(offer.weight_kg), performed_on: offer.performed_on },
                      });
                    }}
                  />
                </View>
              ) : null}
            </>
          )}
          <Button title="Done" kind={offer ? 'secondary' : 'primary'} style={{ marginTop: 10 }} onPress={onClose} />
        </Card>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  head: { flexDirection: 'row', gap: 6, marginTop: 10, paddingBottom: 4, borderBottomWidth: 1 },
  row: { flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 6 },
  setCol: { width: 30, textAlign: 'center' },
  col: { flex: 1, minWidth: 0, textAlign: 'center' },
  rpeCol: { width: 56, minWidth: 0, flexShrink: 0, textAlign: 'center' },
  box: { borderWidth: 1, borderRadius: 5, paddingVertical: 8, paddingHorizontal: 8, fontSize: 16, textAlign: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(20,4,18,0.6)', alignItems: 'center', justifyContent: 'center', padding: 20 },
});

