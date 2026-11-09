import { router } from 'expo-router';
import { useState } from 'react';

import type { EarnedMedal, PostView, PublicProfile } from '@qu1z/shared';

import { AppText, Button, LoadingState } from '@/components/ui';
import { Composer } from '@/components/composer';
import { DuelHistoryList } from '@/components/duel-history-list';
import { MoreMenu } from '@/components/more-menu';
import { CoverButton, PlayedThemes, ProfileAction, ProfileLayout, ProfileOverview, totalsOf } from '@/components/player-profile';
import { PostCard } from '@/components/post-card';
import { BadgesGrid } from '@/components/profile-view';
import { Colors } from '@/constants/theme';
import { computeBadges, medalBadges } from '@/game/badges';
import { totalXp, useProgress } from '@/state/progress';
import { useApi } from '@/net/api';
import { useGameServer } from '@/state/game-server';
import { avatarColor } from '@/utils/avatar';

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
          render: () => <DuelHistoryList duels={history.slice(0, 20)} />,
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
