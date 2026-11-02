import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { THEMES, getCategory, getTheme, levelFromXp } from '@qu1z/shared';

import { FeedCard, type FeedEntry } from '@/components/feed-card';
import { PostCard } from '@/components/post-card';
import { DemoNote, IconButton, SectionHeader } from '@/components/social';
import { AppText, Avatar, Button, Card, Screen } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { FEED, getPlayer, type Post } from '@/demo/data';
import { useProgress, type DuelRecord } from '@/state/progress';
import { homePosts, useSocial } from '@/state/social';

/** Transforme les duels du joueur en publications du fil. */
function ownEntries(history: DuelRecord[], name: string): FeedEntry[] {
  return history.flatMap((duel) => {
    const base = { playerId: null, name, color: Colors.player, themeId: duel.themeId, at: duel.playedAt, likes: 0 };
    const entries: FeedEntry[] = [];
    const before = levelFromXp(duel.xpBefore).level;
    const after = levelFromXp(duel.xpBefore + duel.xpGained).level;
    if (after > before) entries.push({ ...base, id: `${duel.id}-lvl`, event: { kind: 'level', level: after } });
    if (duel.player.every((a) => a.correct)) entries.push({ ...base, id: `${duel.id}-perfect`, event: { kind: 'perfect' } });
    else if (duel.outcome === 'win') {
      const me = duel.player.reduce((t, a) => t + a.points, 0);
      const them = duel.opponent.reduce((t, a) => t + a.points, 0);
      entries.push({ ...base, id: `${duel.id}-win`, event: { kind: 'win', opponent: duel.opponentName, score: me, opponentScore: them } });
    }
    return entries;
  });
}

export default function FeedScreen() {
  const { playerName, history } = useProgress();
  const { challenges, liked, toggleLike, unreadNotifications, posts, following, subscribedThemes } = useSocial();

  const quickTheme = history[0]?.themeId ?? THEMES[0].id;
  // Accueil : publications et activité des personnes suivies, publications des thèmes suivis, et les miennes.
  const activity: FeedEntry[] = [
    ...ownEntries(history, 'Toi'),
    ...FEED.filter((item) => following.includes(item.playerId)).map((item) => {
      const player = getPlayer(item.playerId)!;
      return { ...item, name: player.name, color: player.color };
    }),
  ];
  type TimelineItem = { kind: 'post'; at: number; post: Post } | { kind: 'activity'; at: number; entry: FeedEntry };
  const timeline: TimelineItem[] = [
    ...homePosts(posts, following, subscribedThemes).map((post) => ({ kind: 'post' as const, at: post.at, post })),
    ...activity.map((entry) => ({ kind: 'activity' as const, at: entry.at, entry })),
  ].sort((a, b) => b.at - a.at);

  return (
    <Screen inTabs>
      <View style={styles.topBar}>
        <AppText variant="display">
          Qu<AppText variant="display" color={Colors.player}>1</AppText>z
        </AppText>
        <IconButton
          icon="notifications-outline"
          label="Notifications"
          badge={unreadNotifications}
          onPress={() => router.push('/notifications')}
        />
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
          onPress={() => router.push({ pathname: '/duel/[themeId]', params: { themeId: quickTheme } })}
        />
      </Card>

      {challenges.length > 0 && (
        <>
          <SectionHeader title="Défis reçus" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.sm }}>
            {challenges.map((c) => {
              const from = getPlayer(c.fromId)!;
              const theme = getTheme(c.themeId)!;
              const category = getCategory(theme.categoryId)!;
              return (
                <Pressable
                  key={c.id}
                  onPress={() =>
                    router.push({
                      pathname: '/duel/[themeId]',
                      params: { themeId: c.themeId, opponent: c.fromId, challenge: c.id },
                    })
                  }
                  style={[styles.challenge, { borderColor: category.color }]}>
                  <Avatar name={from.name} color={from.color} size={40} />
                  <AppText variant="label">{from.name}</AppText>
                  <AppText variant="caption" color={category.color} numberOfLines={1}>
                    {category.icon} {theme.name}
                  </AppText>
                  <View style={styles.accept}>
                    <Ionicons name="flash" size={14} color={Colors.background} />
                    <AppText variant="caption" color={Colors.background}>
                      Relever
                    </AppText>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </>
      )}

      <SectionHeader title="Fil d'actualité" />
      <Pressable accessibilityRole="button" onPress={() => router.push('/compose')} style={styles.compose}>
        <Avatar name={playerName} color={Colors.player} size={36} />
        <AppText muted style={{ flex: 1 }}>
          Quoi de neuf ?
        </AppText>
        <Ionicons name="create-outline" size={22} color={Colors.player} />
      </Pressable>
      <DemoNote>
        Tu vois ici les publications des personnes que tu suis et des thèmes auxquels tu es abonné ({subscribedThemes.length}). Les autres joueurs sont fictifs.
      </DemoNote>
      {timeline.map((item, i) => (
        <Animated.View
          key={item.kind === 'post' ? item.post.id : item.entry.id}
          entering={FadeInDown.delay(Math.min(i, 6) * 50).springify()}>
          {item.kind === 'post' ? (
            <PostCard post={item.post} />
          ) : (
            <FeedCard entry={item.entry} liked={liked.has(item.entry.id)} onLike={() => toggleLike(item.entry.id)} />
          )}
        </Animated.View>
      ))}
      {timeline.length === 0 && (
        <AppText muted style={{ textAlign: 'center' }}>
          Suis des joueurs ou abonne-toi à des thèmes pour remplir ton fil.
        </AppText>
      )}
      <AppText variant="caption" muted style={{ textAlign: 'center' }}>
        {playerName}, tu es à jour !
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: Spacing.sm },
  play: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderColor: Colors.player },
  challenge: {
    width: 150,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 2,
    padding: Spacing.sm + 4,
    gap: 6,
    alignItems: 'flex-start',
  },
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
  accept: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
    backgroundColor: Colors.opponent,
    borderRadius: Radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 2,
  },
});
