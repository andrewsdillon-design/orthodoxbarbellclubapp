// Site and regional admins: the clubs they oversee, club applications, and lifts waiting across their clubs.
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { api, errorMessage } from '../api';
import type { ClubApplication } from '../api/types';
import { LiftReviewCard } from '../components/LiftReview';
import { PromptModal, type PromptRequest } from '../components/PromptModal';
import { Banner, Button, Card, ErrorBox, Loading, Row, Screen, Segmented, Stat, T, Tag } from '../components/ui';
import { fmtDate } from '../lib/dates';
import { leaderKeysToRefresh, useAdminApplications, useAdminLifts, useAdminSummary, useMe, useUnits } from '../state/queries';
import { useTheme } from '../theme';

export default function Admin() {
  const { c } = useTheme();
  const isStaff = !!useMe().data?.is_staff;
  const summary = useAdminSummary(isStaff);
  const apps = useAdminApplications(isStaff);
  const lifts = useAdminLifts(isStaff);
  const units = useUnits();
  const [view, setView] = useState<'clubs' | 'applications' | 'lifts'>('applications');

  if (!isStaff)
    return (
      <Screen>
        <Card><T>Only site and regional admins can open this.</T></Card>
      </Screen>
    );
  if (summary.isPending) return <Loading />;
  if (summary.isError)
    return (
      <Screen>
        <ErrorBox error={summary.error} onRetry={summary.refetch} />
      </Screen>
    );
  const s = summary.data;

  return (
    <Screen
      refreshing={summary.isRefetching || apps.isRefetching || lifts.isRefetching}
      onRefresh={() => {
        summary.refetch();
        apps.refetch();
        lifts.refetch();
      }}
    >
      <Card title="Overview" right={<T size={12} muted>{s.regions.join(', ')}</T>}>
        <Row>
          <Stat label="clubs" value={String(s.clubs.length)} />
          <Stat label="applications" value={String(s.pending_applications)} />
          <Stat label="lifts waiting" value={String(s.pending_lifts)} />
        </Row>
      </Card>
      <Segmented
        value={view}
        onChange={setView}
        options={[
          { value: 'applications', label: s.pending_applications ? `Applications (${s.pending_applications})` : 'Applications' },
          { value: 'lifts', label: s.pending_lifts ? `Lifts (${s.pending_lifts})` : 'Lifts' },
          { value: 'clubs', label: 'Clubs' },
        ]}
      />

      {view === 'applications' ? (
        apps.isPending ? <Loading /> : apps.isError ? <ErrorBox error={apps.error} onRetry={apps.refetch} /> : apps.data.applications.length ? (
          apps.data.applications.map((a) => <ApplicationCard key={a.id} app={a} />)
        ) : (
          <Card><T muted>No club applications waiting.</T></Card>
        )
      ) : null}

      {view === 'lifts' ? (
        lifts.isPending ? <Loading /> : lifts.isError ? <ErrorBox error={lifts.error} onRetry={lifts.refetch} /> : lifts.data.lifts.length ? (
          lifts.data.lifts.map((l) => <LiftReviewCard key={l.id} lift={l} units={units} showClub />)
        ) : (
          <Card><T muted>No lifts waiting in your clubs.</T></Card>
        )
      ) : null}

      {view === 'clubs' ? (
        <Card title="Clubs you oversee">
          {s.clubs.map((cl, i) => (
            <Pressable
              key={cl.slug}
              onPress={() => router.push({ pathname: '/lead/[slug]', params: { slug: cl.slug } })}
              accessibilityRole="button"
              style={{ paddingVertical: 9, borderTopWidth: i ? 1 : 0, borderTopColor: c.borderSoft }}
            >
              <Row>
                <View style={{ flex: 1 }}>
                  <T bold>{cl.name}</T>
                  <T size={12} muted>
                    {[cl.city, cl.state].filter(Boolean).join(', ')} · {cl.members} member{cl.members === 1 ? '' : 's'}
                  </T>
                </View>
                {!cl.active ? <Tag label="inactive" color={c.muted} /> : null}
                {cl.kind !== 'club' ? <Tag label={cl.kind} color={c.gold} /> : null}
                <T style={{ color: c.accent }}>›</T>
              </Row>
            </Pressable>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}

function ApplicationCard({ app }: { app: ClubApplication }) {
  const { c } = useTheme();
  const qc = useQueryClient();
  const [prompt, setPrompt] = useState<PromptRequest | null>(null);
  const [done, setDone] = useState('');
  const refresh = () => leaderKeysToRefresh().forEach((queryKey) => qc.invalidateQueries({ queryKey }));
  const decide = async (decision: Parameters<typeof api.decideApplication>[1]) => {
    try {
      const r = await api.decideApplication(app.id, decision);
      setDone(r.club ? `${r.message} ${r.club.url}` : r.message);
      refresh();
    } catch (e) {
      throw new Error(errorMessage(e));
    }
  };

  return (
    <Card title={app.club_name} right={<T size={12} muted>{fmtDate(app.submitted_at.slice(0, 10))}</T>}>
      <T>{app.parish}</T>
      <T size={14} muted>
        {[app.city, app.state].filter(Boolean).join(', ')}
        {app.region ? ` · ${app.region}` : ''} · web name {app.slug}
      </T>
      <T bold size={13} style={{ marginTop: 8 }}>Applicant</T>
      <T size={14} selectable>
        {app.applicant.name} · {app.applicant.email}
      </T>
      <T bold size={13} style={{ marginTop: 8 }}>Schedule</T>
      <T size={14}>{app.schedule}</T>
      {app.about ? (
        <>
          <T bold size={13} style={{ marginTop: 8 }}>About</T>
          <T size={14}>{app.about}</T>
        </>
      ) : null}
      <T bold size={13} style={{ marginTop: 8 }}>Equipment</T>
      {app.equipment.length ? app.equipment.map((e) => <T key={e} size={14}>✓ {e}</T>) : <T size={14} muted>None listed.</T>}
      {done ? (
        <Banner tone="good">{done}</Banner>
      ) : (
        <Row style={{ marginTop: 12 }}>
          <Button
            title="Approve"
            style={{ flex: 1 }}
            onPress={() =>
              setPrompt({
                title: `Approve ${app.club_name}`,
                message: `The club goes live at its web name. Keep "${app.slug}" or type a new one.`,
                initial: app.slug,
                placeholder: 'web name',
                confirm: 'Approve',
                required: 'Enter a web name.',
                onSubmit: (slug) => decide({ action: 'approve', ...(slug && slug !== app.slug ? { slug } : {}) }),
              })
            }
          />
          <Button
            title="Reject"
            kind="danger"
            style={{ flex: 1 }}
            onPress={() =>
              setPrompt({
                title: `Turn down ${app.club_name}`,
                message: 'Say why, so the founder knows what to change.',
                confirm: 'Reject',
                destructive: true,
                required: 'A note is required to reject.',
                onSubmit: (note) => decide({ action: 'reject', note }),
              })
            }
          />
        </Row>
      )}
      <PromptModal request={prompt} onClose={() => setPrompt(null)} />
    </Card>
  );
}
