import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { getTheme, type EarnedMedal, type PostView, type PublicProfile } from '@qu1z/shared';

import { AppText, Button, LoadingState } from '@/components/ui';
import { Composer } from '@/components/composer';
import { MoreMenu } from '@/components/more-menu';
import { CoverButton, PlayedThemes, ProfileAction, ProfileLayout, ProfileOverview, totalsOf } from '@/components/player-profile';
import { PostCard } from '@/components/post-card';
import { BadgesGrid } from '@/components/profile-view';
import { Colors, Radius, Shadow, Spacing } from '@/constants/theme';
import { computeBadges, medalBadges } from '@/game/badges';
import { totalXp, useProgress } from '@/state/progress';
import { useApi } from '@/net/api';
import { useGameServer } from '@/state/game-server';
import { avatarColor } from '@/utils/avatar';
import { Tap } from '@/components/tap';

const OUTCOME = {
  win: { label: 'Victoire', color: Colors.correct },
  loss: { label: 'Défaite', color: Colors.wrong },
  draw: { label: 'Égalité', color: Colors.opponent },
} as const;

/** Mon profil : même présentation que celui des autres joueurs, avec mes propres actions. */
export default function ProfileScreen() {
  const { playerName, stats, history } = useProgress();
  const { playerId } = useGameServer();
  const me = useApi<PublicProfile>(playerId ? `/api/users/${playerId}` : null);
  const wallData = useApi<{ posts: PostView[] }>(playerId ? `/api/users/${playerId}/posts` : null);
  const wall = wallData.data?.posts ?? [];
  const medals = useApi<{ medals: EarnedMedal[] }>(playerId ? `/api/users/${playerId}/medals` : null);
  const [tab, setTab] = useState('feed');
  const p = me.data;
  const xp = p?.xp ?? totalXp(stats);

  return (
    <ProfileLayout
      name={p?.pseudo ?? playerName}
      color={playerId ? avatarColor(playerId) : Colors.accent}
      avatar={p?.avatar}
      cover={p?.cover}
      title={p?.title}
      xp={xp}
      bio={p?.bio}
      country={p?.country}
      city={p?.city}
      presence={p?.presence}
      best={p?.best}
      duels={totalsOf(stats).duels}
      profile={p ?? undefined}
      stats={stats}
      topRight={
        <MoreMenu
          trigger={(open) => <CoverButton icon="ellipsis-horizontal" label="Plus d’options" onPress={open} />}
          items={[
            { label: 'Modifier le profil', icon: 'pencil-outline', onPress: () => router.push('/settings/profile') },
            { label: 'Rechercher', icon: 'search-outline', onPress: () => router.push('/search') },
            { label: 'Réglages', icon: 'settings-outline', onPress: () => router.push('/settings') },
          ]}
        />
      }
      actions={
        <>
          <ProfileAction primary label="Jouer" icon="game-controller-outline" color={Colors.accent} onPress={() => router.navigate('/play')} />
          <ProfileAction label="Modifier" icon="create-outline" color={Colors.violetInk} onPress={() => router.push('/settings/profile')} />
          <ProfileAction accessibilityLabel="Messages" icon="paper-plane-outline" color={Colors.violetInk} onPress={() => router.push('/messages')} />
        </>
      }
      tag={p?.isPrivate ? 'Profil privé : seuls tes abonnés voient ton mur et tes statistiques.' : undefined}
      tab={tab}
      onTab={setTab}
      tabs={[
        {
          value: 'feed',
          label: 'Fil',
          render: () => (
            <>
              <ProfileOverview xp={xp} stats={stats} history={history} />
              <AppText variant="heading">Mon mur</AppText>
              <Composer target={{ kind: 'profile' }} placeholder="Publie sur ton mur…" />
              <LoadingState visible={wallData.loading && !wallData.data} label="Chargement du mur" />
              {wall.map((post) => (
                <PostCard key={post.id} post={post} showTheme={false} />
              ))}
            </>
          ),
        },
        {
          value: 'themes',
          label: 'Thèmes',
          render: () => (
            <>
              <PlayedThemes stats={stats} />
              <Button label="Trouver un thème" variant="outline" color={Colors.text} onPress={() => router.push('/explore')} />
            </>
          ),
        },
        {
          value: 'duels',
          label: 'Duels',
          render: () =>
            history.length === 0 ? (
              <AppText muted style={styles.empty}>
                Joue ton premier duel pour commencer ta progression.
              </AppText>
            ) : (
              history.slice(0, 20).map((d) => {
                const mine = d.player.reduce((t, a) => t + a.points, 0);
                const theirs = d.opponent.reduce((t, a) => t + a.points, 0);
                const outcome = OUTCOME[d.outcome];
                return (
                  <Tap key={d.id} onPress={() => d.opponentId && router.push({ pathname: '/player/[id]', params: { id: d.opponentId } })} style={styles.duel}>
                    <View style={[styles.duelOutcome, { backgroundColor: outcome.color }]} />
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
                        {mine} – {theirs}
                      </AppText>
                    </View>
                  </Tap>
                );
              })
            ),
        },
        {
          value: 'badges',
          label: 'Badges',
          render: () => <BadgesGrid badges={medals.data ? medalBadges(medals.data.medals) : computeBadges(history, stats)} />,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  empty: { textAlign: 'center', paddingVertical: Spacing.lg },
  duel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm + 4,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.sm + 4,
    ...Shadow,
  },
  duelOutcome: { width: 6, alignSelf: 'stretch', borderRadius: 3 },
});
