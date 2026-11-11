import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import type { FeedItem, UserSummary } from '@qu1z/shared';

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

type Filter = 'all' | 'friends' | 'results';

/** Marge du fil de chaque côté de l'écran. */
const FEED_MARGIN = 7;

/** Agrandit vers le haut et le bas la zone tactile des petits contrôles du header (44 px). */
const HEADER_HIT = { top: 8, bottom: 8 };

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Tout' },
  { value: 'friends', label: 'Amis' },
  { value: 'results', label: 'Résultats' },
];

/** Les filtres n'agissent que sur l'affichage : le serveur envoie toujours le même fil. */
function matches(item: FeedItem, filter: Filter, playerId: string | null | undefined): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'friends':
      return item.kind === 'post' ? item.post.target.kind === 'profile' && item.post.author.id !== playerId : item.activity.user.id !== playerId;
    case 'results':
      return item.kind === 'activity' || !!item.post.result;
  }
}

export default function FeedScreen() {
  const { playerName } = useProgress();
  const { playerId, profile, unreadNotifications } = useGameServer();
  const feed = useApi<{ items: FeedItem[] }>(playerId ? '/api/feed' : null);
  const following = useApi<{ users: UserSummary[] }>(playerId ? `/api/users/${playerId}/following` : null);
  const friends = following.data?.users ?? [];
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
          <HeaderButton size={20} icon="search-outline" label="Rechercher" onPress={() => router.push('/search')} />
          <HeaderButton size={20} icon="notifications-outline" label="Notifications" dot={unreadNotifications > 0} onPress={() => router.navigate('/activity')} />
        </>
      }
      headerContent={
        <>
          {/* Bande d'amis : publier, chercher des joueurs, puis les joueurs suivis. */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.friends}>
            <Tap accessibilityRole="button" accessibilityLabel="Publier" onPress={openCompose} style={styles.friend}>
              <View>
                <Avatar name={playerName} color={playerId ? avatarColor(playerId) : Colors.accent} size={50} uri={profile?.avatar} ring={false} />
                <View style={styles.plusBadge}>
                  <Ionicons name="add" size={13} color={Colors.onAccent} />
                </View>
              </View>
              <AppText numberOfLines={1} style={styles.friendName}>Publier</AppText>
            </Tap>
            <Tap accessibilityRole="button" accessibilityLabel="Trouver des joueurs à défier" onPress={() => router.navigate('/people')} style={styles.friend}>
              <View style={styles.addFriend}>
                <Ionicons name="flash" size={20} color={Colors.text} />
              </View>
              <AppText numberOfLines={1} style={styles.friendName}>Défier</AppText>
            </Tap>
            {friends.map((u) => (
              <Tap key={u.id} accessibilityRole="button" accessibilityLabel={`Profil de ${u.pseudo}`} onPress={() => router.push({ pathname: '/player/[id]', params: { id: u.id } })} style={styles.friend}>
                <View style={styles.friendRing}>
                  <Avatar name={u.pseudo} color={avatarColor(u.id)} size={46} uri={u.avatar} ring={false} />
                </View>
                <AppText numberOfLines={1} style={styles.friendName}>{u.pseudo}</AppText>
              </Tap>
            ))}
          </ScrollView>

          <View style={styles.filters}>
            {FILTERS.map((f) => {
              const selected = f.value === filter;
              return (
                <Tap key={f.value} accessibilityRole="button" accessibilityState={{ selected }} hitSlop={HEADER_HIT} onPress={() => setFilter(f.value)}>
                  <View style={[styles.filter, selected && styles.filterActive]}>
                    <AppText color={selected ? Colors.onAccent : Colors.text} style={styles.filterLabel}>
                      {f.label}
                    </AppText>
                  </View>
                </Tap>
              );
            })}
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
  friends: { gap: 12, paddingHorizontal: 12, paddingTop: 2 },
  friend: { width: 56, alignItems: 'center', gap: 3 },
  friendName: { fontSize: 10.5, lineHeight: 14, fontWeight: '700', color: Colors.text, maxWidth: 56 },
  friendRing: { width: 54, height: 54, borderRadius: 27, borderWidth: 2.5, borderColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  addFriend: { width: 50, height: 50, borderRadius: 25, borderWidth: 2, borderStyle: 'dashed', borderColor: Colors.textSoft, alignItems: 'center', justifyContent: 'center', margin: 2 },
  plusBadge: { position: 'absolute', right: -2, bottom: -2, width: 20, height: 20, borderRadius: 10, backgroundColor: Colors.accent, borderWidth: 2, borderColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  filters: { flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 10 },
  filter: { height: 28, paddingHorizontal: 13, borderRadius: Radius.pill, backgroundColor: Colors.surfaceRaised, justifyContent: 'center' },
  filterActive: { backgroundColor: Colors.navy },
  filterLabel: { fontSize: 12, lineHeight: 16, fontWeight: '700' },
});
