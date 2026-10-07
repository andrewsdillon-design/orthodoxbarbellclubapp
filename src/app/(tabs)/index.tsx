import { router } from 'expo-router';
import { ApiError } from '../../api';
import { SessionLogger } from '../../components/SessionLogger';
import { Button, Card, Display, ErrorBox, Loading, Screen, T } from '../../components/ui';
import { useToday, useUnits } from '../../state/queries';

export default function Today() {
  const today = useToday();
  const units = useUnits();

  if (today.isPending) return <Loading label="Finding today's session…" />;

  if (today.isError) {
    const noProgram = today.error instanceof ApiError && today.error.status === 404;
    return (
      <Screen refreshing={today.isRefetching} onRefresh={today.refetch}>
        {noProgram ? (
          <Card title="Pick a program">
            <T style={{ marginBottom: 12 }}>Choose a program and enter your maxes, and every session's weights are worked out for you.</T>
            <Button title="Choose a program" onPress={() => router.push('/enroll')} />
          </Card>
        ) : (
          <ErrorBox error={today.error} onRetry={today.refetch} />
        )}
      </Screen>
    );
  }

  const session = today.data;
  if (!session) {
    return (
      <Screen refreshing={today.isRefetching} onRefresh={today.refetch}>
        <Card title="Program complete">
          <Display size={16} style={{ marginBottom: 8 }}>Glory to God for all things.</Display>
          <T style={{ marginBottom: 12 }}>You've logged every session in this program. Pick the next one to keep going.</T>
          <Button title="Choose a program" onPress={() => router.push('/enroll')} />
        </Card>
      </Screen>
    );
  }

  return (
    <SessionLogger
      key={`${session.week}/${session.day_index}/${session.logged}/${units}`}
      session={session}
      units={units}
      refreshing={today.isRefetching}
      onRefresh={today.refetch}
    />
  );
}
