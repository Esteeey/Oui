import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView } from 'react-native';

import { THEMES, getCategory } from '@qu1z/shared';

import { HeaderButton } from '@/components/header';
import { LeaderboardPanel } from '@/components/leaderboard-panel';
import { Chip } from '@/components/social';
import { Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';

/** Classements : général ou par thème ; Amis, Pays ou Monde. `?theme=` présélectionne un thème. */
export default function LeaderboardScreen() {
  const params = useLocalSearchParams<{ theme?: string }>();
  const [themeId, setThemeId] = useState('global');
  // L'onglet reste monté : on suit le thème demandé à chaque ouverture depuis une page de thème.
  useEffect(() => {
    if (params.theme && THEMES.some((t) => t.id === params.theme)) setThemeId(params.theme);
  }, [params.theme]);

  return (
    <Screen inTabs back title="Classements" headerRight={<HeaderButton icon="search" label="Rechercher" onPress={() => router.push('/search')} />}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: Spacing.sm, alignItems: 'flex-start' }}>
        <Chip label="Général" active={themeId === 'global'} onPress={() => setThemeId('global')} />
        {THEMES.map((t) => (
          <Chip key={t.id} label={t.name} color={getCategory(t.categoryId)?.color} active={themeId === t.id} onPress={() => setThemeId(t.id)} />
        ))}
      </ScrollView>
      <LeaderboardPanel themeId={themeId === 'global' ? undefined : themeId} />
    </Screen>
  );
}
