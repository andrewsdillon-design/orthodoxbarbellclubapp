// The club leader's view: lifts to verify, join requests, announcements, invite links and members.
// Shown to the founder, leaders, and admins who oversee the club. The server enforces every rule; this
// only hides the actions the user can't take.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Share, View } from 'react-native';
import { api, errorMessage } from '../api';
import type { MemberAction, Units } from '../api/types';
import { memberActions } from '../lib/leadership';
import { confirmAction } from '../lib/confirm';
import { fmtDate } from '../lib/dates';
import { leaderKeysToRefresh, useClub, useClubLifts, useManage } from '../state/queries';
import { useTheme } from '../theme';
import { LiftReviewCard } from './LiftReview';
import { Banner, Button, Card, ErrorBox, Field, Loading, Row, T, Tag } from './ui';

const ACTION_LABEL: Record<MemberAction, string> = {
  approve: 'Approve',
  deny: 'Deny',
  make_leader: 'Make leader',
  make_member: 'Make member',
  remove: 'Remove',
};

function useLeaderAction() {
  const qc = useQueryClient();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const run = async (fn: () => Promise<{ message?: string } | unknown>, ok?: string) => {
    setError('');
    setMessage('');
    try {
      const r = (await fn()) as { message?: string } | undefined;
      setMessage(r?.message || ok || 'Done.');
      leaderKeysToRefresh().forEach((queryKey) => qc.invalidateQueries({ queryKey }));
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  return { run, message, error };
}

export function LeadPanel({ slug, units }: { slug: string; units: Units }) {
  const { c } = useTheme();
  const manage = useManage(slug);
  const club = useClub(slug);
  const lifts = useClubLifts(slug, 'pending');
  const { run, message, error } = useLeaderAction();

  if (manage.isPending) return <Loading />;
  if (manage.isError) return <ErrorBox error={manage.error} onRetry={manage.refetch} />;
  const v = manage.data;

  return (
    <View style={{ gap: 12 }}>
      {message ? <Banner tone="good">{message}</Banner> : null}
      {error ? <Banner tone="warn">{error}</Banner> : null}

      <Card
        title="Lifts to verify"
        right={v.pending_lifts ? <Tag label={String(v.pending_lifts)} color={c.danger} /> : undefined}
      >
        {lifts.isPending ? (
          <Loading />
        ) : lifts.data?.lifts.length ? (
          <T size={13} muted>Watch the video, then verify or reject. Verified lifts go on the leaderboard.</T>
        ) : (
          <T muted>Nothing waiting. Video or it didn't happen.</T>
        )}
      </Card>
      {lifts.data?.lifts.map((l) => <LiftReviewCard key={l.id} lift={l} units={units} />)}

      <Card title="Join requests" right={v.requests.length ? <Tag label={String(v.requests.length)} color={c.gold} /> : undefined}>
        {v.requests.length ? (
          v.requests.map((r, i) => (
            <Row key={r.id} style={{ paddingVertical: 6, borderTopWidth: i ? 1 : 0, borderTopColor: c.borderSoft }}>
              <View style={{ flex: 1 }}>
                <T bold>{r.name}</T>
                <T size={12} muted>Asked {fmtDate(r.requested_at.slice(0, 10))}</T>
              </View>
              <Button small title="Approve" onPress={() => run(() => api.memberAction(slug, r.id, 'approve'))} />
              <Button
                small
                kind="secondary"
                title="Deny"
                onPress={() => confirmAction(`Turn down ${r.name}?`, '', 'Deny', () => run(() => api.memberAction(slug, r.id, 'deny')))}
              />
            </Row>
          ))
        ) : (
          <T muted>No one is waiting to join.</T>
        )}
      </Card>

      <AnnouncementsCard slug={slug} announcements={club.data?.announcements ?? []} run={run} />
      <InvitesCard slug={slug} invites={v.invites} run={run} />

      <Card title={`Members (${v.members.length})`}>
        {v.members.map((m, i) => {
          const actions = memberActions(m);
          return (
            <View key={m.id} style={{ paddingVertical: 7, borderTopWidth: i ? 1 : 0, borderTopColor: c.borderSoft }}>
              <Row>
                <T bold style={{ flex: 1 }}>
                  {m.name}
                  {m.is_me ? ' (you)' : ''}
                </T>
                {m.role !== 'member' ? <Tag label={m.role} color={c.gold} /> : null}
              </Row>
              {m.program ? <T size={12} muted>{m.program}</T> : null}
              {actions.length ? (
                <Row style={{ marginTop: 6, flexWrap: 'wrap' }}>
                  {actions.map((a) => (
                    <Button
                      key={a}
                      small
                      kind={a === 'remove' ? 'danger' : 'secondary'}
                      title={ACTION_LABEL[a]}
                      onPress={() =>
                        a === 'remove'
                          ? confirmAction(`Remove ${m.name}?`, 'They leave the club and its leaderboard.', 'Remove', () =>
                              run(() => api.memberAction(slug, m.id, a)),
                            )
                          : run(() => api.memberAction(slug, m.id, a))
                      }
                    />
                  ))}
                </Row>
              ) : null}
            </View>
          );
        })}
      </Card>
    </View>
  );
}

type Run = (fn: () => Promise<unknown>, ok?: string) => Promise<void>;

function AnnouncementsCard({ slug, announcements, run }: { slug: string; announcements: { id?: number; body: string; author: string; created_at: string }[]; run: Run }) {
  const { c } = useTheme();
  const [body, setBody] = useState('');
  const post = useMutation({
    mutationFn: () => run(() => api.postAnnouncement(slug, body), 'Posted.'),
    onSuccess: () => setBody(''),
  });
  return (
    <Card title="Announcements">
      <Field value={body} onChangeText={setBody} placeholder="Tell the club something…" multiline inputStyle={{ minHeight: 70 }} />
      <Button title="Post to the club" disabled={!body.trim()} busy={post.isPending} onPress={() => post.mutate()} />
      {announcements.map((a, i) => (
        <View key={a.id ?? i} style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: c.borderSoft }}>
          <T size={12} muted>{`${a.author} · ${fmtDate(a.created_at.slice(0, 10))}`.toUpperCase()}</T>
          <T style={{ marginTop: 2 }}>{a.body}</T>
          {a.id != null ? (
            <Button
              small
              kind="ghost"
              title="Delete"
              style={{ alignSelf: 'flex-start' }}
              onPress={() => confirmAction('Delete this announcement?', '', 'Delete', () => run(() => api.deleteAnnouncement(slug, a.id as number), 'Deleted.'))}
            />
          ) : null}
        </View>
      ))}
    </Card>
  );
}

function InvitesCard({ slug, invites, run }: { slug: string; invites: { id: number; url: string; uses: number; max_uses: number | null; expires_at: string | null; created_by: string }[]; run: Run }) {
  const { c } = useTheme();
  const [days, setDays] = useState('');
  const [uses, setUses] = useState('');
  const [error, setError] = useState('');

  function create() {
    setError('');
    const d = days.trim() ? parseInt(days, 10) : undefined;
    const u = uses.trim() ? parseInt(uses, 10) : undefined;
    if (d !== undefined && (!Number.isInteger(d) || d < 1 || d > 365)) return setError('Days is 1 to 365, or blank for never.');
    if (u !== undefined && (!Number.isInteger(u) || u < 1 || u > 1000)) return setError('Uses is 1 to 1000, or blank for unlimited.');
    run(async () => {
      const inv = await api.createInvite(slug, { ...(d ? { days: d } : {}), ...(u ? { uses: u } : {}) });
      setDays('');
      setUses('');
      await Share.share({ message: `Join our barbell club on OBC: ${inv.url}`, url: inv.url }).catch(() => {});
      return { message: 'Invite link made.' };
    });
  }

  return (
    <Card title="Invite links">
      <T size={13} muted style={{ marginBottom: 8 }}>Anyone with the link can join. Leave the boxes blank for a link that never runs out.</T>
      <Row style={{ alignItems: 'flex-end' }}>
        <Field label="Expires in (days)" value={days} onChangeText={setDays} keyboardType="number-pad" placeholder="never" style={{ flex: 1, marginBottom: 0 }} />
        <Field label="Max uses" value={uses} onChangeText={setUses} keyboardType="number-pad" placeholder="unlimited" style={{ flex: 1, marginBottom: 0 }} />
      </Row>
      {error ? <T style={{ color: c.danger, marginTop: 6 }}>{error}</T> : null}
      <Button title="Make an invite link" style={{ marginTop: 10 }} onPress={create} />
      {invites.map((inv) => (
        <View key={inv.id} style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: c.borderSoft }}>
          <T size={13} selectable numberOfLines={1}>{inv.url}</T>
          <T size={12} muted>
            {inv.uses} used{inv.max_uses ? ` of ${inv.max_uses}` : ''} · {inv.expires_at ? `expires ${fmtDate(inv.expires_at.slice(0, 10))}` : 'never expires'} · by {inv.created_by}
          </T>
          <Row style={{ marginTop: 6 }}>
            <Button small title="Share" onPress={() => Share.share({ message: `Join our barbell club on OBC: ${inv.url}`, url: inv.url }).catch(() => {})} />
            <Button
              small
              kind="danger"
              title="Revoke"
              onPress={() => confirmAction('Revoke this link?', 'Nobody new can join with it.', 'Revoke', () => run(() => api.revokeInvite(slug, inv.id), 'Link revoked.'))}
            />
          </Row>
        </View>
      ))}
    </Card>
  );
}
