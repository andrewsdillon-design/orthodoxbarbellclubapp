// A submitted max with its video, for a club leader or admin to verify or reject. Nobody reviews their own.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Linking, Platform, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { api, errorMessage } from '../api';
import type { LeaderLift, Units } from '../api/types';
import { fmtDate } from '../lib/dates';
import { fmtWeight } from '../lib/units';
import { leaderKeysToRefresh } from '../state/queries';
import { useTheme } from '../theme';
import { PromptModal, type PromptRequest } from './PromptModal';
import { Banner, Button, Card, Display, Row, T, Tag } from './ui';

function Video({ lift }: { lift: LeaderLift }) {
  const { c } = useTheme();
  if (lift.embed_url && Platform.OS !== 'web') {
    return (
      <View style={{ height: 210, borderRadius: 6, overflow: 'hidden', borderWidth: 1, borderColor: c.borderSoft, marginVertical: 8 }}>
        <WebView
          source={{ uri: lift.embed_url }}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction
          allowsFullscreenVideo
          style={{ backgroundColor: '#000' }}
        />
      </View>
    );
  }
  return <Button title="Watch the video" kind="secondary" small style={{ alignSelf: 'flex-start', marginVertical: 8 }} onPress={() => Linking.openURL(lift.video_url)} />;
}

export function LiftReviewCard({ lift, units, showClub }: { lift: LeaderLift; units: Units; showClub?: boolean }) {
  const { c } = useTheme();
  const qc = useQueryClient();
  const [prompt, setPrompt] = useState<PromptRequest | null>(null);
  const [done, setDone] = useState('');
  const [error, setError] = useState('');
  const refresh = () => leaderKeysToRefresh().forEach((queryKey) => qc.invalidateQueries({ queryKey }));
  const review = useMutation({
    mutationFn: ({ action, note }: { action: 'verify' | 'reject'; note?: string }) => api.reviewLift(lift.id, action, note),
    onSuccess: (r) => {
      setDone(r.message);
      refresh();
    },
    onError: (e) => setError(errorMessage(e)),
  });

  return (
    <Card accent={lift.status === 'pending' ? c.danger : undefined}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <Display size={17}>{lift.lifter}</Display>
          <T bold>
            {lift.lift_name} {fmtWeight(lift.weight_kg, units)}
          </T>
          <T size={13} muted>
            {fmtWeight(lift.bodyweight_kg, units)} body weight · lifted {fmtDate(lift.performed_on)}
            {showClub && lift.club ? ` · ${lift.club}` : ''}
          </T>
        </View>
        <Tag label={lift.status} color={lift.status === 'verified' ? c.success : lift.status === 'rejected' ? c.danger : c.gold} />
      </Row>
      <Video lift={lift} />
      {lift.review_note ? <T size={13} style={{ fontStyle: 'italic' }}>Note: {lift.review_note}</T> : null}
      {lift.reviewer ? <T size={12} muted>Reviewed by {lift.reviewer}</T> : null}
      {done ? <Banner tone="good">{done}</Banner> : null}
      {error ? <T style={{ color: c.danger, marginTop: 6 }}>{error}</T> : null}
      {lift.status === 'pending' && !done ? (
        lift.can_review ? (
          <Row style={{ marginTop: 6 }}>
            <Button title="Verify" style={{ flex: 1 }} busy={review.isPending && review.variables?.action === 'verify'} onPress={() => review.mutate({ action: 'verify' })} />
            <Button
              title="Reject"
              kind="danger"
              style={{ flex: 1 }}
              onPress={() =>
                setPrompt({
                  title: 'Reject this lift',
                  message: `Tell ${lift.lifter} why, so they can fix it and submit again.`,
                  placeholder: 'e.g. Squat depth: hip crease not below the knee.',
                  confirm: 'Reject',
                  destructive: true,
                  required: 'A note is required to reject.',
                  onSubmit: (note) => review.mutateAsync({ action: 'reject', note }),
                })
              }
            />
          </Row>
        ) : (
          <T size={13} muted style={{ marginTop: 4 }}>Your own lift: another leader verifies it.</T>
        )
      ) : null}
      <PromptModal request={prompt} onClose={() => setPrompt(null)} />
    </Card>
  );
}
