import { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import type { Progress, Units, Workout } from '../../api/types';
import { LineChart } from '../../components/LineChart';
import { Button, Card, Chip, Display, ErrorBox, Loading, Row, Screen, Segmented, Stat, T } from '../../components/ui';
import { fmtDate } from '../../lib/dates';
import { fmtNum, fmtWeight, toUnits } from '../../lib/units';
import { useEnrollment, useExerciseProgress, useHistory, useProgress, useUnits } from '../../state/queries';
import { useTheme } from '../../theme';

export default function ProgressTab() {
  const [view, setView] = useState<'progress' | 'history'>('progress');
  const { c } = useTheme();
  const toggle = (
    <Segmented
      value={view}
      onChange={setView}
      options={[
        { value: 'progress', label: 'Progress' },
        { value: 'history', label: 'History' },
      ]}
    />
  );
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ padding: 14, paddingBottom: 0 }}>{toggle}</View>
      {view === 'progress' ? <ProgressView /> : <HistoryView />}
    </View>
  );
}

function ProgressView() {
  const progress = useProgress();
  const enrollment = useEnrollment();
  const units = useUnits();
  const main = enrollment.data?.program.main_lifts ?? [];
  const lifts = useMemo(() => {
    const logged = (progress.data?.best_e1rm ?? []).map((b) => b.exercise);
    return [...main.filter((l) => logged.includes(l)), ...logged.filter((l) => !main.includes(l))];
  }, [progress.data, main]);
  const [lift, setLift] = useState<string | null>(null);
  const selected = lift ?? lifts[0] ?? null;
  const chart = useExerciseProgress(selected);

  if (progress.isPending) return <Loading />;
  if (progress.isError)
    return (
      <Screen>
        <ErrorBox error={progress.error} onRetry={progress.refetch} />
      </Screen>
    );
  const p = progress.data;
  const best = p.best_e1rm.find((b) => b.exercise === selected);

  return (
    <Screen refreshing={progress.isRefetching} onRefresh={() => { progress.refetch(); chart.refetch(); }}>
      <MaxesCard maxes={p.maxes_kg} order={main} units={units} />
      {lifts.length ? (
        <>
          <Row style={{ flexWrap: 'wrap' }}>
            {lifts.slice(0, 12).map((l) => (
              <Chip key={l} label={l} on={l === selected} onPress={() => setLift(l)} />
            ))}
          </Row>
          {selected ? (
            <Card title={`${selected}: estimated 1RM`}>
              {best ? (
                <Row style={{ marginBottom: 10 }}>
                  <Stat label="Best e1RM" value={fmtWeight(best.e1rm_kg, units)} />
                  <Stat label={`from ${best.reps} reps`} value={fmtWeight(best.weight_kg, units)} />
                  <Stat label="on" value={fmtDate(best.date, true)} />
                </Row>
              ) : null}
              {chart.isPending ? (
                <Loading />
              ) : chart.isError ? (
                <ErrorBox error={chart.error} onRetry={chart.refetch} />
              ) : (
                <LineChart unit={units} points={chart.data.history.map((h) => ({ date: h.date, value: toUnits(h.e1rm_kg, units) }))} />
              )}
              <RepMaxes progress={p} lift={selected} units={units} />
            </Card>
          ) : null}
          <Card title="Best estimated maxes">
            {p.best_e1rm.map((b) => (
              <Row key={b.exercise} style={{ paddingVertical: 4 }}>
                <T style={{ flex: 1 }}>{b.exercise}</T>
                <T bold>{fmtWeight(b.e1rm_kg, units)}</T>
              </Row>
            ))}
          </Card>
        </>
      ) : (
        <Card>
          <T>Log a workout and your estimated maxes show up here.</T>
        </Card>
      )}
    </Screen>
  );
}

function MaxesCard({ maxes, order, units }: { maxes: Record<string, number>; order: string[]; units: Units }) {
  const names = [...order.filter((l) => maxes[l] != null), ...Object.keys(maxes).filter((l) => !order.includes(l))];
  if (!names.length) return null;
  return (
    <Card title="Current training maxes">
      <Row style={{ flexWrap: 'wrap', gap: 0, rowGap: 12 }}>
        {names.map((l) => (
          <View key={l} style={{ width: '50%', alignItems: 'center' }}>
            <Display size={20}>{fmtNum(toUnits(maxes[l], units))}</Display>
            <T size={12} muted>{l} ({units})</T>
          </View>
        ))}
      </Row>
    </Card>
  );
}

function RepMaxes({ progress, lift, units }: { progress: Progress; lift: string; units: Units }) {
  const { c } = useTheme();
  const rm = progress.rep_maxes[lift];
  if (!rm || !Object.keys(rm).length) return null;
  const reps = Object.keys(rm).map(Number).sort((a, b) => a - b);
  return (
    <View style={{ marginTop: 12 }}>
      <T bold style={{ marginBottom: 6 }}>Rep maxes</T>
      <Row style={{ flexWrap: 'wrap', gap: 6 }}>
        {reps.map((r) => (
          <View key={r} style={{ borderWidth: 1, borderColor: c.borderSoft, borderRadius: 5, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: c.field, minWidth: 64, alignItems: 'center' }}>
            <T size={11} muted>{r}RM</T>
            <T bold size={14}>{fmtWeight(rm[String(r)], units)}</T>
          </View>
        ))}
      </Row>
    </View>
  );
}

function HistoryView() {
  const { c } = useTheme();
  const history = useHistory();
  const units = useUnits();
  if (history.isPending) return <Loading />;
  if (history.isError)
    return (
      <Screen>
        <ErrorBox error={history.error} onRetry={history.refetch} />
      </Screen>
    );
  const workouts = history.data.pages.flatMap((p) => p.workouts);
  return (
    <FlatList
      data={workouts}
      keyExtractor={(w) => `${w.program}/${w.week}/${w.day_index}/${w.performed_on}`}
      contentContainerStyle={{ padding: 14, gap: 12, paddingBottom: 40 }}
      style={{ backgroundColor: c.bg }}
      refreshing={history.isRefetching}
      onRefresh={history.refetch}
      onEndReached={() => history.hasNextPage && !history.isFetchingNextPage && history.fetchNextPage()}
      onEndReachedThreshold={0.5}
      ListEmptyComponent={<Card><T>No workouts logged yet.</T></Card>}
      ListFooterComponent={
        history.hasNextPage ? (
          <Button title="Load more" kind="secondary" busy={history.isFetchingNextPage} onPress={() => history.fetchNextPage()} />
        ) : null
      }
      renderItem={({ item }) => <WorkoutCard w={item} units={units} />}
    />
  );
}

function WorkoutCard({ w, units }: { w: Workout; units: Units }) {
  const groups = useMemo(() => {
    const m = new Map<string, Workout['sets']>();
    for (const s of w.sets) m.set(s.exercise, [...(m.get(s.exercise) ?? []), s]);
    return [...m.entries()];
  }, [w]);
  return (
    <Card title={fmtDate(w.performed_on)} right={<T size={12} muted>Wk {w.week}</T>}>
      <T bold style={{ marginBottom: 4 }}>{w.day}</T>
      <T size={12} muted style={{ marginBottom: 6 }}>{w.program}</T>
      {groups.map(([ex, sets]) => (
        <Row key={ex} style={{ alignItems: 'flex-start', paddingVertical: 2 }}>
          <T size={14} style={{ width: 130 }}>{ex}</T>
          <T size={14} muted style={{ flex: 1 }}>
            {sets
              .map((s) => (s.weight_kg ? `${fmtNum(toUnits(s.weight_kg, units))}×${s.reps ?? '–'}` : `${s.reps ?? '–'} reps`))
              .join(', ')}
          </T>
        </Row>
      ))}
      {w.notes ? <T size={13} style={{ marginTop: 6, fontStyle: 'italic' }}>{w.notes}</T> : null}
    </Card>
  );
}
