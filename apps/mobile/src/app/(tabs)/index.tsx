import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { THEMES, type FeedItem } from '@qu1z/shared';

import { ActivityCard } from '@/components/feed-card';
import { HeaderButton } from '@/components/header';
import { PlayBanner } from '@/components/play-banner';
import { PostCard } from '@/components/post-card';
import { Chip } from '@/components/social';
import { AppText, Avatar, Button, Card, Screen } from '@/components/ui';
import { Colors, Radius, Shadow, Spacing } from '@/constants/theme';
import { useApi } from '@/net/api';
import { useGameServer } from '@/state/game-server';
import { useProgress } from '@/state/progress';
import { avatarColor } from '@/utils/avatar';
import { Tap } from '@/components/tap';

type Filter = 'all' | 'post' | 'activity';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Tout' },
  { value: 'post', label: 'Publications' },
  { value: 'activity', label: 'Duels' },
];

export default function FeedScreen() {
  const { playerName, history } = useProgress();
  const { playerId, profile } = useGameServer();
  const feed = useApi<{ items: FeedItem[] }>(playerId ? '/api/feed' : null);
  const [filter, setFilter] = useState<Filter>('all');
  const quickTheme = history[0]?.themeId ?? THEMES[0].id;
  const items = (feed.data?.items ?? []).filter((item) => filter === 'all' || item.kind === filter);

  return (
    <Screen
      inTabs
      title="Fil d'actualité"
      headerRight={
        <>
          <HeaderButton icon="search" label="Rechercher" onPress={() => router.push('/search')} />
          <HeaderButton icon="chatbubbles-outline" label="Messages" onPress={() => router.push('/messages')} />
        </>
      }>
      <Tap accessibilityRole="button" onPress={() => router.push('/compose')} style={styles.compose}>
        <Avatar name={playerName} color={playerId ? avatarColor(playerId) : Colors.accent} size={32} uri={profile?.avatar} />
        <AppText muted style={{ flex: 1, fontSize: 15 }}>Quoi de neuf ?</AppText>
        <Ionicons name="image-outline" size={20} color={Colors.textMuted} />
      </Tap>

      <View style={styles.filters}>
        {FILTERS.map((f) => (
          <Chip key={f.value} label={f.label} active={filter === f.value} onPress={() => setFilter(f.value)} style={{ flex: 1, paddingHorizontal: 4, paddingVertical: 7 }} />
        ))}
      </View>

      <PlayBanner themeId={quickTheme} compact />

      {feed.error && <AppText color={Colors.wrong}>Impossible de charger le fil. Vérifie ta connexion.</AppText>}
      {items.map((item, i) => (
        <Animated.View
          key={item.kind === 'post' ? item.post.id : item.activity.id}
          entering={FadeInDown.delay(Math.min(i, 6) * 40).springify()}>
          {item.kind === 'post' ? <PostCard post={item.post} /> : <ActivityCard activity={item.activity} />}
        </Animated.View>
      ))}
      {feed.data && items.length === 0 && (
        <Card style={{ alignItems: 'center', gap: Spacing.sm }}>
          <AppText variant="heading">{filter === 'all' ? 'Ton fil est vide' : 'Rien à afficher ici'}</AppText>
          <AppText muted style={{ textAlign: 'center' }}>
            Abonne-toi à des thèmes et suis des joueurs (depuis les classements, les duels ou les publications) pour remplir ton fil.
          </AppText>
          <Button small label="Explorer les thèmes" variant="outline" onPress={() => router.push('/explore')} />
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  compose: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm + 2,
    backgroundColor: Colors.surface,
    borderRadius: Radius.pill,
    paddingVertical: 6,
    paddingLeft: 6,
    paddingRight: Spacing.md,
    ...Shadow,
  },
  filters: { flexDirection: 'row', gap: Spacing.sm },
});
