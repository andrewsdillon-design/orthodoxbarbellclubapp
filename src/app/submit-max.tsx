// Submit a squat, bench or deadlift max to the leaderboard with a video link. Video or it didn't happen.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { api, errorMessage } from '../api';
import type { Lift } from '../api/types';
import { Button, Card, Chip, Field, Row, Screen, T } from '../components/ui';
import { isoDate, isValidIsoDate } from '../lib/dates';
import { fmtNum, parseWeight, toUnits } from '../lib/units';
import { keys, useMe, useUnits } from '../state/queries';
import { useTheme } from '../theme';

const LIFTS: { value: Lift; label: string }[] = [
  { value: 'squat', label: 'Squat' },
  { value: 'bench', label: 'Bench Press' },
  { value: 'deadlift', label: 'Deadlift' },
];

export default function SubmitMax() {
  const { c } = useTheme();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ lift?: string; weight_kg?: string; performed_on?: string }>();
  const me = useMe().data;
  const units = useUnits();
  const kg = params.weight_kg ? Number(params.weight_kg) : null;

  const [lift, setLift] = useState<Lift>((LIFTS.find((l) => l.value === params.lift)?.value ?? 'squat') as Lift);
  const [weight, setWeight] = useState(kg ? fmtNum(toUnits(kg, units)) : '');
  const [bodyweight, setBodyweight] = useState(me?.bodyweight_kg ? fmtNum(toUnits(me.bodyweight_kg, units)) : '');
  const [date, setDate] = useState(params.performed_on ?? isoDate());
  const [video, setVideo] = useState('');
  const [club, setClub] = useState<string | undefined>(me?.clubs[0]?.slug);
  const [problems, setProblems] = useState<string[]>([]);
  const [done, setDone] = useState(false);

  const submit = useMutation({
    mutationFn: api.submitMax,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.maxes });
      qc.invalidateQueries({ queryKey: keys.me });
      setDone(true);
    },
    onError: (e) => setProblems([errorMessage(e)]),
  });

  function send() {
    const errs: string[] = [];
    let w: number | null = null;
    let bw: number | null = null;
    try {
      w = parseWeight(weight, units);
    } catch {
      /* reported below */
    }
    try {
      bw = parseWeight(bodyweight, units);
    } catch {
      /* reported below */
    }
    if (!w) errs.push('Enter the weight lifted.');
    if (!bw) errs.push('Enter your body weight on the day (it sets your weight class).');
    if (!isValidIsoDate(date)) errs.push('Enter the date as YYYY-MM-DD.');
    if (!/^https?:\/\/\S+\.\S+/i.test(video.trim())) errs.push('Add a link to the video (YouTube, Instagram, Google Drive…).');
    setProblems(errs);
    if (errs.length || !w || !bw) return;
    submit.mutate({ lift, weight_kg: w, bodyweight_kg: bw, performed_on: date, video_url: video.trim(), ...(club ? { club } : {}) });
  }

  if (done)
    return (
      <Screen>
        <Card title="Submitted">
          <T style={{ marginBottom: 12 }}>
            Your club leader will watch the video and verify it. Once verified it goes on the leaderboard.
          </T>
          <Button title="Done" onPress={() => router.back()} />
        </Card>
      </Screen>
    );

  return (
    <Screen>
      <Card title="Video or it didn't happen">
        <T size={14} muted style={{ marginBottom: 10 }}>
          Upload the video somewhere you can share a link to (YouTube unlisted is fine), then paste the link here.
        </T>
        <Row style={{ flexWrap: 'wrap', marginBottom: 10 }}>
          {LIFTS.map((l) => (
            <Chip key={l.value} label={l.label} on={l.value === lift} onPress={() => setLift(l.value)} />
          ))}
        </Row>
        <Row>
          <Field label={`Weight (${units})`} value={weight} onChangeText={setWeight} keyboardType="decimal-pad" style={{ flex: 1 }} />
          <Field label={`Body weight (${units})`} value={bodyweight} onChangeText={setBodyweight} keyboardType="decimal-pad" style={{ flex: 1 }} />
        </Row>
        <Field label="Date of the lift" value={date} onChangeText={setDate} autoCapitalize="none" />
        <Field
          label="Video link"
          value={video}
          onChangeText={setVideo}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="https://youtu.be/…"
        />
        {me && me.clubs.length > 1 ? (
          <>
            <T size={13} muted style={{ marginBottom: 4 }}>Club</T>
            <Row style={{ flexWrap: 'wrap', marginBottom: 10 }}>
              {me.clubs.map((cl) => (
                <Chip key={cl.slug} label={cl.name} on={cl.slug === club} onPress={() => setClub(cl.slug)} />
              ))}
            </Row>
          </>
        ) : null}
        {problems.map((p) => (
          <T key={p} style={{ color: c.danger, marginBottom: 4 }}>{p}</T>
        ))}
        <Button title="Submit for verification" onPress={send} busy={submit.isPending} style={{ marginTop: 6 }} />
      </Card>
    </Screen>
  );
}
