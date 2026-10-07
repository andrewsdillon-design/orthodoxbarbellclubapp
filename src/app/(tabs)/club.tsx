import { useState } from 'react';
import { Linking, View } from 'react-native';
import type { BoardKind, Club, Leaderboard, Units } from '../../api/types';
import { Button, Card, Chip, Display, ErrorBox, GoldRule, Loading, Row, Screen, Segmented, T, Tag } from '../../components/ui';
import { LINKS } from '../../config';
import { fmtDate } from '../../lib/dates';
import { classLabel, fmtNum, fmtWeight } from '../../lib/units';
import { useClub, useLeaderboard, useMe, useUnits } from '../../state/queries';
import { useTheme } from '../../theme';

const BOARDS: { value: BoardKind; label: string }[] = [
  { value: 'total', label: 'Total' },
  { value: 'squat', label: 'Squat' },
  { value: 'bench', label: 'Bench' },
  { value: 'deadlift', label: 'Deadlift' },
];

export default function ClubTab() {
  const me = useMe();
  const clubs = me.data?.clubs ?? [];
  const [slug, setSlug] = useState<string | null>(null);
  const selected = slug ?? clubs[0]?.slug ?? null;
  const club = useClub(selected);
  const board = useLeaderboard(selected);
  const units = useUnits();
  const [view, setView] = useState<'news' | 'members' | 'board'>('news');

  if (me.isPending) return <Loading />;
  if (!clubs.length)
    return (
      <Screen refreshing={me.isRefetching} onRefresh={me.refetch}>
        <Card title="Find your club">
          <T style={{ marginBottom: 12 }}>
            You're not in a club yet. Find one near your parish, or start one in your own garage. Join from the
            invite link your club leader sends you.
          </T>
          <Button title="Find a club" onPress={() => Linking.openURL(LINKS.clubs)} />
          <Button title="Start a club" kind="secondary" style={{ marginTop: 8 }} onPress={() => Linking.openURL(`${LINKS.site}/start`)} />
        </Card>
      </Screen>
    );

  return (
    <Screen
      refreshing={club.isRefetching || board.isRefetching}
      onRefresh={() => {
        me.refetch();
        club.refetch();
        board.refetch();
      }}
    >
      {clubs.length > 1 ? (
        <Row style={{ flexWrap: 'wrap' }}>
          {clubs.map((c) => (
            <Chip key={c.slug} label={c.name} on={c.slug === selected} onPress={() => setSlug(c.slug)} />
          ))}
        </Row>
      ) : null}
      {club.isPending ? <Loading /> : club.isError ? <ErrorBox error={club.error} onRetry={club.refetch} /> : <ClubHeader club={club.data} />}
      <Segmented
        value={view}
        onChange={setView}
        options={[
          { value: 'news', label: 'Announcements' },
          { value: 'members', label: 'Members' },
          { value: 'board', label: 'Leaderboard' },
        ]}
      />
      {view === 'news' && club.data ? <Announcements club={club.data} /> : null}
      {view === 'members' && club.data ? <Members club={club.data} /> : null}
      {view === 'board' ? (
        board.isPending ? <Loading /> : board.isError ? <ErrorBox error={board.error} onRetry={board.refetch} /> : <Board board={board.data} units={units} />
      ) : null}
    </Screen>
  );
}

function ClubHeader({ club }: { club: Club }) {
  const { c } = useTheme();
  return (
    <Card>
      <Display size={21}>{club.name}</Display>
      {club.parish ? <T muted>{club.parish}</T> : null}
      <T muted size={14}>{[club.city, club.state].filter(Boolean).join(', ')}</T>
      {club.my_role ? <View style={{ marginTop: 6 }}><Tag label={club.my_role} color={c.gold} /></View> : null}
      <GoldRule style={{ marginVertical: 10 }} />
      {club.schedule ? (
        <>
          <T bold size={13}>Training times</T>
          <T size={14} style={{ marginBottom: 6 }}>{club.schedule}</T>
        </>
      ) : null}
      {club.about ? <T size={14} muted>{club.about}</T> : null}
      {club.url ? <Button title="Club page" kind="ghost" small style={{ alignSelf: 'flex-start', marginTop: 6 }} onPress={() => Linking.openURL(club.url)} /> : null}
    </Card>
  );
}

function Announcements({ club }: { club: Club }) {
  if (!club.announcements.length) return <Card><T muted>No announcements yet.</T></Card>;
  return (
    <>
      {club.announcements.map((a, i) => (
        <Card key={`${a.created_at}-${i}`}>
          <T size={12} muted>{`${a.author} · ${fmtDate(a.created_at.slice(0, 10))}`.toUpperCase()}</T>
          <T style={{ marginTop: 4 }}>{a.body}</T>
        </Card>
      ))}
    </>
  );
}

function Members({ club }: { club: Club }) {
  const { c } = useTheme();
  if (!club.members.length) return <Card><T muted>Members are visible to members of the club.</T></Card>;
  return (
    <Card title={`${club.members.length} member${club.members.length === 1 ? '' : 's'}`}>
      {club.members.map((m, i) => (
        <Row key={`${m.name}-${i}`} style={{ paddingVertical: 6, borderTopWidth: i ? 1 : 0, borderTopColor: c.borderSoft }}>
          <T style={{ flex: 1 }}>{m.name}</T>
          {m.role !== 'member' ? <Tag label={m.role} color={c.gold} /> : null}
        </Row>
      ))}
    </Card>
  );
}

function Board({ board, units }: { board: Leaderboard; units: Units }) {
  const { c } = useTheme();
  const [kind, setKind] = useState<BoardKind>('total');
  const rows = board.boards[kind] ?? [];
  return (
    <Card title="Club leaderboard" right={<T size={12} muted>by DOTS</T>}>
      <Row style={{ flexWrap: 'wrap', marginBottom: 10 }}>
        {BOARDS.map((b) => (
          <Chip key={b.value} label={b.label} on={b.value === kind} onPress={() => setKind(b.value)} />
        ))}
      </Row>
      {rows.length ? (
        rows.map((r) => (
          <Row key={`${r.rank}-${r.name}`} style={{ paddingVertical: 7, borderTopWidth: 1, borderTopColor: c.borderSoft }}>
            <Display size={16} color={r.rank === 1 ? c.gold : undefined} style={{ width: 28 }}>{r.rank}</Display>
            <View style={{ flex: 1 }}>
              <T bold>{r.name}</T>
              <T size={12} muted>{classLabel(r.weight_class, units)} · {fmtWeight(r.bodyweight_kg, units)} bw</T>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <T bold style={{ color: c.danger }}>{fmtWeight(r.total_kg, units)}</T>
              <T size={12} muted>{fmtNum(r.dots)} DOTS</T>
            </View>
          </Row>
        ))
      ) : (
        <T muted>No verified lifts yet. Film your max and submit it.</T>
      )}
      {kind === 'total' && board.team_total_kg ? (
        <T style={{ marginTop: 10 }} bold>
          Team total (best {board.team_size}): {fmtWeight(board.team_total_kg, units)}
        </T>
      ) : null}
      <T size={12} muted style={{ marginTop: 6 }}>Verified lifts from the last 12 months.</T>
    </Card>
  );
}
