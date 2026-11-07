import { router } from 'expo-router';
import { useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { countryFlag, countryName, getCategory, getTheme, levelFromXp, titleForLevel, type EarnedMedal, type PostView, type PublicProfile } from '@qu1z/shared';

import { Avatar, AppText, Button, ProgressBar } from '@/components/ui';
import { Composer } from '@/components/composer';
import { CoverButton, PlayedThemes, totalsOf } from '@/components/player-profile';
import { DivisionBadge } from '@/components/social';
import { PostCard } from '@/components/post-card';
import { BadgesGrid } from '@/components/profile-view';
import { Colors, Gradients, MaxContentWidth, Radius, Shadow, Spacing } from '@/constants/theme';
import { computeBadges, medalBadges } from '@/game/badges';
import { bestWinStreak, totalXp, useProgress } from '@/state/progress';
import { useApi } from '@/net/api';
import { mediaUri } from '@/net/media';
import { useGameServer } from '@/state/game-server';
import { avatarColor } from '@/utils/avatar';
import { formatCount } from '@/utils/format';
import { timeAgo } from '@/utils/time';
import { Tap } from '@/components/tap';

const COVER_HEIGHT = 360;
const AVATAR_SIZE = 96;

const OUTCOME = {
  win: { label: 'Victoire', color: Colors.correct },
  loss: { label: 'Défaite', color: Colors.wrong },
  draw: { label: 'Égalité', color: Colors.opponent },
} as const;

/** Mon profil : même présentation que celui des autres joueurs, avec mes propres actions. */
export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { playerName, stats, history } = useProgress();
  const { playerId } = useGameServer();
  const me = useApi<PublicProfile>(playerId ? `/api/users/${playerId}` : null);
  const wallData = useApi<{ posts: PostView[] }>(playerId ? `/api/users/${playerId}/posts` : null);
  const wall = wallData.data?.posts ?? [];
  const medals = useApi<{ medals: EarnedMedal[] }>(playerId ? `/api/users/${playerId}/medals` : null);
  const [tab, setTab] = useState('feed');
  const p = me.data;
  const xp = p?.xp ?? totalXp(stats);
  const name = p?.pseudo ?? playerName;
  const color = playerId ? avatarColor(playerId) : Colors.accent;
  const coverUri = mediaUri(p?.cover);
  const totals = totalsOf(stats);
  const level = levelFromXp(xp);
  const bestRating = Math.max(0, ...Object.values(stats).map((s) => s.rating));
  const bestTheme = p?.best ? getTheme(p.best.themeId) : undefined;
  const tabs = [
    { value: 'feed', label: 'Fil' },
    { value: 'themes', label: 'Thèmes' },
    { value: 'duels', label: 'Duels' },
    { value: 'badges', label: 'Badges' },
  ];

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 112 }]} showsVerticalScrollIndicator={false}>
        <View style={[styles.cover, { height: COVER_HEIGHT + insets.top }]}>
          {coverUri ? (
            <Image source={{ uri: coverUri }} style={StyleSheet.absoluteFill} contentFit="contain" accessibilityLabel={`Couverture de ${name}`} />
          ) : (
            <LinearGradient colors={Gradients.banner} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          )}
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(9,16,36,0.20)' }]} />
          <LinearGradient
            colors={['rgba(245,246,250,0)', 'rgba(245,246,250,0)', 'rgba(245,246,250,0.22)', 'rgba(245,246,250,0.76)', Colors.background]}
            locations={[0, 0.60, 0.79, 0.94, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.topBar, { top: insets.top + Spacing.sm }]} pointerEvents="box-none">
            <CoverButton icon="chevron-back" label="Retour" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
            <View style={styles.topRight}>
              <CoverButton icon="search" label="Rechercher" onPress={() => router.push('/search')} />
              <CoverButton icon="settings-outline" label="Réglages" onPress={() => router.push('/settings')} />
            </View>
          </View>
        </View>

        <View style={styles.content}>
          <View style={styles.identity}>
            <View style={styles.avatarWrap}>
              <Avatar name={name} color={color} size={AVATAR_SIZE} uri={p?.avatar} borderColor={Colors.surface} />
              <Tap
                accessibilityRole="button"
                accessibilityLabel="Modifier le profil"
                onPress={() => router.push('/settings/profile')}
                style={styles.editAvatar}>
                <Ionicons name="pencil" size={17} color={Colors.onAccent} />
              </Tap>
            </View>
            <View style={styles.nameRow}>
              <AppText style={styles.name} numberOfLines={1}>{name}</AppText>
              {p?.presence?.online && <View style={styles.onlineDot} accessibilityLabel="En ligne" />}
            </View>
            <View style={styles.rankRow}>
              <View style={styles.rankLine} />
              <AppText style={styles.rankBadge}>{p?.title ?? titleForLevel(level.level)}</AppText>
              <View style={styles.rankLine} />
            </View>
            {(p?.city || p?.country) ? (
              <View style={styles.locationRow}>
                {p?.country ? <View style={styles.flagCircle}><AppText style={styles.flagEmoji}>{countryFlag(p.country)}</AppText></View> : null}
                <AppText variant="caption" color={Colors.onAccent} numberOfLines={1}>{[p?.city, countryName(p?.country)].filter(Boolean).join(', ')}</AppText>
              </View>
            ) : null}
            {p?.bio ? <AppText variant="caption" muted style={styles.bio}>{p.bio}</AppText> : null}
            {presenceText(p?.presence) ? <AppText variant="caption" muted>{presenceText(p?.presence)}</AppText> : null}
          </View>

          {bestTheme && p?.best ? (
            <View style={styles.bestLine}>
              <Ionicons name="trophy" size={15} color={Colors.accent} />
              <AppText variant="caption" color={Colors.accent} numberOfLines={1}>
                Meilleur en {bestTheme.name} · {p.best.rank === 1 ? '1er' : `${p.best.rank}e`} sur {p.best.players}
              </AppText>
            </View>
          ) : null}

          <View style={styles.counts}>
            <ProfileCount label="Duels" value={totals.duels} highlight />
            <View style={styles.countDivider} />
            <ProfileCount
              label={p && p.followers > 1 ? 'Abonnés' : 'Abonné'}
              value={p?.followers ?? null}
              onPress={p?.canSeeFollowers ? () => router.push({ pathname: '/player/[id]/[list]', params: { id: p.id, list: 'followers' } }) : undefined}
            />
            <View style={styles.countDivider} />
            <ProfileCount
              label={p && p.following > 1 ? 'Abonnements' : 'Abonnement'}
              value={p?.following ?? null}
              onPress={p?.canSeeFollowing ? () => router.push({ pathname: '/player/[id]/[list]', params: { id: p.id, list: 'following' } }) : undefined}
            />
          </View>

          {p?.isPrivate && (
            <AppText variant="caption" muted style={styles.notice}>
              Profil privé : seuls tes abonnés voient ton mur et tes statistiques.
            </AppText>
          )}

          <OutcomeCard wins={totals.wins} draws={totals.draws} losses={Math.max(0, totals.duels - totals.wins - totals.draws)} />

          <View style={styles.tabs} accessibilityRole="tablist">
            {tabs.map((item) => {
              const selected = tab === item.value;
              return (
                <Tap key={item.value} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => setTab(item.value)} style={styles.tab}>
                  <AppText style={[styles.tabLabel, selected && styles.tabLabelActive]} numberOfLines={1}>{item.label}</AppText>
                  {selected && <View style={styles.underline} />}
                </Tap>
              );
            })}
          </View>

          <View style={styles.body}>
            {tab === 'feed' && (
              <>
                <View style={styles.levelCard}>
                  <View style={styles.levelHeader}>
                    <View>
                      <AppText variant="heading">Niveau {level.level}</AppText>
                      <AppText variant="caption" muted>{titleForLevel(level.level)}</AppText>
                    </View>
                    {bestRating > 0 && <DivisionBadge rating={bestRating} compact />}
                  </View>
                  <ProgressBar progress={level.progress} color={Colors.accent} height={8} />
                  <AppText variant="caption" muted>
                    {level.needed ? `${level.current} / ${level.needed} XP avant le niveau ${level.level + 1}` : 'Niveau maximum atteint'}
                  </AppText>
                </View>
                <View style={styles.statsTiles}>
                  <MiniStat label="Victoires" value={String(totals.wins)} />
                  <MiniStat label="Précision" value={totals.answered ? `${Math.round((totals.correct / totals.answered) * 100)} %` : '–'} />
                  <MiniStat label="Temps moyen" value={totals.correct ? `${(totals.correctMs / totals.correct / 1000).toFixed(1).replace('.', ',')} s` : '–'} />
                  <MiniStat label="Série record" value={String(bestWinStreak(history))} />
                </View>
                <FavoritesPreview stats={stats} onSeeThemes={() => setTab('themes')} />
                <AppText variant="heading">Mon mur</AppText>
                <Composer target={{ kind: 'profile' }} placeholder="Publie sur ton mur…" />
                {wall.map((post) => <PostCard key={post.id} post={post} showTheme={false} />)}
              </>
            )}
            {tab === 'themes' && (
              <>
                <PlayedThemes stats={stats} />
                <Button label="Trouver un thème" variant="outline" color={Colors.text} onPress={() => router.push('/explore')} />
              </>
            )}
            {tab === 'duels' && (history.length === 0 ? (
              <AppText muted style={styles.empty}>Joue ton premier duel pour commencer ta progression.</AppText>
            ) : history.slice(0, 20).map((d) => {
              const mine = d.player.reduce((t, a) => t + a.points, 0);
              const theirs = d.opponent.reduce((t, a) => t + a.points, 0);
              const outcome = OUTCOME[d.outcome];
              return (
                <Tap key={d.id} onPress={() => d.opponentId && router.push({ pathname: '/player/[id]', params: { id: d.opponentId } })} style={styles.duel}>
                      <View style={[styles.duelOutcome, { backgroundColor: outcome.color }]} />
                  <View style={{ flex: 1 }}>
                    <AppText variant="label">contre {d.opponentName}</AppText>
                    <AppText variant="caption" muted>{getTheme(d.themeId)?.name} · {d.ratingDelta >= 0 ? '+' : ''}{d.ratingDelta} cote</AppText>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <AppText variant="label" color={outcome.color}>{outcome.label}</AppText>
                    <AppText variant="caption" muted>{mine} – {theirs}</AppText>
                  </View>
                </Tap>
              );
            }))}
            {tab === 'badges' && <BadgesGrid badges={medals.data ? medalBadges(medals.data.medals) : computeBadges(history, stats)} />}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function presenceText(presence?: PublicProfile['presence']): string | null {
  if (!presence) return null;
  if (presence.online) return 'En ligne';
  return presence.lastSeenAt ? `Actif ${timeAgo(presence.lastSeenAt)}` : null;
}

function ProfileCount({ label, value, highlight, onPress }: { label: string; value: number | null; highlight?: boolean; onPress?: () => void }) {
  return (
    <Tap accessibilityRole="button" accessibilityState={{ disabled: !onPress }} disabled={!onPress} onPress={onPress} style={styles.count}>
      <AppText style={[styles.countValue, highlight && styles.countHighlight]}>{value === null ? '–' : formatCount(value)}</AppText>
      <AppText variant="caption" muted numberOfLines={1}>{label}</AppText>
    </Tap>
  );
}

function OutcomeCard({ wins, draws, losses }: { wins: number; draws: number; losses: number }) {
  const total = wins + draws + losses;
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  const outcomes = [
    { label: 'Victoires', value: wins, color: Colors.correct, bg: '#D7F8EC', icon: 'trophy-outline' as const },
    { label: 'Nuls', value: draws, color: Colors.gold, bg: '#FFF0C6', icon: 'hand-left-outline' as const },
    { label: 'Défaites', value: losses, color: Colors.wrong, bg: '#FCE0EA', icon: 'close' as const },
  ];
  return (
    <View style={styles.outcomeCard}>
      <View style={styles.cardHeading}>
        <Ionicons name="stats-chart" size={23} color={Colors.navy} />
        <AppText variant="label" style={styles.cardTitle}>Statistiques</AppText>
      </View>
      <View style={styles.outcomeBar} accessible accessibilityLabel={`${pct(wins)} % victoires, ${pct(draws)} % nuls, ${pct(losses)} % défaites`}>
        {total > 0 ? outcomes.map((item) => item.value > 0 ? (
          <View key={item.label} style={[styles.outcomeSegment, { flex: item.value, backgroundColor: item.color }]}>
            <AppText style={styles.outcomePercent}>{pct(item.value)} %</AppText>
          </View>
        ) : null) : <View style={[styles.outcomeSegment, { flex: 1, backgroundColor: Colors.surfaceRaised }]} />}
      </View>
      <View style={styles.outcomeTiles}>
        {outcomes.map((item) => (
          <View key={item.label} style={[styles.outcomeTile, { backgroundColor: item.bg }]}>
            <Ionicons name={item.icon} size={23} color={Colors.navy} />
            <View style={styles.outcomeTileText}>
              <AppText style={styles.outcomeValue}>{formatCount(item.value)}</AppText>
              <AppText variant="caption" style={styles.outcomeLabel}>{item.label}</AppText>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.miniStat}>
      <AppText variant="caption" muted>{label}</AppText>
      <AppText style={styles.miniStatValue}>{value}</AppText>
    </View>
  );
}

function FavoritesPreview({ stats, onSeeThemes }: { stats: Record<string, import('@qu1z/shared').ThemeStats>; onSeeThemes: () => void }) {
  const favorites = Object.entries(stats)
    .filter(([id, item]) => item.duels > 0 && getTheme(id))
    .sort((a, b) => b[1].xp - a[1].xp)
    .slice(0, 4);
  if (!favorites.length) return null;
  return (
    <View style={styles.favoritesCard}>
      <View style={styles.levelHeader}>
        <AppText variant="label">Thèmes favoris</AppText>
        <Tap accessibilityRole="button" onPress={onSeeThemes}><AppText variant="caption" color={Colors.accent}>Voir tout</AppText></Tap>
      </View>
      <View style={styles.favoritesGrid}>
        {favorites.map(([id, item]) => {
          const theme = getTheme(id)!;
          const category = getCategory(theme.categoryId);
          return (
            <Tap
              key={id}
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/theme/[id]', params: { id } })}
              style={[styles.favorite, { backgroundColor: `${category?.color ?? Colors.surfaceRaised}20` }]}>
              <AppText style={styles.favoriteIcon}>{category?.icon ?? '🎯'}</AppText>
              <View style={{ flex: 1 }}>
                <AppText variant="caption" numberOfLines={1}>{theme.name}</AppText>
                <AppText variant="caption" color={category?.color ?? Colors.textMuted}>Niv. {levelFromXp(item.xp).level}</AppText>
              </View>
            </Tap>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  scrollContent: { alignItems: 'center' },
  cover: { width: '100%', backgroundColor: Colors.navy, overflow: 'hidden' },
  content: { width: '100%', maxWidth: MaxContentWidth, paddingHorizontal: Spacing.md },
  topBar: { position: 'absolute', left: Spacing.md, right: Spacing.md, flexDirection: 'row', justifyContent: 'space-between' },
  topRight: { flexDirection: 'row', gap: Spacing.sm },
  identity: { alignItems: 'center', gap: 3, marginTop: -(AVATAR_SIZE + 70), paddingHorizontal: Spacing.md },
  avatarWrap: { position: 'relative', marginBottom: 2 },
  editAvatar: { position: 'absolute', right: -3, bottom: 2, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.accent, borderWidth: 3, borderColor: Colors.background },
  name: { color: Colors.onAccent, fontSize: 28, fontWeight: '800', letterSpacing: -0.5, textShadowColor: 'rgba(18,26,51,0.55)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8 },
  nameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.xs, maxWidth: '100%' },
  locationRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, maxWidth: '100%' },
  flagCircle: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.92)', overflow: 'hidden' },
  flagEmoji: { fontSize: 13, lineHeight: 18 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rankRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.xs, minWidth: 190 },
  rankLine: { flex: 1, height: 3, backgroundColor: Colors.gold, borderRadius: 2 },
  rankBadge: { color: Colors.text, backgroundColor: '#FFC928', paddingHorizontal: Spacing.md, paddingVertical: 3, borderRadius: 4, fontSize: 16, lineHeight: 21, fontWeight: '900', textShadowColor: 'rgba(255,255,255,0.4)', textShadowRadius: 2 },
  onlineDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.correct, borderWidth: 2, borderColor: Colors.background },
  bio: { textAlign: 'center', maxWidth: '90%' },
  bestLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: Spacing.sm },
  counts: { flexDirection: 'row', alignItems: 'center', marginTop: Spacing.md, backgroundColor: 'transparent', borderRadius: Radius.md, paddingVertical: Spacing.sm },
  count: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 48, paddingHorizontal: 3 },
  countValue: { fontSize: 21, fontWeight: '800', color: Colors.text },
  countHighlight: { color: Colors.accent },
  countDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: Colors.border },
  notice: { textAlign: 'center', marginTop: Spacing.sm },
  outcomeCard: { marginTop: Spacing.md, backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.sm + 2, gap: Spacing.sm, ...Shadow },
  cardHeading: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  cardTitle: { color: Colors.navy, fontSize: 18 },
  outcomeBar: { height: 28, borderRadius: Radius.pill, overflow: 'hidden', flexDirection: 'row', backgroundColor: Colors.surfaceRaised },
  outcomeSegment: { minWidth: 0, alignItems: 'center', justifyContent: 'center' },
  outcomePercent: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  outcomeTiles: { flexDirection: 'row', gap: 7 },
  outcomeTile: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: Radius.sm, minHeight: 52, paddingHorizontal: 4 },
  outcomeTileText: { alignItems: 'center' },
  outcomeValue: { color: Colors.navy, fontSize: 18, fontWeight: '800', lineHeight: 21 },
  outcomeLabel: { color: Colors.text, fontSize: 11, lineHeight: 14 },
  tabs: { flexDirection: 'row', marginTop: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  tab: { flex: 1, alignItems: 'center', paddingVertical: Spacing.sm + 3 },
  tabLabel: { fontSize: 15, fontWeight: '700', color: Colors.textMuted },
  tabLabelActive: { color: Colors.text, fontWeight: '800' },
  underline: { position: 'absolute', bottom: -1, left: 8, right: 8, height: 4, borderRadius: 2, backgroundColor: Colors.accent },
  body: { gap: Spacing.sm, paddingTop: Spacing.sm },
  levelCard: { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.md, gap: Spacing.xs, ...Shadow },
  levelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.sm },
  statsTiles: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  miniStat: { flexGrow: 1, flexBasis: '44%', backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.md, gap: 2, ...Shadow },
  miniStatValue: { color: Colors.navy, fontSize: 24, fontWeight: '800' },
  favoritesCard: { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.md, gap: Spacing.sm, ...Shadow },
  favoritesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  favorite: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, flexBasis: '48%', flexGrow: 1, padding: Spacing.sm, borderRadius: Radius.sm },
  favoriteIcon: { fontSize: 21 },
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
