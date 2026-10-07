import { Stack, useLocalSearchParams } from 'expo-router';
import { SessionLogger } from '../../../components/SessionLogger';
import { ErrorBox, Loading, Screen } from '../../../components/ui';
import { useSession, useUnits } from '../../../state/queries';

export default function SessionScreen() {
  const params = useLocalSearchParams<{ week: string; day: string }>();
  const week = Number(params.week);
  const day = Number(params.day);
  const q = useSession(week, day);
  const units = useUnits();
  const title = q.data ? `Week ${q.data.week} · Day ${q.data.day_index + 1}` : 'Session';

  return (
    <>
      <Stack.Screen options={{ title }} />
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <Screen>
          <ErrorBox error={q.error} onRetry={q.refetch} />
        </Screen>
      ) : (
        <SessionLogger
          key={`${week}/${day}/${q.data.logged}/${units}`}
          session={q.data}
          units={units}
          refreshing={q.isRefetching}
          onRefresh={q.refetch}
        />
      )}
    </>
  );
}
