import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import Svg, { Circle, Path, Polygon } from 'react-native-svg';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { getCategory, getTheme, levelFromXp, titleForLevel, type PublicProfile } from '@qu1z/shared';

import { DivisionBadge, SectionHeader } from '@/components/social';
import { AppText, Avatar, Card, ProgressBar, Stat } from '@/components/ui';
import { Colors, Gradients, Radius, Spacing } from '@/constants/theme';
import type { Badge } from '@/game/badges';
import { mediaUri } from '@/net/media';
import { Tap } from '@/components/tap';

export interface ShowcaseTheme {
  themeId: string;
  xp: number;
  rating: number;
  duels?: number;
}

export function ProfileHeader({
  name,
  color,
  avatar,
  cover,
  title,
  bio,
  xp,
  actions,
  compactPlayer = false,
  avatarSize = 96,
  showXpProgress = true,
}: {
  name: string;
  color: string;
  avatar?: string | null;
  /** Photo de couverture (bandeau 3:1), sinon dégradé de l'application. */
  cover?: string | null;
  /** Titre équipé par le joueur (sinon, le titre de son niveau). */
  title?: string | null;
  bio?: string;
  xp: number;
  actions?: ReactNode;
  /** Présentation compacte bleu nuit des profils publics. */
  compactPlayer?: boolean;
  avatarSize?: number;
  showXpProgress?: boolean;
}) {
  const level = levelFromXp(xp);
  const coverUri = mediaUri(cover);
  return (
    <View style={[styles.header, compactPlayer && styles.playerHeader]}>
      <View style={[styles.cover, compactPlayer && styles.playerCover]}>
        {compactPlayer ? (
          <>
            <View style={[StyleSheet.absoluteFill, { backgroundColor: Colors.navy }]} />
            <Svg style={StyleSheet.absoluteFill} viewBox="0 0 400 250" preserveAspectRatio="none">
              <Polygon points="0,0 125,0 0,74" fill="#1262F5" />
              <Polygon points="0,92 155,28 0,126" fill="#0877FF" />
              <Polygon points="0,190 50,170 0,226" fill="#F22C67" />
              <Polygon points="400,0 342,0 290,64" fill="#F22C67" />
              <Polygon points="400,80 322,122 400,106" fill="#F22C67" />
              <Polygon points="400,164 354,250 400,218" fill="#114DAE" />
              <Path d="M145 218 C112 198 111 162 132 137 M255 218 C288 198 289 162 268 137" fill="none" stroke="#FFC928" strokeWidth="3" />
              <Path d="M133 204 l-15 -5 M124 190 l-15 -10 M120 174 l-12 -12 M121 158 l-8 -15 M127 145 l-4 -14 M267 204 l15 -5 M276 190 l15 -10 M280 174 l12 -12 M279 158 l8 -15 M273 145 l4 -14" fill="none" stroke="#FFC928" strokeWidth="5" strokeLinecap="round" />
            </Svg>
          </>
        ) : coverUri ? (
          <Image source={{ uri: coverUri }} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel={`Couverture de ${name}`} />
        ) : (
          <LinearGradient colors={Gradients.banner} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        )}
      </View>
      <View style={[styles.avatarOnCover, compactPlayer && styles.playerAvatarOnCover]}>
        <Avatar name={name} color={color} size={avatarSize} uri={avatar} />
      </View>
      <AppText variant="title">{name}</AppText>
      <AppText variant="label" color={Colors.gold} style={compactPlayer && styles.playerTitle}>
        {title ?? titleForLevel(level.level)}
        {!compactPlayer && ` · Niveau ${level.level}`}
      </AppText>
      {compactPlayer && <AppText variant="caption" color={Colors.onAccent}>Niveau {level.level}</AppText>}
      {bio ? (
        <AppText muted style={{ textAlign: 'center' }}>
          {bio}
        </AppText>
      ) : null}
      {showXpProgress && (
        <View style={{ width: '70%', gap: 4 }}>
          <ProgressBar progress={level.progress} />
          <AppText variant="caption" muted style={{ textAlign: 'center' }}>
            {xp} XP au total
          </AppText>
        </View>
      )}
      {actions}
    </View>
  );
}

/** Compteurs d'abonnés et d'abonnements (toujours visibles) ; les listes s'ouvrent si elles sont visibles. */
export function FollowCounts({ profile }: { profile: PublicProfile }) {
  const item = (label: string, value: number, which: 'followers' | 'following', canOpen: boolean) => (
    <Tap
      accessibilityRole="button"
      accessibilityState={{ disabled: !canOpen }}
      disabled={!canOpen}
      onPress={() => router.push({ pathname: '/player/[id]/[list]', params: { id: profile.id, list: which } })}
      style={styles.count}>
      <AppText variant="heading">{value}</AppText>
      <AppText variant="caption" muted>
        {label}
      </AppText>
    </Tap>
  );
  return (
    <View style={styles.counts}>
      {item(profile.followers > 1 ? 'Abonnés' : 'Abonné', profile.followers, 'followers', profile.canSeeFollowers)}
      {item(profile.following > 1 ? 'Abonnements' : 'Abonnement', profile.following, 'following', profile.canSeeFollowing)}
    </View>
  );
}

export function StatsCard({ stats }: { stats: { label: string; value: string }[] }) {
  return (
    <Card style={{ flexDirection: 'row' }}>
      {stats.map((s) => (
        <Stat key={s.label} label={s.label} value={s.value} />
      ))}
    </Card>
  );
}

/** Barre de répartition des résultats : victoires, nuls, défaites. */
export function OutcomeBar({ wins, draws, losses }: { wins: number; draws: number; losses: number }) {
  const total = wins + draws + losses;
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  const segments = [
    { value: wins, color: Colors.correct },
    { value: draws, color: Colors.gold },
    { value: losses, color: Colors.wrong },
  ].filter((s) => s.value > 0);

  return (
    <View style={styles.outcome}>
      <View
        accessible
        accessibilityLabel={
          total
            ? `${pct(wins)} % de victoires, ${pct(draws)} % de nuls, ${pct(losses)} % de défaites`
            : 'Aucun duel joué'
        }
        style={styles.outcomeBar}>
        {total === 0 ? (
          <View style={{ flex: 1, backgroundColor: Colors.surfaceRaised }} />
        ) : (
          segments.map((s, i) => <View key={i} style={{ flex: s.value, backgroundColor: s.color }} />)
        )}
      </View>
      {total === 0 ? (
        <AppText variant="caption" muted>
          Pas encore de duel joué.
        </AppText>
      ) : (
        <View style={styles.outcomeLegend}>
          <AppText variant="caption" color={Colors.correct}>
            {pct(wins)} % victoires
          </AppText>
          <AppText variant="caption" color={Colors.gold}>{pct(draws)} % nuls</AppText>
          <AppText variant="caption" color={Colors.wrong}>
            {pct(losses)} % défaites
          </AppText>
        </View>
      )}
    </View>
  );
}

/** Statistiques de duel d'un profil public, séparées du fil d'activité. */
export function PlayerStatistics({
  wins,
  draws,
  losses,
}: {
  wins: number;
  draws: number;
  losses: number;
}) {
  const values = [
    { label: 'Victoires', value: wins, icon: 'trophy' as const, color: Colors.correct },
    { label: 'Nuls', value: draws, icon: 'hand-left' as const, color: Colors.gold },
    { label: 'Défaites', value: losses, icon: 'close' as const, color: Colors.wrong },
  ];
  const total = wins + draws + losses;
  return (
    <Card style={styles.playerStats}>
      <View style={styles.panelHeading}>
        <AppText variant="heading">Statistiques</AppText>
        <AppText variant="caption" muted>{total.toLocaleString('fr-FR')} parties</AppText>
      </View>
      <View style={styles.playerStatsValues}>
        {values.map((item) => (
          <View key={item.label} style={styles.playerStatValue}>
            <Ionicons name={item.icon} size={17} color={item.color} />
            <AppText variant="score" color={item.color} style={styles.playerStatNumber}>{item.value.toLocaleString('fr-FR')}</AppText>
            <AppText variant="caption" muted>{item.label}</AppText>
          </View>
        ))}
      </View>
      <OutcomeBar wins={wins} draws={draws} losses={losses} />
    </Card>
  );
}

/** Donut de répartition des parties, avec le niveau atteint dans chaque thème joué. */
export function PlayerTopics({ themes }: { themes: ShowcaseTheme[] }) {
  const items = themes
    .map((item) => {
      const theme = getTheme(item.themeId);
      const category = theme ? getCategory(theme.categoryId) : undefined;
      return theme && category ? { ...item, theme, category, level: levelFromXp(item.xp) } : null;
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
  const totalDuels = items.reduce((sum, item) => sum + (item.duels ?? 0), 0);
  const circumference = 2 * Math.PI * 72;
  let offset = 0;

  if (items.length === 0) return null;
  return (
    <Card style={styles.playerTopics}>
      <View style={styles.panelHeading}>
        <AppText variant="heading">Thèmes joués</AppText>
        <AppText variant="caption" muted>{items.length} thèmes</AppText>
      </View>
      <View style={styles.topicsDonutWrap}>
        <Svg width={188} height={188} viewBox="0 0 188 188">
          <Circle cx="94" cy="94" r="72" fill="none" stroke={Colors.surfaceRaised} strokeWidth="24" />
          {items.map((item) => {
            const weight = item.duels ?? 0;
            const fraction = totalDuels > 0 ? weight / totalDuels : 1 / items.length;
            const length = Math.max(0, fraction * circumference - 3);
            const currentOffset = offset;
            offset += fraction * circumference;
            return (
              <Circle
                key={item.themeId}
                cx="94"
                cy="94"
                r="72"
                fill="none"
                stroke={item.category.color}
                strokeWidth="24"
                strokeDasharray={`${length} ${circumference}`}
                strokeDashoffset={-currentOffset}
                rotation={-90}
                origin="94, 94"
              />
            );
          })}
        </Svg>
        <View pointerEvents="none" style={styles.topicsDonutCenter}>
          <AppText variant="caption" muted>PARTIES</AppText>
          <AppText variant="heading">{totalDuels.toLocaleString('fr-FR')}</AppText>
        </View>
      </View>
      <View style={styles.topicRows}>
        {items.map((item) => (
          <Tap
            key={item.themeId}
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/theme/[id]', params: { id: item.themeId } })}
            style={styles.topicRow}>
            <AppText style={styles.topicIcon}>{item.category.icon}</AppText>
            <View style={{ flex: 1, gap: 5 }}>
              <AppText variant="label" numberOfLines={1}>{item.theme.name}</AppText>
              <ProgressBar progress={item.level.progress} color={item.category.color} height={6} />
            </View>
            <View style={styles.topicLevel}>
              <AppText variant="caption" color={item.category.color}>Niv. {item.level.level}</AppText>
              <AppText variant="caption" muted>{item.duels ?? 0} parties</AppText>
            </View>
          </Tap>
        ))}
      </View>
    </Card>
  );
}

export function Showcase({ title, themes }: { title: string; themes: ShowcaseTheme[] }) {
  return (
    <>
      <SectionHeader title={title} />
      {themes.map((t) => {
        const theme = getTheme(t.themeId)!;
        const category = getCategory(theme.categoryId)!;
        const level = levelFromXp(t.xp);
        return (
          <Tap
            key={t.themeId}
            onPress={() => router.push({ pathname: '/theme/[id]', params: { id: t.themeId } })}
            style={[styles.theme, { borderLeftColor: category.color }]}>
            <AppText style={{ fontSize: 26 }}>{category.icon}</AppText>
            <View style={{ flex: 1, gap: 4 }}>
              <AppText variant="label">{theme.name}</AppText>
              <ProgressBar progress={level.progress} color={category.color} height={6} />
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <AppText variant="caption" color={category.color}>
                Niv. {level.level}
              </AppText>
              <DivisionBadge rating={t.rating} compact />
            </View>
          </Tap>
        );
      })}
    </>
  );
}

export function BadgesGrid({ badges }: { badges: Badge[] }) {
  const unlocked = badges.filter((b) => b.unlocked).length;
  return (
    <>
      <SectionHeader title={`Médailles · ${unlocked}/${badges.length}`} />
      <View style={styles.badges}>
        {badges.map((b) => (
          <View key={b.id} style={[styles.badge, !b.unlocked && { opacity: 0.35 }]}>
            <View style={[styles.badgeIcon, b.unlocked && { backgroundColor: Colors.gold }]}>
              <Ionicons name={b.unlocked ? b.icon : 'lock-closed'} size={22} color={b.unlocked ? Colors.onAccent : Colors.textMuted} />
            </View>
            <AppText variant="caption" style={{ textAlign: 'center' }} numberOfLines={1}>
              {b.name}
            </AppText>
            <AppText variant="caption" muted style={{ textAlign: 'center', fontSize: 11 }} numberOfLines={2}>
              {b.description}
            </AppText>
          </View>
        ))}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', gap: Spacing.sm, paddingTop: Spacing.sm },
  playerHeader: { marginHorizontal: -Spacing.md, paddingHorizontal: Spacing.md, paddingTop: 0, paddingBottom: Spacing.md, backgroundColor: Colors.navy, overflow: 'hidden' },
  playerCover: { position: 'absolute', top: 0, left: 0, right: 0, height: 250, aspectRatio: undefined, borderRadius: 0, backgroundColor: Colors.navy },
  playerAvatarOnCover: { marginTop: 82, marginBottom: 0, boxShadow: '0 2px 10px rgba(0,0,0,0.25)' },
  playerTitle: { backgroundColor: Colors.gold, color: Colors.navy, paddingHorizontal: 16, paddingVertical: 5, borderRadius: Radius.pill, overflow: 'hidden' },
  cover: { alignSelf: 'stretch', aspectRatio: 3, borderRadius: Radius.md, overflow: 'hidden', backgroundColor: Colors.surfaceRaised },
  /** La photo de profil chevauche le bas de la couverture. */
  avatarOnCover: { marginTop: -48 - Spacing.sm, borderRadius: 999, boxShadow: '0 4px 14px rgba(18, 26, 51, 0.18)' },
  counts: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.xl },
  count: { alignItems: 'center', paddingHorizontal: Spacing.sm, minHeight: 44, justifyContent: 'center' },
  playerStats: { gap: Spacing.md },
  panelHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  playerStatsValues: { flexDirection: 'row', alignItems: 'center' },
  playerStatValue: { flex: 1, alignItems: 'center', gap: 3, paddingVertical: Spacing.xs },
  playerStatNumber: { fontSize: 24 },
  playerTopics: { gap: Spacing.md },
  topicsDonutWrap: { alignSelf: 'center', width: 188, height: 188, alignItems: 'center', justifyContent: 'center' },
  topicsDonutCenter: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  topicRows: { gap: Spacing.sm },
  topicRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.xs },
  topicIcon: { width: 32, textAlign: 'center', fontSize: 22 },
  topicLevel: { alignItems: 'flex-end', minWidth: 72, gap: 2 },
  theme: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderLeftWidth: 6,
    padding: Spacing.md,
  },
  outcome: { gap: Spacing.sm },
  outcomeBar: { flexDirection: 'row', height: 14, borderRadius: 999, overflow: 'hidden', gap: 3 },
  outcomeLegend: { flexDirection: 'row', justifyContent: 'space-between' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -Spacing.xs },
  badge: { width: '25%', alignItems: 'center', gap: 4, padding: Spacing.xs, marginBottom: Spacing.sm },
  badgeIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
