import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import Ionicons from '@expo/vector-icons/Ionicons';

import { getTheme, type EarnedMedal, type PostView, type PublicProfile } from '@qu1z/shared';

import { Composer } from '@/components/composer';
import { HeaderButton } from '@/components/header';
import { PostCard } from '@/components/post-card';
import { BadgesGrid, FollowCounts, OutcomeBar, ProfileHeader, Showcase, StatsCard } from '@/components/profile-view';
import { SectionHeader } from '@/components/social';
import { AppText, Button, Screen } from '@/components/ui';
import { Colors, Radius, Shadow, Spacing } from '@/constants/theme';
import { computeBadges, medalBadges } from '@/game/badges';
import { bestWinStreak, totalXp, useProgress } from '@/state/progress';
import { useApi } from '@/net/api';
import { useGameServer } from '@/state/game-server';
import { avatarColor } from '@/utils/avatar';

const OUTCOME = {
  win: { label: 'Victoire', color: Colors.correct },
  loss: { label: 'Défaite', color: Colors.wrong },
  draw: { label: 'Égalité', color: Colors.opponent },
} as const;

export default function ProfileScreen() {
  const { playerName, stats, history } = useProgress();
  const { playerId } = useGameServer();
  const me = useApi<PublicProfile>(playerId ? `/api/users/${playerId}` : null);
  const wallData = useApi<{ posts: PostView[] }>(playerId ? `/api/users/${playerId}/posts` : null);
  const wall = wallData.data?.posts ?? [];
  const medals = useApi<{ medals: EarnedMedal[] }>(playerId ? `/api/users/${playerId}/medals` : null);
  const all = Object.values(stats);
  const duels = all.reduce((t, s) => t + s.duels, 0);
  const wins = all.reduce((t, s) => t + s.wins, 0);
  const draws = all.reduce((t, s) => t + s.draws, 0);
  const correct = all.reduce((t, s) => t + s.correct, 0);
  const answered = all.reduce((t, s) => t + s.answered, 0);
  const showcase = Object.entries(stats)
    .map(([themeId, s]) => ({ themeId, xp: s.xp, rating: s.rating }))
    .sort((a, b) => b.xp - a.xp);

  return (
    <Screen
      inTabs
      back
      title="Profil"
      headerRight={
        <>
          <HeaderButton icon="search" label="Rechercher" onPress={() => router.push('/search')} />
          <HeaderButton icon="settings-outline" label="Réglages" onPress={() => router.push('/settings')} />
        </>
      }>
      <ProfileHeader
        name={me.data?.pseudo ?? playerName}
        color={playerId ? avatarColor(playerId) : Colors.accent}
        avatar={me.data?.avatar}
        cover={me.data?.cover}
        title={me.data?.title}
        bio={me.data?.bio}
        xp={me.data?.xp ?? totalXp(stats)}
        actions={
          me.data ? (
            <View style={{ alignSelf: 'stretch', gap: Spacing.sm }}>
              <FollowCounts profile={me.data} />
              {me.data.isPrivate && (
                <AppText variant="caption" muted style={{ textAlign: 'center' }}>
                  Profil privé
                </AppText>
              )}
              <Button label="Modifier le profil" variant="outline" onPress={() => router.push('/settings/profile')} />
            </View>
          ) : undefined
        }
      />

      <StatsCard
        stats={[
          { label: 'Duels', value: String(duels) },
          { label: 'Victoires', value: duels ? `${Math.round((wins / duels) * 100)} %` : '–' },
          { label: 'Précision', value: answered ? `${Math.round((correct / answered) * 100)} %` : '–' },
          { label: 'Meilleure série', value: String(bestWinStreak(history)) },
        ]}
      />

      <SectionHeader title="Mon mur" />
      <Composer target={{ kind: 'profile' }} placeholder="Publie sur ton mur…" />
      {wall.map((post) => (
        <PostCard key={post.id} post={post} showTheme={false} />
      ))}

      <SectionHeader title="Statistiques" />
      <OutcomeBar wins={wins} draws={draws} losses={duels - wins - draws} />

      {showcase.length > 0 ? (
        <Showcase title="Mes thèmes" themes={showcase} />
      ) : (
        <>
          <SectionHeader title="Mes thèmes" />
          <AppText muted>Joue ton premier duel pour commencer ta progression.</AppText>
          <Button label="Trouver un thème" onPress={() => router.push('/explore')} />
        </>
      )}

      <BadgesGrid badges={medals.data ? medalBadges(medals.data.medals) : computeBadges(history, stats)} />

      {history.length > 0 && (
        <>
          <SectionHeader title="Derniers duels" />
          {history.slice(0, 10).map((d) => {
            const me = d.player.reduce((t, a) => t + a.points, 0);
            const them = d.opponent.reduce((t, a) => t + a.points, 0);
            const outcome = OUTCOME[d.outcome];
            return (
              <Pressable
                key={d.id}
                onPress={() => d.opponentId && router.push({ pathname: '/player/[id]', params: { id: d.opponentId } })}
                style={styles.duel}>
                <View style={[styles.outcome, { backgroundColor: outcome.color }]} />
                <View style={{ flex: 1 }}>
                  <AppText variant="label">contre {d.opponentName}</AppText>
                  <AppText variant="caption" muted>
                    {getTheme(d.themeId)?.name} · {d.ratingDelta >= 0 ? '+' : ''}
                    {d.ratingDelta} cote
                  </AppText>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <AppText variant="label" color={outcome.color}>
                    {outcome.label}
                  </AppText>
                  <AppText variant="caption" muted>
                    {me} – {them}
                  </AppText>
                </View>
              </Pressable>
            );
          })}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  duel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm + 4,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.sm + 4,
    ...Shadow,
  },
  outcome: { width: 6, alignSelf: 'stretch', borderRadius: 3 },
});
