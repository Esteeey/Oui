import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  countryFlag,
  countryName,
  getCategory,
  getTheme,
  levelFromXp,
  titleForLevel,
  type DuelRecord,
  type PublicProfile,
  type ThemeStats,
} from '@qu1z/shared';

import { DivisionBadge } from '@/components/social';
import { AppText, Avatar, Card, ProgressBar } from '@/components/ui';
import { Colors, Gradients, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { mediaUri } from '@/net/media';
import { bestWinStreak } from '@/state/progress';
import { formatCount } from '@/utils/format';
import { timeAgo } from '@/utils/time';
import { Tap } from '@/components/tap';

/** Hauteur de la couverture sous la barre d'état du téléphone. */
const COVER_HEIGHT = 360;
const AVATAR_SIZE = 104;

export interface ProfileTab {
  value: string;
  label: string;
  render: () => ReactNode;
}

/**
 * Profil joueur (le sien comme celui des autres) : couverture jusqu'en haut de l'écran, sans bandeau
 * d'application, photo ronde, identité, bandeau « Meilleur en … », compteurs, actions puis onglets.
 */
export function ProfileLayout({
  name,
  color,
  avatar,
  cover,
  title,
  xp,
  bio,
  country,
  city,
  presence,
  best,
  duels,
  profile,
  actions,
  topRight,
  notices,
  tabs,
  tab,
  onTab,
}: {
  name: string;
  color: string;
  avatar?: string | null;
  cover?: string | null;
  title?: string | null;
  xp: number;
  bio?: string;
  country?: string | null;
  city?: string | null;
  presence?: PublicProfile['presence'];
  best?: PublicProfile['best'];
  duels: number;
  profile?: PublicProfile;
  actions?: ReactNode;
  topRight?: ReactNode;
  /** Messages et cartes affichés entre les actions et les onglets (erreurs, choix du défi…). */
  notices?: ReactNode;
  tabs: ProfileTab[];
  tab: string;
  onTab: (value: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const coverUri = mediaUri(cover);
  const locationLabel = [city, countryName(country)].filter(Boolean).join(', ');
  const level = levelFromXp(xp);
  const bestTheme = best ? getTheme(best.themeId) : undefined;
  const active = tabs.find((t) => t.value === tab) ?? tabs[0];

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl }} showsVerticalScrollIndicator={false}>
        <View style={[styles.cover, { height: COVER_HEIGHT + insets.top }]}>
          {coverUri ? (
            <Image source={{ uri: coverUri }} style={StyleSheet.absoluteFill} contentFit="contain" accessibilityLabel={`Couverture de ${name}`} />
          ) : (
            <LinearGradient colors={Gradients.banner} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          )}
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(9,16,36,0.20)' }]} />
          {/* Le fondu rejoint le fond juste sous le rang, avant les compteurs. */}
          <LinearGradient
            colors={['rgba(245,246,250,0)', 'rgba(245,246,250,0)', 'rgba(245,246,250,0.22)', 'rgba(245,246,250,0.76)', Colors.background]}
            locations={[0, 0.60, 0.79, 0.94, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </View>

        <View style={styles.column}>
          <View style={styles.identity}>
            <View style={styles.avatar}>
              <Avatar name={name} color={color} size={AVATAR_SIZE} uri={avatar} borderColor={Colors.background} />
            </View>
            <View style={styles.nameRow}>
              <AppText style={styles.name} numberOfLines={1}>
                {name}
              </AppText>
              {presence?.online && <View style={styles.online} accessibilityLabel="En ligne" />}
            </View>
            <View style={styles.rankRow}>
              <View style={styles.rankLine} />
              <AppText style={styles.rankBadge}>{title ?? titleForLevel(level.level)}</AppText>
              <View style={styles.rankLine} />
            </View>
            {locationLabel ? (
              <View style={styles.locationRow}>
                {country ? <View style={styles.flagCircle}><AppText style={styles.flagEmoji}>{countryFlag(country)}</AppText></View> : null}
                <AppText variant="caption" color={Colors.onAccent} numberOfLines={1}>{locationLabel}</AppText>
              </View>
            ) : null}
            {bio ? <AppText variant="caption" muted style={styles.bio}>{bio}</AppText> : null}
            {presence && (presence.online || presence.lastSeenAt) ? (
              <AppText variant="caption" muted>
                {presence.online ? 'En ligne' : `Actif ${timeAgo(presence.lastSeenAt!)}`}
              </AppText>
            ) : null}
          </View>

          {best && bestTheme && (
            <Tap
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/theme/[id]', params: { id: best.themeId } })}
              style={styles.ribbonWrap}>
              <LinearGradient colors={Gradients.accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.ribbon}>
                <View style={styles.metaRow}>
                  <Ionicons name="trophy" size={16} color={Colors.onAccent} />
                  <AppText style={styles.ribbonTitle} numberOfLines={1}>
                    Meilleur en {bestTheme.name}
                  </AppText>
                </View>
                <AppText style={styles.ribbonRank}>
                  {best.rank === 1 ? '1er' : `${best.rank}e`} sur {formatCount(best.players)} au classement mondial
                </AppText>
              </LinearGradient>
            </Tap>
          )}

          <View style={styles.counts}>
            <Count label="Duels" value={duels} highlight />
            <View style={styles.countDivider} />
            <Count
              label={profile && profile.followers > 1 ? 'Abonnés' : 'Abonné'}
              value={profile ? profile.followers : null}
              onPress={
                profile?.canSeeFollowers
                  ? () => router.push({ pathname: '/player/[id]/[list]', params: { id: profile.id, list: 'followers' } })
                  : undefined
              }
            />
            <View style={styles.countDivider} />
            <Count
              label={profile && profile.following > 1 ? 'Abonnements' : 'Abonnement'}
              value={profile ? profile.following : null}
              onPress={
                profile?.canSeeFollowing
                  ? () => router.push({ pathname: '/player/[id]/[list]', params: { id: profile.id, list: 'following' } })
                  : undefined
              }
            />
          </View>

          {actions && <View style={styles.actions}>{actions}</View>}
          {notices && <View style={styles.notices}>{notices}</View>}

          <View style={styles.tabs} accessibilityRole="tablist">
            {tabs.map((t) => {
              const selected = t.value === active.value;
              return (
                <Tap key={t.value} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => onTab(t.value)} style={styles.tab}>
                  <AppText style={[styles.tabLabel, selected && styles.tabLabelActive]} numberOfLines={1}>
                    {t.label}
                  </AppText>
                  {selected && <View style={styles.underline} />}
                </Tap>
              );
            })}
          </View>
          <View style={styles.body}>{active.render()}</View>
        </View>
      </ScrollView>

      <View style={[styles.topBar, { top: insets.top + Spacing.sm }]} pointerEvents="box-none">
        <CoverButton icon="chevron-back" label="Retour" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <View style={styles.topRight}>{topRight}</View>
      </View>
    </View>
  );
}

/** Bouton rond posé sur la couverture. */
export function CoverButton({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Tap accessibilityRole="button" accessibilityLabel={label} hitSlop={8} onPress={onPress} style={styles.coverButton}>
      <Ionicons name={icon} size={22} color="#FFFFFF" />
    </Tap>
  );
}

function Count({ label, value, highlight, onPress }: { label: string; value: number | null; highlight?: boolean; onPress?: () => void }) {
  return (
    <Tap accessibilityRole="button" accessibilityState={{ disabled: !onPress }} disabled={!onPress} onPress={onPress} style={styles.count}>
      <AppText style={[styles.countValue, highlight && { color: Colors.accent }]}>{value === null ? '–' : formatCount(value)}</AppText>
      <AppText variant="caption" muted numberOfLines={1}>
        {label}
      </AppText>
    </Tap>
  );
}

/** Totaux tous thèmes confondus. */
export function totalsOf(stats: Record<string, ThemeStats>) {
  return Object.values(stats).reduce(
    (t, s) => ({
      duels: t.duels + s.duels,
      wins: t.wins + s.wins,
      draws: t.draws + s.draws,
      correct: t.correct + s.correct,
      answered: t.answered + s.answered,
      correctMs: t.correctMs + s.totalCorrectResponseMs,
    }),
    { duels: 0, wins: 0, draws: 0, correct: 0, answered: 0, correctMs: 0 },
  );
}

/** Onglet principal : niveau, chiffres clés, répartition des résultats et thèmes favoris. */
export function ProfileOverview({
  xp,
  stats,
  history,
  onSeeThemes,
}: {
  xp: number;
  stats: Record<string, ThemeStats>;
  history: DuelRecord[];
  onSeeThemes: () => void;
}) {
  const level = levelFromXp(xp);
  const t = totalsOf(stats);
  const bestRating = Math.max(0, ...Object.values(stats).map((s) => s.rating));
  const favorites = Object.entries(stats)
    .filter(([id, s]) => s.duels > 0 && getTheme(id))
    .sort((a, b) => b[1].xp - a[1].xp)
    .slice(0, 4);
  return (
    <>
      <Card>
        <View style={styles.row}>
          <View>
            <AppText variant="heading">Niveau {level.level}</AppText>
            <AppText variant="caption" muted>
              {titleForLevel(level.level)}
            </AppText>
          </View>
          {bestRating > 0 && <DivisionBadge rating={bestRating} />}
        </View>
        <ProgressBar progress={level.progress} color={Colors.accent} />
        <AppText variant="caption" muted>
          {level.needed ? `${level.current} / ${level.needed} XP avant le niveau ${level.level + 1}` : 'Niveau maximum atteint'}
        </AppText>
      </Card>

      <View style={styles.grid}>
        <Tile label="Victoires" value={formatCount(t.wins)} />
        <Tile label="Précision" value={t.answered ? `${Math.round((t.correct / t.answered) * 100)} %` : '–'} />
        <Tile label="Temps moyen" value={t.correct ? `${(t.correctMs / t.correct / 1000).toFixed(1).replace('.', ',')} s` : '–'} />
        <Tile label="Série record" value={String(bestWinStreak(history))} />
      </View>

      <Card>
        <AppText variant="label">Statistiques</AppText>
        <OutcomeSplit wins={t.wins} draws={t.draws} losses={t.duels - t.wins - t.draws} />
      </Card>

      <Card>
        <View style={styles.row}>
          <AppText variant="label">Thèmes favoris</AppText>
          {favorites.length > 0 && (
            <Tap accessibilityRole="button" onPress={onSeeThemes} hitSlop={8}>
              <AppText variant="caption" color={Colors.accent}>
                Voir tout
              </AppText>
            </Tap>
          )}
        </View>
        {favorites.length === 0 ? (
          <AppText muted>Aucun thème joué pour le moment.</AppText>
        ) : (
          <View style={styles.grid}>
            {favorites.map(([id, s]) => {
              const theme = getTheme(id)!;
              const category = getCategory(theme.categoryId)!;
              return (
                <Tap
                  key={id}
                  accessibilityRole="button"
                  onPress={() => router.push({ pathname: '/theme/[id]', params: { id } })}
                  style={[styles.favorite, { backgroundColor: category.color + '1F', borderColor: category.color + '55' }]}>
                  <AppText style={{ fontSize: 22 }}>{category.icon}</AppText>
                  <View style={{ flex: 1 }}>
                    <AppText variant="label" numberOfLines={1}>
                      {theme.name}
                    </AppText>
                    <AppText variant="caption" color={category.color}>
                      Niv. {levelFromXp(s.xp).level}
                    </AppText>
                  </View>
                </Tap>
              );
            })}
          </View>
        )}
      </Card>
    </>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.tile}>
      <AppText variant="caption" muted>
        {label}
      </AppText>
      <AppText style={styles.tileValue}>{value}</AppText>
    </View>
  );
}

/** Barre victoires (vert) / nuls (jaune) / défaites (rouge), avec les pourcentages. */
export function OutcomeSplit({ wins, draws, losses }: { wins: number; draws: number; losses: number }) {
  const total = wins + draws + losses;
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  const values = [
    { label: 'Victoires', value: wins, color: Colors.correct },
    { label: 'Nuls', value: draws, color: Colors.gold },
    { label: 'Défaites', value: losses, color: Colors.wrong },
  ];
  return (
    <View style={{ gap: Spacing.sm }}>
      <View
        style={styles.split}
        accessible
        accessibilityLabel={total ? `${pct(wins)} % de victoires, ${pct(draws)} % de nuls, ${pct(losses)} % de défaites` : 'Aucun duel joué'}>
        {total === 0 ? (
          <View style={{ flex: 1, backgroundColor: Colors.surfaceRaised }} />
        ) : (
          values.filter((v) => v.value > 0).map((v) => <View key={v.label} style={{ flex: v.value, backgroundColor: v.color }} />)
        )}
      </View>
      <View style={styles.row}>
        {values.map((v) => (
          <AppText key={v.label} variant="caption" color={v.color}>
            {v.label} {pct(v.value)} %
          </AppText>
        ))}
      </View>
    </View>
  );
}

/** Tous les thèmes joués, du plus joué au moins joué. */
export function PlayedThemes({ stats }: { stats: Record<string, ThemeStats> }) {
  const entries = Object.entries(stats)
    .filter(([id, s]) => s.duels > 0 && getTheme(id))
    .sort((a, b) => b[1].duels - a[1].duels);
  if (entries.length === 0) {
    return (
      <Card>
        <AppText muted>Aucun thème joué pour le moment.</AppText>
      </Card>
    );
  }
  const maxDuels = entries[0][1].duels;
  return (
    <Card style={{ gap: Spacing.md }}>
      {entries.map(([id, s]) => {
        const theme = getTheme(id)!;
        const category = getCategory(theme.categoryId)!;
        return (
          <Tap key={id} accessibilityRole="button" onPress={() => router.push({ pathname: '/theme/[id]', params: { id } })} style={styles.played}>
            <AppText style={{ fontSize: 24 }}>{category.icon}</AppText>
            <View style={{ flex: 1, gap: Spacing.xs }}>
              <View style={styles.row}>
                <AppText variant="label" numberOfLines={1} style={{ flex: 1 }}>
                  {theme.name}
                </AppText>
                <AppText variant="caption" color={category.color}>
                  Niv. {levelFromXp(s.xp).level} · {s.duels} duel{s.duels > 1 ? 's' : ''}
                </AppText>
              </View>
              <View style={styles.track}>
                <View style={{ width: `${Math.max(5, (s.duels / maxDuels) * 100)}%`, height: '100%', borderRadius: 999, backgroundColor: category.color }} />
              </View>
            </View>
          </Tap>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  cover: { width: '100%', backgroundColor: Colors.navy, overflow: 'hidden' },
  column: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  identity: { alignItems: 'center', gap: 4, paddingHorizontal: Spacing.md, marginTop: -(AVATAR_SIZE + 70) },
  avatar: { borderRadius: 999, marginBottom: Spacing.xs, boxShadow: '0 6px 18px rgba(18, 26, 51, 0.22)' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, maxWidth: '100%' },
  name: { fontSize: 26, fontWeight: '800', letterSpacing: -0.4, color: Colors.onAccent, flexShrink: 1, textShadowColor: 'rgba(18,26,51,0.55)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8 },
  rankRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.xs, minWidth: 190 },
  rankLine: { flex: 1, height: 3, backgroundColor: Colors.gold, borderRadius: 2 },
  rankBadge: { color: Colors.text, backgroundColor: '#FFC928', paddingHorizontal: Spacing.md, paddingVertical: 3, borderRadius: 4, fontSize: 16, lineHeight: 21, fontWeight: '900' },
  online: { width: 12, height: 12, borderRadius: 6, backgroundColor: Colors.correct, borderWidth: 2, borderColor: Colors.background },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  locationRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, maxWidth: '100%' },
  flagCircle: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.92)', overflow: 'hidden' },
  flagEmoji: { fontSize: 13, lineHeight: 18 },
  bio: { maxWidth: '92%', textAlign: 'center' },
  ribbonWrap: { marginHorizontal: Spacing.md, marginTop: Spacing.md, borderRadius: Radius.sm, boxShadow: '0 6px 16px rgba(229, 21, 95, 0.28)' },
  ribbon: { alignItems: 'center', gap: 2, paddingVertical: Spacing.sm + 2, paddingHorizontal: Spacing.md, borderRadius: Radius.sm },
  ribbonTitle: { color: Colors.onAccent, fontSize: 16, fontWeight: '800' },
  ribbonRank: { color: 'rgba(255,255,255,0.88)', fontSize: 13 },
  counts: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.md,
    marginTop: Spacing.md,
    backgroundColor: 'transparent',
    borderRadius: Radius.md,
    paddingVertical: Spacing.sm,
  },
  count: { flex: 1, alignItems: 'center', minHeight: 48, justifyContent: 'center' },
  countValue: { fontSize: 20, fontWeight: '800', color: Colors.text },
  countDivider: { width: 1, alignSelf: 'stretch', backgroundColor: Colors.border },
  actions: { flexDirection: 'row', gap: Spacing.sm, marginHorizontal: Spacing.md, marginTop: Spacing.md },
  notices: { gap: Spacing.sm, marginHorizontal: Spacing.md, marginTop: Spacing.md },
  tabs: { flexDirection: 'row', marginTop: Spacing.lg, marginHorizontal: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  tab: { flexGrow: 1, alignItems: 'center', paddingHorizontal: 2, paddingBottom: Spacing.sm + 2 },
  tabLabel: { fontSize: 15, fontWeight: '700', color: Colors.textMuted },
  tabLabelActive: { color: Colors.text, fontWeight: '800' },
  underline: { position: 'absolute', bottom: -1, left: 6, right: 6, height: 4, borderRadius: 2, backgroundColor: Colors.accent },
  body: { gap: Spacing.md, padding: Spacing.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  tile: {
    flexGrow: 1,
    flexBasis: '45%',
    gap: 2,
    backgroundColor: Colors.surface,
    borderRadius: Radius.sm,
    padding: Spacing.sm + 4,
    boxShadow: '0 2px 12px rgba(18, 26, 51, 0.06)',
  },
  tileValue: { fontSize: 20, fontWeight: '800', color: Colors.text },
  favorite: { flexGrow: 1, flexBasis: '45%', flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderRadius: Radius.sm, borderWidth: 1, padding: Spacing.sm },
  split: { flexDirection: 'row', height: 14, borderRadius: 999, overflow: 'hidden', gap: 3 },
  played: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  track: { height: 7, borderRadius: 999, overflow: 'hidden', backgroundColor: Colors.surfaceRaised },
  topBar: { position: 'absolute', left: Spacing.md, right: Spacing.md, flexDirection: 'row', justifyContent: 'space-between' },
  topRight: { flexDirection: 'row', gap: Spacing.sm },
  coverButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(5, 10, 24, 0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
});
