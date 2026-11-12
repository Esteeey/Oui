import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { notificationText, type ChallengeView, type NotificationView, type UserSummary } from '@qu1z/shared';

import { UserRow } from '@/components/player-row';
import { SectionHeader, type IconName } from '@/components/social';
import { HeaderButton } from '@/components/header';
import { AppText, Avatar, Button, LoadingState, Screen } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { api, errorMessage, useApi } from '@/net/api';
import { useGameServer } from '@/state/game-server';
import { avatarColor } from '@/utils/avatar';

import { timeAgo } from '@/utils/time';
import { Tap } from '@/components/tap';

/** Icône des notifications sans acteur (progression, classement, système). */
const ICONS: Partial<Record<NotificationView['type'], { icon: IconName; color: string }>> = {
  level_up: { icon: 'arrow-up-circle', color: Colors.opponent },
  theme_level_up: { icon: 'arrow-up-circle', color: Colors.opponent },
  title_unlocked: { icon: 'ribbon', color: Colors.gold },
  rank_top100: { icon: 'trophy', color: Colors.gold },
  rank_top10: { icon: 'trophy', color: Colors.gold },
  rank_first: { icon: 'trophy', color: Colors.gold },
  rank_left_top10: { icon: 'trending-down', color: Colors.wrong },
  duel_finished: { icon: 'flag', color: Colors.accent },
  announcement: { icon: 'megaphone', color: Colors.accent },
  sanction: { icon: 'warning', color: Colors.wrong },
  appeal_decision: { icon: 'scale', color: Colors.opponent },
  report_closed: { icon: 'shield-checkmark', color: Colors.correct },
};

/** Où mène chaque notification. */
function open(n: NotificationView): void {
  const actor = n.actors[0];
  const d = n.data;
  switch (n.type) {
    case 'like':
    case 'comment':
    case 'reply':
    case 'mention':
      if (typeof d.postId === 'string') router.push({ pathname: '/post/[id]', params: { id: d.postId } });
      return;
    case 'theme_level_up':
    case 'rank_top100':
    case 'rank_top10':
    case 'rank_first':
    case 'rank_lost_first':
    case 'rank_left_top10':
      if (typeof d.themeId === 'string') router.push({ pathname: '/theme/[id]', params: { id: d.themeId } });
      return;
    case 'level_up':
    case 'title_unlocked':
    case 'duel_finished':
      router.push('/profile');
      return;
    case 'announcement':
      if (typeof d.announcementId === 'string') router.push({ pathname: '/announcement/[id]', params: { id: d.announcementId } });
      return;
    case 'sanction':
    case 'appeal_decision':
      router.push('/settings/sanctions');
      return;
    case 'challenge_received':
    case 'rematch_request':
    case 'challenge_accepted':
    case 'challenge_declined':
    case 'challenge_completed':
      if (typeof d.challengeId === 'string') router.push(`/defi/${d.challengeId}` as Href);
      else router.push('/play');
      return;
    default:
      if (actor) router.push({ pathname: '/player/[id]', params: { id: actor.id } });
  }
}

/** Activité : demandes d'abonnement en attente, puis toutes les notifications (chacune mène à la page concernée). */
export default function ActivityScreen() {
  const list = useApi<{ notifications: NotificationView[]; unread: number }>('/api/notifications');
  const requests = useApi<{ requests: { user: UserSummary }[] }>('/api/me/follow-requests');
  const challenges = useApi<{ challenges: ChallengeView[] }>('/api/challenges');
  const [error, setError] = useState<string | null>(null);
  const notifications = list.data?.notifications ?? [];
  const pendingRequests = new Set((requests.data?.requests ?? []).map((r) => r.user.id));
  const pendingChallenges = new Set((challenges.data?.challenges ?? []).filter((c) => c.incoming).map((c) => c.id));

  const act = (method: string, path: string) => {
    setError(null);
    api(method, path).catch((e) => setError(errorMessage(e)));
  };

  const game = useGameServer();
  const [awaitingResult, setAwaitingResult] = useState<string | null>(null);
  useEffect(() => {
    if (!awaitingResult || game.duel?.duelId !== awaitingResult || game.duel.phase !== 'finished' || !game.duel.result) return;
    setAwaitingResult(null);
    router.push('/results');
  }, [awaitingResult, game.duel]);
  const tap = (n: NotificationView) => {
    if (!n.read) api('POST', `/api/notifications/${n.id}/read`).catch(() => {});
    // Duel terminé sans toi ou abandon adverse : on rouvre la page de victoire ou de défaite.
    if ((n.type === 'duel_finished' || n.type === 'opponent_forfeit') && typeof n.data.duelId === 'string') {
      setAwaitingResult(n.data.duelId);
      game.viewResult(n.data.duelId);
      return;
    }
    open(n);
  };

  return (
    <Screen
      inTabs
      title="Activité"
      headerRight={
        <>
          <HeaderButton icon="chatbubbles-outline" label="Messages" onPress={() => router.push('/messages')} />
          <HeaderButton icon="settings-outline" label="Réglages des notifications" onPress={() => router.push('/settings/notifications')} />
        </>
      }>
      <View style={styles.header}>
        {(list.data?.unread ?? 0) > 0 && (
          <Tap accessibilityRole="button" onPress={() => act('POST', '/api/notifications/read-all')} style={{ padding: Spacing.xs }}>
            <AppText variant="label" color={Colors.accentInk}>
              Tout marquer comme lu
            </AppText>
          </Tap>
        )}
      </View>
      <LoadingState visible={list.loading && !list.data} label="Chargement des notifications" />
      {error && <AppText color={Colors.wrong}>{error}</AppText>}
      {pendingRequests.size > 0 && (
        <>
          <SectionHeader title={`Demandes d’abonnement · ${pendingRequests.size}`} />
          {(requests.data?.requests ?? []).map(({ user }) => (
            <UserRow
              key={user.id}
              user={user}
              right={
                <View style={styles.actions}>
                  <Button label="Refuser" variant="outline" color={Colors.textMuted} onPress={() => act('POST', `/api/me/follow-requests/${user.id}/decline`)} />
                  <Button label="Accepter" color={Colors.correct} onPress={() => act('POST', `/api/me/follow-requests/${user.id}/accept`)} />
                </View>
              }
            />
          ))}
          <SectionHeader title="Notifications" />
        </>
      )}
      {list.data && notifications.length === 0 && <AppText muted>Aucune notification pour l’instant.</AppText>}

      <View style={styles.list}>
        {notifications.map((n) => {
          const actor = n.actors[0];
          const icon = ICONS[n.type];
          const requestPending = n.type === 'follow_request' && actor && pendingRequests.has(actor.id);
          const challengeId = typeof n.data.challengeId === 'string' ? n.data.challengeId : null;
          const challengePending = (n.type === 'challenge_received' || n.type === 'rematch_request') && challengeId && pendingChallenges.has(challengeId);
          return (
            <Tap key={n.id} accessibilityRole="button" onPress={() => tap(n)} style={styles.row}>
              {actor ? (
                <Avatar name={actor.pseudo} color={avatarColor(actor.id)} uri={actor.avatar} size={40} />
              ) : (
                <View style={[styles.icon, { backgroundColor: icon?.color ?? Colors.surfaceRaised }]}>
                  <Ionicons name={icon?.icon ?? 'notifications'} size={20} color={Colors.onAccent} />
                </View>
              )}
              <View style={{ flex: 1, gap: 6 }}>
                <AppText style={!n.read ? { fontWeight: '700' } : undefined}>{notificationText(n)}</AppText>
                <AppText variant="caption" muted>
                  {timeAgo(n.updatedAt)}
                </AppText>
                {requestPending && (
                  <View style={styles.actions}>
                    <Button label="Refuser" variant="outline" color={Colors.textMuted} onPress={() => act('POST', `/api/me/follow-requests/${actor!.id}/decline`)} />
                    <Button label="Accepter" color={Colors.correct} onPress={() => act('POST', `/api/me/follow-requests/${actor!.id}/accept`)} />
                  </View>
                )}
                {challengePending && (
                  <View style={styles.actions}>
                    <Button label="Refuser" variant="outline" color={Colors.textMuted} onPress={() => act('POST', `/api/challenges/${challengeId}/decline`)} />
                    <Button label="Jouer" color={Colors.opponent} onPress={() => act('POST', `/api/challenges/${challengeId}/accept`)} />
                  </View>
                )}
              </View>
              {!n.read && <View accessibilityLabel="Non lue" style={styles.dot} />}
            </Tap>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' },
  list: { borderRadius: Radius.md, overflow: 'hidden', backgroundColor: Colors.surface },
  row: {
    flexDirection: 'row',
    gap: Spacing.sm + 4,
    alignItems: 'flex-start',
    padding: Spacing.sm + 4,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.accent, marginTop: 6 },
  actions: { flexDirection: 'row', gap: Spacing.sm },
});
