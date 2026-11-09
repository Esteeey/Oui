import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import type { FeedItem } from '@qu1z/shared';

import { ActivityCard } from '@/components/feed-card';
import { HeaderButton } from '@/components/header';
import { PostCard } from '@/components/post-card';
import { AppText, Avatar, Button, Card, LoadingState, Screen } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useApi } from '@/net/api';
import { useGameServer } from '@/state/game-server';
import { useProgress } from '@/state/progress';
import { avatarColor } from '@/utils/avatar';
import { Tap } from '@/components/tap';

type Filter = 'all' | 'challenges' | 'friends' | 'results';

/** Marge du fil de chaque côté de l'écran. */
const FEED_MARGIN = 7;

const FILTERS: { value: Filter; label: string; icon: (selected: boolean) => ReactNode }[] = [
  { value: 'all', label: 'Tout', icon: (selected) => <Ionicons name="home-outline" size={18} color={selected ? Colors.onAccent : Colors.violetInk} /> },
  { value: 'challenges', label: 'Défis', icon: () => <AppText style={{ fontSize: 15, lineHeight: 19 }}>🔥</AppText> },
  { value: 'friends', label: 'Amis', icon: (selected) => <Ionicons name="people-outline" size={18} color={selected ? Colors.onAccent : Colors.violetInk} /> },
  { value: 'results', label: 'Résultats', icon: (selected) => <Ionicons name="trophy-outline" size={18} color={selected ? Colors.onAccent : Colors.violetInk} /> },
];

/** Les filtres n'agissent que sur l'affichage : le serveur envoie toujours le même fil. */
function matches(item: FeedItem, filter: Filter, playerId: string | null | undefined): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'challenges':
      return item.kind === 'post' && item.post.target.kind === 'theme';
    case 'friends':
      return item.kind === 'post' ? item.post.target.kind === 'profile' && item.post.author.id !== playerId : item.activity.user.id !== playerId;
    case 'results':
      return item.kind === 'activity';
  }
}

export default function FeedScreen() {
  const { playerName } = useProgress();
  const { playerId, profile, unreadNotifications } = useGameServer();
  const feed = useApi<{ items: FeedItem[] }>(playerId ? '/api/feed' : null);
  const [filter, setFilter] = useState<Filter>('all');
  const allItems = feed.data?.items ?? [];
  const items = allItems.filter((item) => matches(item, filter, playerId));
  const openCompose = () => router.push('/compose');
  // Seul un rechargement demandé en tirant affiche l'indicateur du haut de l'écran.
  const [pulled, setPulled] = useState(false);
  useEffect(() => {
    if (!feed.loading) setPulled(false);
  }, [feed.loading]);

  return (
    <Screen
      inTabs
      headerLeft={false}
      title="Fil d'actualité"
      style={styles.content}
      onRefresh={() => {
        setPulled(true);
        feed.refresh();
      }}
      refreshing={pulled && feed.loading}
      headerRight={
        <>
          <HeaderButton icon="search-outline" label="Rechercher" onPress={() => router.push('/search')} />
          <HeaderButton icon="notifications-outline" label="Notifications" dot={unreadNotifications > 0} onPress={() => router.navigate('/activity')} />
        </>
      }
      headerContent={
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filters}>
            {FILTERS.map((f) => {
              const selected = f.value === filter;
              return (
                <Tap key={f.value} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => setFilter(f.value)} style={styles.filterHit}>
                  <View style={[styles.filter, selected && styles.filterActive]}>
                    {f.icon(selected)}
                    <AppText color={selected ? Colors.onAccent : Colors.violetInk} style={styles.filterLabel}>
                      {f.label}
                    </AppText>
                  </View>
                </Tap>
              );
            })}
          </ScrollView>

          <View style={styles.compose}>
            <Avatar name={playerName} color={playerId ? avatarColor(playerId) : Colors.accent} size={40} uri={profile?.avatar} ring={false} />
            <Tap accessibilityRole="button" accessibilityLabel="Publier une publication" hitSlop={{ top: 5, bottom: 5 }} onPress={openCompose} style={styles.composeField}>
              <AppText color={Colors.textSoft} style={{ fontSize: 14, lineHeight: 20 }} numberOfLines={1}>
                Quoi de neuf ?
              </AppText>
            </Tap>
            <Tap accessibilityRole="button" accessibilityLabel="Publier une image" onPress={openCompose} style={styles.composeIcon}>
              <Ionicons name="image-outline" size={27} color={Colors.violetInk} />
            </Tap>
            <Tap accessibilityRole="button" accessibilityLabel="Publier une photo" onPress={openCompose} style={styles.composeIcon}>
              <Ionicons name="camera-outline" size={27} color={Colors.violetInk} />
            </Tap>
          </View>
        </>
      }>
      <LoadingState visible={feed.loading && !feed.data} label="Chargement du fil" />
      {feed.error && <AppText color={Colors.wrong}>Impossible de charger le fil. Vérifie ta connexion.</AppText>}
      {items.map((item, i) => (
        <Animated.View
          key={item.kind === 'post' ? item.post.id : item.activity.id}
          entering={FadeInDown.delay(Math.min(i, 6) * 40).springify()}>
          {item.kind === 'post' ? <PostCard post={item.post} screenMargin={FEED_MARGIN} /> : <ActivityCard activity={item.activity} />}
        </Animated.View>
      ))}
      {feed.data && allItems.length > 0 && items.length === 0 && (
        <AppText muted style={{ textAlign: 'center', paddingVertical: Spacing.lg }}>
          Rien à afficher ici pour le moment.
        </AppText>
      )}
      {feed.data && allItems.length === 0 && (
        <Card style={{ alignItems: 'center', gap: Spacing.sm }}>
          <AppText variant="heading">Ton fil est vide</AppText>
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
  content: { paddingHorizontal: FEED_MARGIN, paddingTop: 12, gap: 10 },
  // La zone tactile fait 44 px de haut sans changer la taille visible des filtres.
  filterScroll: { flexGrow: 0 },
  filters: { gap: 8, paddingHorizontal: 12, flexGrow: 1, justifyContent: 'space-between' },
  filterHit: { paddingVertical: 6 },
  filter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    height: 33,
    paddingHorizontal: 10,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: '#DDD5EA',
    backgroundColor: Colors.surface,
  },
  filterActive: { backgroundColor: '#D60566', borderColor: '#D60566' },
  filterLabel: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  compose: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 13, paddingRight: 12, marginTop: 6, paddingBottom: 12 },
  composeIcon: { width: 44, height: 44, marginLeft: -8, alignItems: 'center', justifyContent: 'center' },
  composeField: { flex: 1, height: 37, borderRadius: Radius.pill, backgroundColor: '#E8E6EF', justifyContent: 'center', paddingHorizontal: 13 },
});
