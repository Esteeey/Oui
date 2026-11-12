import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import type { ChallengeView, FeedItem, UserSummary } from '@qu1z/shared';

import { Highlights, Kpis, RecentDuels, WaitingHero } from '@/components/feed-dashboard';
import { HeaderButton } from '@/components/header';
import { PostCard } from '@/components/post-card';
import { AppText, Avatar, Button, Card, LoadingState, Screen } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useApi } from '@/net/api';
import { useGameServer } from '@/state/game-server';
import { useProgress } from '@/state/progress';
import { avatarColor } from '@/utils/avatar';
import { Tap } from '@/components/tap';

/** Marge du fil de chaque côté de l'écran. */
const FEED_MARGIN = 7;

export default function FeedScreen() {
  const { playerName } = useProgress();
  const { playerId, profile, unreadNotifications } = useGameServer();
  const feed = useApi<{ items: FeedItem[] }>(playerId ? '/api/feed' : null);
  const following = useApi<{ users: UserSummary[] }>(playerId ? `/api/users/${playerId}/following` : null);
  const friends = following.data?.users ?? [];
  const { history, stats } = useProgress();
  const challenges = useApi<{ challenges: ChallengeView[] }>(playerId ? '/api/challenges' : null);
  const allItems = feed.data?.items ?? [];
  const posts = allItems.flatMap((item) => (item.kind === 'post' ? [item.post] : []));
  const highlights = allItems
    .flatMap((item) => (item.kind === 'activity' && item.activity.user.id !== playerId && (item.activity.event.kind === 'level' || item.activity.event.kind === 'perfect') ? [item.activity] : []))
    .slice(0, 3);
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
      title="Accueil"
      style={styles.content}
      onRefresh={() => {
        setPulled(true);
        feed.refresh();
        challenges.refresh();
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

        </>
      }>
      <LoadingState visible={feed.loading && !feed.data} label="Chargement du fil" />
      {feed.error && <AppText color={Colors.wrong}>Impossible de charger le fil. Vérifie ta connexion.</AppText>}
      {/* Tableau de bord : ce qui t'attend, tes chiffres, les temps forts des amis, tes derniers duels. */}
      <WaitingHero challenges={challenges.data?.challenges ?? []} />
      <Kpis history={history} stats={stats} />
      <Highlights items={highlights} />
      <RecentDuels history={history} />
      {posts.length > 0 && <AppText style={styles.h2}>Publications</AppText>}
      {posts.map((post, i) => (
        <Animated.View key={post.id} entering={FadeInDown.delay(Math.min(i, 6) * 40).springify()}>
          <PostCard post={post} screenMargin={FEED_MARGIN} />
        </Animated.View>
      ))}
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
  h2: { fontSize: 16, lineHeight: 22, fontWeight: '800', color: Colors.text, marginTop: 4 },
  filters: { flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 10 },
  filter: { height: 28, paddingHorizontal: 13, borderRadius: Radius.pill, backgroundColor: Colors.surfaceRaised, justifyContent: 'center' },
  filterActive: { backgroundColor: Colors.navy },
  filterLabel: { fontSize: 12, lineHeight: 16, fontWeight: '700' },
});
