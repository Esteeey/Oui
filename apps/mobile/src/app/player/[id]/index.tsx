import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { THEMES, getCategory, type DuelRecord, type EarnedMedal, type PostView, type PublicProfile, type ThemeStats } from '@qu1z/shared';

import { ReportSheet } from '@/components/report-sheet';
import { HeaderButton } from '@/components/header';
import { PostCard } from '@/components/post-card';
import { PlayerStatistics, PlayerTopics, ProfileHeader } from '@/components/profile-view';
import { SectionHeader } from '@/components/social';
import { AppText, Button, Card, Screen } from '@/components/ui';
import { timeAgo } from '@/utils/time';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { medalBadges } from '@/game/badges';
import { api, errorMessage, useApi } from '@/net/api';
import { avatarColor } from '@/utils/avatar';
import { Tap } from '@/components/tap';

export default function PlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const profile = useApi<PublicProfile>(`/api/users/${id}`);
  const p = profile.data;
  const stats = useApi<{ stats: Record<string, ThemeStats>; history: DuelRecord[] }>(p?.canSeeContent ? `/api/users/${id}/stats` : null);
  const wall = useApi<{ posts: PostView[] }>(p?.canSeeContent ? `/api/users/${id}/posts` : null);
  const medals = useApi<{ medals: EarnedMedal[] }>(p?.canSeeContent ? `/api/users/${id}/medals` : null);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const can = useApi<{ canChallenge: boolean }>(p && !p.relationship.isMe ? `/api/users/${id}/can-challenge` : null);
  const [error, setError] = useState<string | null>(null);

  if (profile.error) {
    return (
      <Screen back title="Profil">
        <AppText variant="heading">Profil introuvable</AppText>
        <AppText muted>Ce joueur n’existe pas ou n’est pas accessible.</AppText>
      </Screen>
    );
  }
  if (!p) return <Screen back title="Profil" />;
  if (p.relationship.isMe) return <Redirect href="/profile" />;

  const rel = p.relationship;
  const act = (method: string, path: string, body?: unknown) =>
    api(method, path, body).catch((e) => setError(errorMessage(e)));

  const followLabel = rel.following ? 'Abonné ✓' : rel.requested ? 'Demande envoyée' : 'Suivre';
  const onFollow = () =>
    rel.following || rel.requested ? act('DELETE', `/api/users/${id}/follow`) : act('POST', `/api/users/${id}/follow`);

  const themeStats = stats.data?.stats ?? {};
  const showcase = Object.entries(themeStats)
    .filter(([, s]) => s.duels > 0 || s.xp > 0)
    .map(([themeId, s]) => ({ themeId, xp: s.xp, rating: s.rating, duels: s.duels }))
    .sort((a, b) => b.duels - a.duels || b.xp - a.xp);
  const totals = Object.values(themeStats).reduce(
    (t, s) => ({ duels: t.duels + s.duels, wins: t.wins + s.wins, draws: t.draws + s.draws }),
    { duels: 0, wins: 0, draws: 0 },
  );
  const badgeDefinitions = medals.data ? medalBadges(medals.data.medals) : [];
  const timeline = [
    ...(wall.data?.posts ?? []).map((post) => ({ kind: 'post' as const, at: post.createdAt, post })),
    ...(stats.data?.history ?? []).map((duel) => ({ kind: 'duel' as const, at: duel.playedAt, duel })),
    ...(medals.data?.medals ?? []).flatMap((medal) => {
      const badge = badgeDefinitions.find((item) => item.id === medal.id);
      return badge ? [{ kind: 'medal' as const, at: medal.earnedAt, badge }] : [];
    }),
  ].sort((a, b) => b.at - a.at).slice(0, 30);

  return (
    <Screen back title="Profil joueur" headerRight={<><HeaderButton icon="flag-outline" label="Signaler" onPress={() => setReporting(true)} /><HeaderButton icon={rel.blockedByMe ? "lock-open-outline" : "ban-outline"} label={rel.blockedByMe ? "Débloquer" : "Bloquer"} onPress={() => rel.blockedByMe ? act("DELETE", `/api/blocks/${id}`) : setConfirmBlock(true)} /></>}>
      <ReportSheet target={reporting ? { type: 'user', id: p.id, label: p.pseudo } : null} onClose={() => setReporting(false)} />
      <ProfileHeader
        name={p.pseudo}
        color={avatarColor(p.id)}
        avatar={p.avatar}
        cover={p.cover}
        title={p.title}
        bio={p.bio}
        xp={p.xp}
        compactPlayer
        avatarSize={72}
        showXpProgress={false}
        actions={
          <View style={styles.profileHeaderActions}>
            <View style={styles.profileActions}>
              <Button icon="person-add" label={followLabel} color={Colors.surface} textColor={Colors.navy} onPress={onFollow} disabled={rel.blockedByMe} style={{ flex: 1 }} />
              <Button icon="chatbubble-outline" label="Message" color={Colors.surface} textColor={Colors.navy} onPress={() => router.push({ pathname: '/messages/new', params: { userId: id } })} disabled={rel.blockedByMe} style={{ flex: 1 }} />
              <Button icon="play" label="Jouer" color={Colors.gold} textColor={Colors.navy} onPress={() => setChoosing((c) => !c)} disabled={!can.data?.canChallenge || rel.blockedByMe} style={{ flex: 1 }} />
            </View>
            <View style={styles.profileCounts}>
              <View style={[styles.profileCountCell, styles.profileCountDivider]}>
                <AppText variant="caption" color={Colors.onAccent}>PARTIES</AppText>
                <AppText variant="score" color={Colors.accent}>{totals.duels.toLocaleString('fr-FR')}</AppText>
              </View>
              <View style={[styles.profileCountCell, styles.profileCountDivider]}>
                <AppText variant="caption" color={Colors.onAccent}>ABONNÉS</AppText>
                <AppText variant="score" color={Colors.correct}>{p.canSeeFollowers ? p.followers.toLocaleString('fr-FR') : '—'}</AppText>
              </View>
              <View style={styles.profileCountCell}>
                <AppText variant="caption" color={Colors.onAccent}>ABONNEMENTS</AppText>
                <AppText variant="score" color={Colors.opponent}>{p.canSeeFollowing ? p.following.toLocaleString('fr-FR') : '—'}</AppText>
              </View>
            </View>
          </View>
        }
      />
      {error && <AppText color={Colors.wrong}>{error}</AppText>}
      {sent && <AppText color={Colors.correct}>{sent}</AppText>}
      {choosing && (
        <Card>
          <AppText variant="label">Choisis le thème du défi</AppText>
          {THEMES.map((t) => {
            const category = getCategory(t.categoryId)!;
            return (
              <Tap
                key={t.id}
                accessibilityRole="button"
                onPress={async () => {
                  setChoosing(false);
                  setError(null);
                  try {
                    await api('POST', '/api/challenges', { userId: id, themeId: t.id });
                    setSent(`Défi envoyé à ${p.pseudo} en « ${t.name} ». Le duel commencera dès qu’il l’acceptera.`);
                  } catch (e) {
                    setError(errorMessage(e));
                  }
                }}
                style={[styles.option, { borderColor: category.color }]}>
                <AppText>{category.icon}</AppText>
                <AppText variant="label" style={{ flex: 1 }}>
                  {t.name}
                </AppText>
                <Ionicons name="flash" size={16} color={category.color} />
              </Tap>
            );
          })}
        </Card>
      )}

      {confirmBlock && (
        <Card style={{ borderColor: Colors.wrong }}>
          <AppText variant="label">Bloquer {p.pseudo} ?</AppText>
          <AppText variant="caption" muted>
            Vous ne verrez plus vos publications et commentaires respectifs, vos abonnements mutuels seront supprimés et aucune
            interaction ne sera possible. Il n’en est pas informé.
          </AppText>
          <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
            <Button label="Annuler" variant="outline" color={Colors.text} onPress={() => setConfirmBlock(false)} style={{ flex: 1 }} />
            <Button
              label="Bloquer"
              color={Colors.wrong}
              onPress={() => {
                setConfirmBlock(false);
                act('POST', '/api/blocks', { userId: id });
              }}
              style={{ flex: 1 }}
            />
          </View>
        </Card>
      )}

      {rel.blockedByMe ? (
        <Card>
          <AppText muted>Tu as bloqué ce joueur. Débloque-le pour voir son profil.</AppText>
        </Card>
      ) : !p.canSeeContent ? (
        <Card style={{ alignItems: 'center', gap: Spacing.sm }}>
          <Ionicons name="lock-closed" size={28} color={Colors.textMuted} />
          <AppText variant="label">Ce profil est privé</AppText>
          <AppText muted style={{ textAlign: 'center' }}>
            {rel.requested ? 'Ta demande d’abonnement est en attente.' : 'Abonne-toi pour voir ses publications et ses statistiques.'}
          </AppText>
        </Card>
      ) : (
        <>
          {stats.data && (
            <PlayerStatistics wins={totals.wins} draws={totals.draws} losses={totals.duels - totals.wins - totals.draws} />
          )}
          <PlayerTopics themes={showcase} />
          <SectionHeader title={`Fil de ${p.pseudo}`} />
          <View style={styles.timeline}>
            {timeline.map((item) => {
              if (item.kind === 'post') {
                return <PostCard key={`post-${item.post.id}`} post={item.post} showTheme={false} />;
              }
              if (item.kind === 'duel') {
                const outcome = item.duel.outcome;
                const color = outcome === 'win' ? Colors.correct : outcome === 'draw' ? Colors.opponent : Colors.wrong;
                const label = outcome === 'win' ? 'Victoire' : outcome === 'draw' ? 'Égalité' : 'Défaite';
                const mine = item.duel.player.reduce((sum, answer) => sum + answer.points, 0);
                const theirs = item.duel.opponent.reduce((sum, answer) => sum + answer.points, 0);
                return (
                  <Card key={`duel-${item.duel.id}`} style={styles.feedEvent}>
                    <View style={styles.eventHeader}>
                      <View style={[styles.eventIcon, { backgroundColor: color }]}><Ionicons name="flash" size={16} color={Colors.onAccent} /></View>
                      <View style={{ flex: 1 }}>
                        <AppText variant="label">{p.pseudo} a joué un duel</AppText>
                        <AppText variant="caption" muted>{timeAgo(item.at)} · {getCategory(THEMES.find((theme) => theme.id === item.duel.themeId)?.categoryId ?? '')?.icon} {THEMES.find((theme) => theme.id === item.duel.themeId)?.name ?? 'Quiz'}</AppText>
                      </View>
                      <AppText variant="caption" color={color}>{label}</AppText>
                    </View>
                    <AppText variant="caption">contre {item.duel.opponentName} · {mine} – {theirs} · {item.duel.ratingDelta >= 0 ? '+' : ''}{item.duel.ratingDelta} cote</AppText>
                  </Card>
                );
              }
              return (
                <Card key={`medal-${item.badge.id}-${item.at}`} style={styles.feedEvent}>
                  <View style={styles.eventHeader}>
                    <View style={[styles.eventIcon, { backgroundColor: Colors.gold }]}><Ionicons name={item.badge.icon} size={16} color={Colors.onAccent} /></View>
                    <View style={{ flex: 1 }}>
                      <AppText variant="label">{p.pseudo} a gagné une médaille</AppText>
                      <AppText variant="caption" muted>{timeAgo(item.at)}</AppText>
                    </View>
                  </View>
                  <AppText>{item.badge.name} · {item.badge.description}</AppText>
                </Card>
              );
            })}
          </View>
          {wall.data && timeline.length === 0 && <AppText muted style={{ textAlign: 'center' }}>Aucune activité pour l’instant.</AppText>}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  profileHeaderActions: { alignSelf: 'stretch', gap: Spacing.md, marginTop: Spacing.sm },
  profileActions: { flexDirection: 'row', gap: Spacing.xs },
  profileCounts: { flexDirection: 'row', paddingTop: Spacing.xs },
  profileCountCell: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  profileCountDivider: { borderRightWidth: 1, borderRightColor: 'rgba(255,255,255,0.3)' },
  rivalry: { alignItems: 'center' },
  timeline: { gap: Spacing.sm },
  feedEvent: { gap: Spacing.sm },
  eventHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  eventIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  option: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderWidth: 1, borderRadius: Radius.sm, padding: Spacing.sm + 4, minHeight: 48 },
});
