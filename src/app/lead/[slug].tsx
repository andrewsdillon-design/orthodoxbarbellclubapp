// A club's leader view on its own screen, for admins managing clubs they oversee but aren't in.
import { Stack, useLocalSearchParams } from 'expo-router';
import { LeadPanel } from '../../components/LeadPanel';
import { Screen } from '../../components/ui';
import { useManage, useUnits } from '../../state/queries';

export default function LeadScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const manage = useManage(slug);
  const units = useUnits();
  return (
    <>
      <Stack.Screen options={{ title: manage.data?.name ?? 'Lead' }} />
      <Screen refreshing={manage.isRefetching} onRefresh={manage.refetch}>
        <LeadPanel slug={slug} units={units} />
      </Screen>
    </>
  );
}
