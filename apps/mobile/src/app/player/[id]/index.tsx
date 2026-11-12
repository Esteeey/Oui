import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { THEMES, countryName, getCategory, getTheme, type DuelRecord, type EarnedMedal, type PostView, type PublicProfile, type ThemeStats } from '@qu1z/shared';

import { AppNavBar } from '@/components/app-nav-bar';
import { MoreMenu } from '@/components/more-menu';
import { CoverButton, PlayedThemes, ProfileAction, ProfileLayout, ProfileOverview, totalsOf } from '@/components/player-profile';
import { PostCard } from '@/components/post-card';
import { BadgesGrid } from '@/components/profile-view';
import { ReportSheet } from '@/components/report-sheet';
import { AppText, Button, Card, LoadingState, Screen } from '@/components/ui';
import { ClassicColors as Colors, Radius, Shadow, Spacing } from '@/constants/theme';
import { medalBadges } from '@/game/badges';
import { api, errorMessage, useApi } from '@/net/api';
import { useProgress } from '@/state/progress';
import { avatarColor } from '@/utils/avatar';
import { Tap } from '@/components/tap';
import { ThemeIcon } from '@/components/theme-icon';

const OUTCOME = {
  win: { label: 'Victoire', color: Colors.correct },
  loss: { label: 'Défaite', color: Colors.wrong },
  draw: { label: 'Égalité', color: Colors.opponent },
} as const;

export default function PlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const profile = useApi<PublicProfile>(`/api/users/${id}`);
  const p = profile.data;
  const stats = useApi<{ stats: Record<string, ThemeStats>; history: DuelRecord[] }>(p?.canSeeContent ? `/api/users/${id}/stats` : null);
  const wall = useApi<{ posts: PostView[] }>(p?.canSeeContent ? `/api/users/${id}/posts` : null);
  const medals = useApi<{ medals: EarnedMedal[] }>(p?.canSeeContent ? `/api/users/${id}/medals` : null);
  const { history } = useProgress();
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [liveSent, setLiveSent] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const can = useApi<{ canChallenge: boolean }>(p && !p.relationship.isMe ? `/api/users/${id}/can-challenge` : null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState('feed');

  if (profile.error) {
    return (
      <Screen back title="Profil">
        <AppText variant="heading">Profil introuvable</AppText>
        <AppText muted>Ce joueur n’existe pas ou n’est pas accessible.</AppText>
      </Screen>
    );
  }
  if (!p) {
    return (
      <Screen back title="Profil">
        <LoadingState visible={profile.loading} label="Chargement du profil" />
      </Screen>
    );
  }
  if (p.relationship.isMe) return <Redirect href="/profile" />;

  const rel = p.relationship;
  const act = (method: string, path: string, body?: unknown) => api(method, path, body).catch((e) => setError(errorMessage(e)));

  const followLabel = rel.following ? 'Suivi' : rel.requested ? 'Demande envoyée' : 'Suivre';
  const onFollow = () => (rel.following || rel.requested ? act('DELETE', `/api/users/${id}/follow`) : act('POST', `/api/users/${id}/follow`));

  const versus = history.filter((d) => d.opponentId === id);
  const myWins = versus.filter((d) => d.outcome === 'win').length;
  const theirWins = versus.filter((d) => d.outcome === 'loss').length;
  const themeStats = stats.data?.stats ?? {};
  const theirHistory = stats.data?.history ?? [];
  const hidden = rel.blockedByMe || !p.canSeeContent;
  const canChallenge = !!can.data?.canChallenge;

  const locked = rel.blockedByMe ? (
    <Card>
      <AppText muted>Tu as bloqué ce joueur. Débloque-le pour voir son profil.</AppText>
    </Card>
  ) : (
    <Card style={{ alignItems: 'center', gap: Spacing.sm }}>
      <Ionicons name="lock-closed" size={28} color={Colors.textMuted} />
      <AppText variant="label">Ce profil est privé</AppText>
      <AppText muted style={{ textAlign: 'center' }}>
        {rel.requested ? 'Ta demande d’abonnement est en attente.' : 'Abonne-toi pour voir ses publications et ses statistiques.'}
      </AppText>
    </Card>
  );

  return (
    <>
      <ReportSheet target={reporting ? { type: 'user', id: p.id, label: p.pseudo } : null} onClose={() => setReporting(false)} />
      <ProfileLayout
        name={p.pseudo}
        color={avatarColor(p.id)}
        avatar={p.avatar}
        cover={p.cover}
        title={p.title}
        xp={p.xp}
        bio={p.bio}
        country={p.country}
        city={p.city}
        presence={p.presence}
        best={p.best}
        duels={hidden ? 0 : totalsOf(themeStats).duels}
        profile={p}
        stats={hidden ? undefined : themeStats}
        themesTitle="Ses thèmes"
        topRight={
          <MoreMenu
            trigger={(open) => <CoverButton icon="ellipsis-horizontal" label="Plus d’options" onPress={open} />}
            items={[
              { label: 'Signaler', icon: 'flag-outline', onPress: () => setReporting(true) },
              rel.blockedByMe
                ? { label: 'Débloquer', icon: 'lock-open-outline', onPress: () => act('DELETE', `/api/blocks/${id}`) }
                : { label: 'Bloquer', icon: 'ban-outline', destructive: true, onPress: () => setConfirmBlock(true) },
            ]}
          />
        }
        actions={
          rel.blockedByMe ? undefined : (
            <>
              <ProfileAction primary label="Jouer" icon="game-controller-outline" color={Colors.accent} disabled={!canChallenge} onPress={() => setChoosing((c) => !c)} />
              <ProfileAction
                label={followLabel}
                icon={rel.following || rel.requested ? 'person-outline' : 'person-add-outline'}
                color={rel.following || rel.requested ? Colors.textMuted : Colors.violetInk}
                onPress={onFollow}
              />
              <ProfileAction
                accessibilityLabel={rel.following ? 'Message' : 'Message : suis ce joueur pour lui écrire'}
                icon="paper-plane-outline"
                color={Colors.violetInk}
                disabled={!rel.following}
                onPress={() => router.push({ pathname: '/messages/new', params: { userId: id } })}
              />
            </>
          )
        }
        tag={rel.followsMe && !rel.blockedByMe ? 'Te suit' : undefined}
        notices={
          error || sent || liveSent || choosing || confirmBlock ? (
            <>
              {error && <Card><AppText color={Colors.wrong}>{error}</AppText></Card>}
              {sent && <Card><AppText color={Colors.correct}>{sent}</AppText></Card>}
              {liveSent && <Card><AppText color={Colors.correct}>{liveSent}</AppText></Card>}
              {choosing && (
                <Card>
                  <AppText variant="label">Choisis un thème · Duel en direct ou défi asynchrone</AppText>
                  {THEMES.map((t) => {
                    const category = getCategory(t.categoryId)!;
                    return (
                      <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.xs }}>
                      <Tap
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
                        style={[styles.option, { borderColor: category.color, flex: 1 }]}>
                        <ThemeIcon themeId={t.id} size={30} />
                        <AppText variant="label" style={{ flex: 1 }}>
                          {t.name}
                        </AppText>
                        <Ionicons name="flash" size={16} color={category.color} />
                      </Tap>
                      <Tap accessibilityRole="button" accessibilityLabel={`Inviter ${p.pseudo} en duel direct sur ${t.name}`} onPress={async (event) => {
                        event.stopPropagation();
                        setError(null); setLiveSent(null);
                        try {
                          await api('POST', '/api/live-invitations', { userId: id, themeId: t.id });
                          setChoosing(false);
                          setLiveSent(`Invitation de duel envoyée à ${p.pseudo} · ${t.name}.`);
                        } catch (e) { setError(errorMessage(e)); }
                      }} style={{ minHeight: 48, minWidth: 50, paddingHorizontal: Spacing.sm, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.accent, alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="flash" size={19} color={Colors.accent} />
                      </Tap>
                      </View>
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
            </>
          ) : undefined
        }
        tab={tab}
        onTab={setTab}
        tabs={[
          {
            value: 'feed',
            label: 'Fil',
            render: () =>
              hidden ? (
                locked
              ) : (
                <>
                  <ProfileOverview xp={p.xp} stats={themeStats} history={theirHistory} />
                  <AppText variant="heading">Mur de {p.pseudo}</AppText>
                  {(wall.data?.posts ?? []).map((post) => (
                    <PostCard key={post.id} post={post} showTheme={false} />
                  ))}
                  {wall.data && wall.data.posts.length === 0 && <AppText muted>Aucune publication pour l’instant.</AppText>}
                </>
              ),
          },
          { value: 'themes', label: 'Thèmes', render: () => (hidden ? locked : <PlayedThemes stats={themeStats} />) },
          {
            value: 'duels',
            label: 'Duels',
            render: () => (
              <>
                <Card style={{ alignItems: 'center' }}>
                  <AppText variant="caption" muted>
                    FACE-À-FACE
                  </AppText>
                  <AppText variant="score">
                    <AppText variant="score" color={Colors.accentInk}>
                      {myWins}
                    </AppText>
                    {' – '}
                    <AppText variant="score" color={avatarColor(p.id)}>
                      {theirWins}
                    </AppText>
                  </AppText>
                </Card>
                {versus.length === 0 && (
                  <AppText muted style={{ textAlign: 'center' }}>
                    Vous ne vous êtes pas encore affrontés.
                  </AppText>
                )}
                {versus.slice(0, 20).map((d) => {
                  const outcome = OUTCOME[d.outcome];
                  return (
                    <View key={d.id} style={styles.duel}>
                      <View style={[styles.outcome, { backgroundColor: outcome.color }]} />
                      <View style={{ flex: 1 }}>
                        <AppText variant="label">{getTheme(d.themeId)?.name ?? 'Duel'}</AppText>
                        <AppText variant="caption" muted>
                          {d.player.reduce((t, a) => t + a.points, 0)} – {d.opponent.reduce((t, a) => t + a.points, 0)}
                        </AppText>
                      </View>
                      <AppText variant="label" color={outcome.color}>
                        {outcome.label}
                      </AppText>
                    </View>
                  );
                })}
              </>
            ),
          },
          {
            value: 'badges',
            label: 'Badges',
            render: () => (hidden ? locked : medals.data ? <BadgesGrid badges={medalBadges(medals.data.medals)} /> : null),
          },
        ]}
      />
      <AppNavBar />
    </>
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
  option: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderWidth: 1, borderRadius: Radius.sm, padding: Spacing.sm + 4, minHeight: 48 },
});
