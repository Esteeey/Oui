import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { THEMES, getTheme, type FeedItem } from '@qu1z/shared';

import { ActivityCard } from '@/components/feed-card';
import { SearchButton } from '@/components/search-button';
import { PostCard } from '@/components/post-card';
import { IconButton, SectionHeader } from '@/components/social';
import { AppText, Avatar, Button, Card, Screen } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useApi } from '@/net/api';
import { useGameServer } from '@/state/game-server';
import { useProgress } from '@/state/progress';
import { avatarColor } from '@/utils/avatar';

export default function FeedScreen() {
  const { playerName, history } = useProgress();
  const { playerId, profile } = useGameServer();
  const feed = useApi<{ items: FeedItem[] }>(playerId ? '/api/feed' : null);
  const { unreadNotifications } = useGameServer();
  const quickTheme = history[0]?.themeId ?? THEMES[0].id;
  const items = feed.data?.items ?? [];

  return (
    <Screen inTabs>
      <View style={styles.topBar}>
        <AppText variant="display">
          Qu<AppText variant="display" color={Colors.player}>1</AppText>z
        </AppText>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
          <SearchButton />
          <IconButton icon="chatbubbles-outline" label="Messages" onPress={() => router.push('/messages')} />
          <IconButton
            icon="notifications-outline"
            label="Notifications"
            badge={unreadNotifications}
            onPress={() => router.push('/notifications')}
          />
        </View>
      </View>

      <Card style={styles.play}>
        <View style={{ flex: 1, gap: 4 }}>
          <AppText variant="heading">Prêt pour un duel ?</AppText>
          <AppText variant="caption" muted>
            {getTheme(quickTheme)?.name} · 7 questions
          </AppText>
        </View>
        <Button
          label="Jouer"
          onPress={() => router.push({ pathname: '/duel/[themeId]', params: { themeId: quickTheme, mode: 'pvp' } })}
        />
      </Card>

      <SectionHeader title="Fil d'actualité" />
      <Pressable accessibilityRole="button" onPress={() => router.push('/compose')} style={styles.compose}>
        <Avatar name={playerName} color={playerId ? avatarColor(playerId) : Colors.player} size={36} uri={profile?.avatar} />
        <AppText muted style={{ flex: 1 }}>
          Quoi de neuf ?
        </AppText>
        <Ionicons name="create-outline" size={22} color={Colors.player} />
      </Pressable>

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
          <AppText variant="heading">Ton fil est vide</AppText>
          <AppText muted style={{ textAlign: 'center' }}>
            Abonne-toi à des thèmes et suis des joueurs (depuis les classements, les duels ou les publications) pour remplir ton fil.
          </AppText>
          <Button label="Explorer les thèmes" variant="outline" color={Colors.text} onPress={() => router.push('/explore')} />
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: Spacing.sm },
  play: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderColor: Colors.player },
  compose: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm + 4,
    backgroundColor: Colors.surface,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm + 4,
  },
});
