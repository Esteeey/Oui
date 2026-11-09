import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Rect } from 'react-native-svg';

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

import { BannerCarousel } from '@/components/rank';
import { DivisionBadge, type IconName } from '@/components/social';
import { TitleDecor } from '@/components/title-decor';
import { AppText, Avatar, Card, ProgressBar, useNavBarSpace } from '@/components/ui';
import { Colors, Gradients, MaxContentWidth, Radius, Shadow, Spacing } from '@/constants/theme';
import { mediaUri } from '@/net/media';
import { bestWinStreak } from '@/state/progress';
import { formatCount } from '@/utils/format';
import { timeAgo } from '@/utils/time';
import { Tap } from '@/components/tap';
import { ThemeIcon } from '@/components/theme-icon';

const AVATAR_SIZE = 113;
/** Hauteur du fondu qui fait disparaître la couverture dans le fond du profil, derrière la première carte. */
const FADE_HEIGHT = 124;
const FADE_START = 'rgba(230, 227, 249, 0)';
/** Voile bleu nuit sur la couverture : léger en haut, presque opaque au niveau des actions. */
const COVER_SHADE = ['rgba(43, 52, 73, 0.2)', 'rgba(43, 52, 73, 0.45)', 'rgba(43, 52, 73, 0.97)'] as const;
const COVER_SHADE_STOPS = [0, 0.4, 0.72] as const;

export interface ProfileTab {
  value: string;
  label: string;
  render: () => ReactNode;
}

/**
 * Profil joueur (le sien comme celui des autres) : couverture derrière tout l'en-tête jusqu'en haut de l'écran,
 * photo ronde, identité, bandeau doré, compteurs, actions, statistiques, thèmes puis onglets.
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
  duels,
  profile,
  actions,
  topRight,
  notices,
  tag,
  stats,
  themesTitle = 'Mes thèmes',
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
  /** Messages et cartes affichés sous les actions (erreurs, choix du défi…). */
  notices?: ReactNode;
  /** Courte mention sous la biographie (« Te suit », profil privé). */
  tag?: string;
  /** Statistiques par thème ; absentes quand le profil n'est pas visible. */
  stats?: Record<string, ThemeStats>;
  themesTitle?: string;
  tabs: ProfileTab[];
  tab: string;
  onTab: (value: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const navSpace = useNavBarSpace();
  const coverUri = mediaUri(cover);
  const locationLabel = [city, countryName(country)].filter(Boolean).join(', ');
  const level = levelFromXp(xp);
  const active = tabs.find((t) => t.value === tab) ?? tabs[0];
  const presenceLabel = presence?.online ? 'En ligne' : presence?.lastSeenAt ? `Actif ${timeAgo(presence.lastSeenAt)}` : null;
  const totals = stats ? totalsOf(stats) : null;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: navSpace }} showsVerticalScrollIndicator={false}>
        <View style={[styles.hero, { paddingTop: insets.top + 40, paddingBottom: FADE_HEIGHT }]}>
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.coverLayer]}>
            {coverUri ? (
              <Image source={{ uri: coverUri }} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="top" accessibilityLabel={`Couverture de ${name}`} />
            ) : (
              <LinearGradient colors={Gradients.banner} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            )}
            <LinearGradient colors={COVER_SHADE} locations={COVER_SHADE_STOPS} style={StyleSheet.absoluteFill} />
            <LinearGradient colors={[FADE_START, Colors.profileBackground]} style={[styles.fade, { height: FADE_HEIGHT }]} />
          </View>

          <View style={styles.identity}>
            <View>
              <Avatar name={name} color={color} size={AVATAR_SIZE} uri={avatar} />
              {presence?.online && <View style={styles.online} accessibilityLabel="En ligne" />}
            </View>
            <AppText style={styles.name} numberOfLines={1}>
              {name}
            </AppText>
            <TitleDecor decor={profile?.decor ?? 'gris'} label={title ?? profile?.autoTitle ?? titleForLevel(level.level)} />
            {(locationLabel || presenceLabel) && (
              <View style={styles.metaRow}>
                {country ? <AppText style={styles.flag}>{countryFlag(country)}</AppText> : null}
                {locationLabel ? (
                  <AppText variant="caption" color={Colors.onAccent} numberOfLines={1} style={{ flexShrink: 1 }}>
                    {locationLabel}
                  </AppText>
                ) : null}
                {locationLabel && presenceLabel ? <View style={styles.metaDot} /> : null}
                {presence?.online ? <View style={styles.onlineSmall} /> : null}
                {presenceLabel ? (
                  <AppText variant="caption" color={Colors.onAccent} numberOfLines={1}>
                    {presenceLabel}
                  </AppText>
                ) : null}
              </View>
            )}
            {bio ? (
              <AppText color={Colors.onAccent} style={styles.bio}>
                {bio}
              </AppText>
            ) : null}
            {tag ? (
              <AppText variant="caption" color={Colors.onAccent} style={{ textAlign: 'center' }}>
                {tag}
              </AppText>
            ) : null}
            <BannerCarousel banners={profile?.banners ?? []} onOpen={(id) => router.push({ pathname: '/theme/[id]', params: { id } })} />
          </View>
          <View style={styles.counts}>
            <Count label={duels > 1 ? 'Parties jouées' : 'Partie jouée'} value={duels} color="#F9A8D9" />
            <View style={styles.countDivider} />
            <Count
              label={profile && profile.followers > 1 ? 'Abonnés' : 'Abonné'}
              value={profile ? profile.followers : null}
              color="#A5F0E8"
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
              color="#D9B8F7"
              onPress={
                profile?.canSeeFollowing
                  ? () => router.push({ pathname: '/player/[id]/[list]', params: { id: profile.id, list: 'following' } })
                  : undefined
              }
            />
          </View>

          {actions && <View style={styles.actions}>{actions}</View>}
          {notices && <View style={styles.notices}>{notices}</View>}
        </View>

        <View style={[styles.column, stats && totals ? { marginTop: 8 - FADE_HEIGHT } : null]}>
          {stats && totals && (
            <View style={styles.cards}>
              <StatsCard wins={totals.wins} draws={totals.draws} losses={Math.max(0, totals.duels - totals.wins - totals.draws)} onPress={() => onTab('duels')} />
              <ThemesCard title={themesTitle} stats={stats} onSeeAll={() => onTab('themes')} />
            </View>
          )}

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
        <CoverButton bare icon="chevron-back" label="Retour" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <View style={styles.topRight}>{topRight}</View>
      </View>
    </View>
  );
}

/** Bouton posé sur la couverture : rond, ou chevron seul avec `bare`. */
export function CoverButton({
  icon,
  label,
  onPress,
  bare,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  bare?: boolean;
}) {
  return (
    <Tap accessibilityRole="button" accessibilityLabel={label} hitSlop={8} onPress={onPress} style={[styles.coverButton, bare && styles.coverButtonBare]}>
      <Ionicons name={icon} size={bare ? 28 : 22} color={Colors.onAccent} />
    </Tap>
  );
}

/** Action blanche sous les compteurs (Jouer, Suivre, Message) : sans libellé, elle devient un carré. */
export function ProfileAction({
  label,
  accessibilityLabel,
  icon,
  color,
  disabled,
  primary,
  onPress,
}: {
  label?: string;
  accessibilityLabel?: string;
  icon: IconName;
  color: string;
  disabled?: boolean;
  /** Première action, légèrement plus large que la deuxième. */
  primary?: boolean;
  onPress: () => void;
}) {
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.action, label ? { flex: primary ? 1.1 : 1, paddingHorizontal: Spacing.xs } : styles.actionSquare, disabled && { opacity: 0.45 }]}>
      <Ionicons name={icon} size={24} color={color} />
      {label ? (
        <AppText color={color} style={styles.actionLabel} numberOfLines={1}>
          {label}
        </AppText>
      ) : null}
    </Tap>
  );
}

function Count({ label, value, color, onPress }: { label: string; value: number | null; color: string; onPress?: () => void }) {
  return (
    <Tap accessibilityRole="button" accessibilityState={{ disabled: !onPress }} disabled={!onPress} onPress={onPress} style={styles.count}>
      <AppText style={[styles.countValue, { color }]}>{value === null ? '–' : formatCount(value)}</AppText>
      <AppText variant="caption" color={Colors.onAccent} numberOfLines={1}>
        {label}
      </AppText>
    </Tap>
  );
}

/** Carte des statistiques de jeu : barre vert / jaune / rouge et trois pourcentages. */
function StatsCard({ wins, draws, losses, onPress }: { wins: number; draws: number; losses: number; onPress: () => void }) {
  const total = wins + draws + losses;
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  const values = [
    { label: 'Victoires', value: wins, color: '#25E16C' },
    { label: 'Matchs nuls', value: draws, color: '#FEC935' },
    { label: 'Défaites', value: losses, color: '#FE524C' },
  ];
  return (
    <Card style={[styles.cardGap, styles.profileCard]}>
      <Tap accessibilityRole="button" accessibilityLabel="Voir les duels" onPress={onPress} style={styles.cardHead}>
        <Svg width={22} height={20} viewBox="0 0 22 20">
          <Rect x={1} y={12} width={4} height={7} fill="#16C784" />
          <Rect x={6.5} y={8} width={4} height={11} fill="#12B5A6" />
          <Rect x={12} y={4} width={4} height={15} fill="#1E9BE8" />
          <Rect x={17.5} y={1} width={4} height={18} fill="#1E9BE8" />
          <Rect x={0} y={19} width={22} height={1} fill={Colors.ink} />
        </Svg>
        <AppText variant="heading" color={Colors.ink} style={styles.cardTitle}>
          Statistiques
        </AppText>
        <Ionicons name="chevron-forward" size={20} color={Colors.ink} />
      </Tap>
      <View
        style={styles.split}
        accessible
        accessibilityLabel={total ? `${pct(wins)} % de victoires, ${pct(draws)} % de matchs nuls, ${pct(losses)} % de défaites` : 'Aucun duel joué'}>
        {total === 0 ? (
          <View style={{ flex: 1, backgroundColor: Colors.surfaceRaised }} />
        ) : (
          values.filter((v) => v.value > 0).map((v) => <View key={v.label} style={{ flex: v.value, backgroundColor: v.color }} />)
        )}
      </View>
      <View style={styles.statColumns}>
        {values.map((v, i) => (
          <View key={v.label} style={[styles.statColumn, i > 0 && styles.statDivider]}>
            <View style={styles.statLabel}>
              <View style={[styles.statDot, { backgroundColor: v.color }]} />
              <AppText variant="caption" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={{ flexShrink: 1 }}>
                {v.label}
              </AppText>
            </View>
            <AppText style={styles.statValue}>{pct(v.value)} %</AppText>
          </View>
        ))}
      </View>
    </Card>
  );
}

/** Les cinq thèmes les plus travaillés : icône, nom et niveau dans la couleur de la catégorie. */
function ThemesCard({ title, stats, onSeeAll }: { title: string; stats: Record<string, ThemeStats>; onSeeAll: () => void }) {
  const themes = Object.entries(stats)
    .filter(([id, s]) => s.duels > 0 && getTheme(id))
    .sort((a, b) => b[1].xp - a[1].xp)
    .slice(0, 5);
  if (themes.length === 0) return null;
  return (
    <Card style={[styles.cardGap, styles.profileCard]}>
      <View style={styles.row}>
        <AppText variant="heading" color={Colors.ink} style={styles.cardTitle}>
          {title}
        </AppText>
        <Tap accessibilityRole="button" onPress={onSeeAll} hitSlop={8} style={styles.seeAll}>
          <AppText color={Colors.accent} style={{ fontSize: 13, lineHeight: 18, fontWeight: '600' }}>
            Voir tout
          </AppText>
          <Ionicons name="chevron-forward" size={15} color={Colors.accent} />
        </Tap>
      </View>
      <View style={styles.themeRow}>
        {themes.map(([id, s]) => {
          const theme = getTheme(id)!;
          const category = getCategory(theme.categoryId)!;
          return (
            <Tap key={id} accessibilityRole="button" onPress={() => router.push({ pathname: '/theme/[id]', params: { id } })} style={styles.themeItem}>
              <View style={[styles.themeTile, { backgroundColor: category.color + '33', borderColor: category.color + '55' }]}>
                <ThemeIcon themeId={id} size={38} />
              </View>
              <AppText variant="caption" numberOfLines={1} style={styles.themeName}>
                {theme.name}
              </AppText>
              <AppText variant="caption" color={category.color} style={styles.themeLevel}>
                Niv. {levelFromXp(s.xp).level}
              </AppText>
            </Tap>
          );
        })}
      </View>
    </Card>
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

/** Début de l'onglet « Fil » : niveau et chiffres clés. */
export function ProfileOverview({ xp, stats, history }: { xp: number; stats: Record<string, ThemeStats>; history: DuelRecord[] }) {
  const level = levelFromXp(xp);
  const t = totalsOf(stats);
  const bestRating = Math.max(0, ...Object.values(stats).map((s) => s.rating));
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
          {bestRating > 0 && <DivisionBadge rating={bestRating} compact />}
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
            <ThemeIcon themeId={id} size={36} />
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
  screen: { flex: 1, backgroundColor: Colors.profileBackground },
  hero: { width: '100%' },
  coverLayer: { overflow: 'hidden', backgroundColor: Colors.navy },
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  column: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  identity: { alignItems: 'center', gap: 2, paddingHorizontal: Spacing.md },
  name: { fontSize: 30, lineHeight: 40, fontWeight: '800', color: Colors.onAccent, maxWidth: '100%' },
  online: { position: 'absolute', right: 5, bottom: 7, width: 20, height: 20, borderRadius: 10, backgroundColor: '#25E16C', borderWidth: 2, borderColor: '#FBE3F1' },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, maxWidth: '100%', marginTop: 5 },
  flag: { fontSize: 14, lineHeight: 19 },
  metaDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: Colors.onAccent },
  onlineSmall: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#25E16C' },
  bio: { maxWidth: '92%', textAlign: 'center', fontSize: 14, lineHeight: 19 },
  counts: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.sm, marginTop: Spacing.sm },
  count: { flex: 1, alignItems: 'center', minHeight: 46, justifyContent: 'center' },
  countValue: { fontSize: 21, lineHeight: 28, fontWeight: '800' },
  countDivider: { width: 1, height: 34, backgroundColor: 'rgba(255, 255, 255, 0.7)' },
  actions: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', flexDirection: 'row', gap: 7, paddingHorizontal: 18, marginTop: Spacing.sm },
  action: { height: 39, borderRadius: 10, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, ...Shadow },
  actionSquare: { width: 65 },
  actionLabel: { fontSize: 15, lineHeight: 21, fontWeight: '800' },
  notices: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  cards: { gap: Spacing.sm + 1, marginHorizontal: 9 },
  cardGap: { gap: Spacing.sm + 4 },
  profileCard: { backgroundColor: Colors.profileCard, borderWidth: 0, borderRadius: Radius.md + 1 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  cardTitle: { flex: 1, fontSize: 17, lineHeight: 24, fontWeight: '800' },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  split: { flexDirection: 'row', height: 15, borderRadius: Radius.pill, overflow: 'hidden' },
  statColumns: { flexDirection: 'row' },
  statColumn: { flex: 1, alignItems: 'center', gap: 2, paddingHorizontal: 4 },
  statDivider: { borderLeftWidth: 1, borderLeftColor: '#D9D2E8' },
  statLabel: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%' },
  statDot: { width: 9, height: 9, borderRadius: 5 },
  statValue: { fontSize: 18, lineHeight: 25, fontWeight: '800', color: Colors.ink },
  themeRow: { flexDirection: 'row', gap: Spacing.xs },
  themeItem: { flex: 1, alignItems: 'center', gap: 3, maxWidth: '20%' },
  themeTile: { width: 55, height: 55, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  themeName: { fontSize: 11, lineHeight: 15, fontWeight: '600', textAlign: 'center', maxWidth: '100%' },
  themeLevel: { fontSize: 13, lineHeight: 18, fontWeight: '700' },
  tabs: { flexDirection: 'row', marginTop: Spacing.md, marginHorizontal: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  tab: { flexGrow: 1, alignItems: 'center', paddingHorizontal: 2, paddingBottom: Spacing.sm + 2, paddingTop: Spacing.xs },
  tabLabel: { fontSize: 14, fontWeight: '600', color: Colors.textMuted },
  tabLabelActive: { color: Colors.text },
  underline: { position: 'absolute', bottom: -1, left: 6, right: 6, height: 3, backgroundColor: Colors.accent },
  body: { gap: Spacing.sm + 4, padding: Spacing.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  tile: {
    flexGrow: 1,
    flexBasis: '45%',
    gap: 2,
    backgroundColor: Colors.surface,
    borderRadius: Radius.sm,
    padding: Spacing.sm + 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    ...Shadow,
  },
  tileValue: { fontSize: 20, lineHeight: 27, fontWeight: '800', color: Colors.text },
  played: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  track: { height: 7, borderRadius: 999, overflow: 'hidden', backgroundColor: Colors.surfaceRaised },
  topBar: { position: 'absolute', left: Spacing.md, right: Spacing.md, flexDirection: 'row', justifyContent: 'space-between' },
  topRight: { flexDirection: 'row', gap: Spacing.sm },
  coverButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(14, 15, 43, 0.45)',
  },
  coverButtonBare: { backgroundColor: 'transparent' },
});
