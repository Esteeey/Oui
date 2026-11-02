import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { THEMES, getCategory, type DuelRecord, type PostView, type PublicProfile, type ThemeStats } from '@qu1z/shared';

import { BackButton } from '@/components/back-button';
import { PostCard } from '@/components/post-card';
import { FollowCounts, OutcomeBar, ProfileHeader, Showcase } from '@/components/profile-view';
import { SectionHeader } from '@/components/social';
import { AppText, Button, Card, Screen } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { api, errorMessage, useApi } from '@/net/api';
import { useProgress } from '@/state/progress';
import { avatarColor } from '@/utils/avatar';

export default function PlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const profile = useApi<PublicProfile>(`/api/users/${id}`);
  const p = profile.data;
  const stats = useApi<{ stats: Record<string, ThemeStats>; history: DuelRecord[] }>(p?.canSeeContent ? `/api/users/${id}/stats` : null);
  const wall = useApi<{ posts: PostView[] }>(p?.canSeeContent ? `/api/users/${id}/posts` : null);
  const { history } = useProgress();
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const can = useApi<{ canChallenge: boolean }>(p && !p.relationship.isMe ? `/api/users/${id}/can-challenge` : null);
  const [error, setError] = useState<string | null>(null);

  if (profile.error) {
    return (
      <Screen>
        <BackButton />
        <AppText variant="heading">Profil introuvable</AppText>
        <AppText muted>Ce joueur n’existe pas ou n’est pas accessible.</AppText>
      </Screen>
    );
  }
  if (!p) return <Screen><BackButton /></Screen>;
  if (p.relationship.isMe) return <Redirect href="/profile" />;

  const rel = p.relationship;
  const act = (method: string, path: string, body?: unknown) =>
    api(method, path, body).catch((e) => setError(errorMessage(e)));

  const followLabel = rel.following ? 'Abonné ✓' : rel.requested ? 'Demande envoyée' : 'S’abonner';
  const onFollow = () =>
    rel.following || rel.requested ? act('DELETE', `/api/users/${id}/follow`) : act('POST', `/api/users/${id}/follow`);

  const versus = history.filter((d) => d.opponentId === id);
  const myWins = versus.filter((d) => d.outcome === 'win').length;
  const theirWins = versus.filter((d) => d.outcome === 'loss').length;
  const themeStats = stats.data?.stats ?? {};
  const showcase = Object.entries(themeStats)
    .map(([themeId, s]) => ({ themeId, xp: s.xp, rating: s.rating }))
    .sort((a, b) => b.xp - a.xp)
    .slice(0, 3);
  const totals = Object.values(themeStats).reduce(
    (t, s) => ({ duels: t.duels + s.duels, wins: t.wins + s.wins, draws: t.draws + s.draws }),
    { duels: 0, wins: 0, draws: 0 },
  );

  return (
    <Screen>
      <View style={styles.topRow}>
        <BackButton />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={rel.blockedByMe ? 'Débloquer' : 'Bloquer'}
          onPress={() => (rel.blockedByMe ? act('DELETE', `/api/blocks/${id}`) : setConfirmBlock(true))}
          style={styles.menu}>
          <Ionicons name={rel.blockedByMe ? 'lock-open-outline' : 'ban-outline'} size={18} color={Colors.textMuted} />
          <AppText variant="caption" muted>
            {rel.blockedByMe ? 'Débloquer' : 'Bloquer'}
          </AppText>
        </Pressable>
      </View>

      <ProfileHeader
        name={p.pseudo}
        color={avatarColor(p.id)}
        title={p.title}
        bio={p.bio}
        xp={p.xp}
        actions={
          <View style={{ alignSelf: 'stretch', gap: Spacing.sm }}>
            <FollowCounts profile={p} />
            {!rel.blockedByMe && (
              <Button
                label={followLabel}
                variant={rel.following || rel.requested ? 'outline' : 'solid'}
                color={rel.following || rel.requested ? Colors.textMuted : Colors.player}
                onPress={onFollow}
              />
            )}
            {can.data?.canChallenge && (
              <Button label="Défier" color={Colors.opponent} onPress={() => setChoosing((c) => !c)} />
            )}
            {rel.followsMe && !rel.blockedByMe && (
              <AppText variant="caption" muted style={{ textAlign: 'center' }}>
                Te suit
              </AppText>
            )}
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
              <Pressable
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
              </Pressable>
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
          {versus.length > 0 && (
            <Card style={styles.rivalry}>
              <AppText variant="caption" muted>
                FACE-À-FACE
              </AppText>
              <AppText variant="score">
                <AppText variant="score" color={Colors.player}>
                  {myWins}
                </AppText>
                {' – '}
                <AppText variant="score" color={avatarColor(p.id)}>
                  {theirWins}
                </AppText>
              </AppText>
            </Card>
          )}
          <SectionHeader title="Statistiques" />
          <OutcomeBar wins={totals.wins} draws={totals.draws} losses={totals.duels - totals.wins - totals.draws} />
          {showcase.length > 0 && <Showcase title="Thèmes phares" themes={showcase} />}
          <SectionHeader title={`Mur de ${p.pseudo}`} />
          {(wall.data?.posts ?? []).map((post) => (
            <PostCard key={post.id} post={post} showTheme={false} />
          ))}
          {wall.data && wall.data.posts.length === 0 && <AppText muted>Aucune publication pour l’instant.</AppText>}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  menu: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: Spacing.sm, borderRadius: Radius.pill },
  rivalry: { alignItems: 'center' },
  option: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderWidth: 1, borderRadius: Radius.sm, padding: Spacing.sm + 4, minHeight: 48 },
});
