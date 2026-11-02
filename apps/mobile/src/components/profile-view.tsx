import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { getCategory, getTheme, levelFromXp, titleForLevel, type PublicProfile } from '@qu1z/shared';

import { DivisionBadge, SectionHeader } from '@/components/social';
import { AppText, Avatar, Card, ProgressBar, Stat } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import type { Badge } from '@/game/badges';

export interface ShowcaseTheme {
  themeId: string;
  xp: number;
  rating: number;
}

export function ProfileHeader({
  name,
  color,
  title,
  bio,
  xp,
  actions,
}: {
  name: string;
  color: string;
  /** Titre équipé par le joueur (sinon, le titre de son niveau). */
  title?: string | null;
  bio?: string;
  xp: number;
  actions?: ReactNode;
}) {
  const level = levelFromXp(xp);
  return (
    <View style={styles.header}>
      <Avatar name={name} color={color} size={96} />
      <AppText variant="title">{name}</AppText>
      <AppText variant="label" color={Colors.gold}>
        {title ?? titleForLevel(level.level)} · Niveau {level.level}
      </AppText>
      {bio ? (
        <AppText muted style={{ textAlign: 'center' }}>
          {bio}
        </AppText>
      ) : null}
      <View style={{ width: '70%', gap: 4 }}>
        <ProgressBar progress={level.progress} />
        <AppText variant="caption" muted style={{ textAlign: 'center' }}>
          {xp} XP au total
        </AppText>
      </View>
      {actions}
    </View>
  );
}

/** Compteurs d'abonnés et d'abonnements (toujours visibles) ; les listes s'ouvrent si elles sont visibles. */
export function FollowCounts({ profile }: { profile: PublicProfile }) {
  const item = (label: string, value: number, which: 'followers' | 'following', canOpen: boolean) => (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !canOpen }}
      disabled={!canOpen}
      onPress={() => router.push({ pathname: '/player/[id]/[list]', params: { id: profile.id, list: which } })}
      style={styles.count}>
      <AppText variant="heading">{value}</AppText>
      <AppText variant="caption" muted>
        {label}
      </AppText>
    </Pressable>
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
    { value: wins, color: Colors.opponent },
    { value: draws, color: Colors.text },
    { value: losses, color: Colors.player },
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
          <AppText variant="caption" color={Colors.opponent}>
            {pct(wins)} % victoires
          </AppText>
          <AppText variant="caption">{pct(draws)} % nuls</AppText>
          <AppText variant="caption" color={Colors.player}>
            {pct(losses)} % défaites
          </AppText>
        </View>
      )}
    </View>
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
          <Pressable
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
          </Pressable>
        );
      })}
    </>
  );
}

export function BadgesGrid({ badges }: { badges: Badge[] }) {
  const unlocked = badges.filter((b) => b.unlocked).length;
  return (
    <>
      <SectionHeader title={`Badges · ${unlocked}/${badges.length}`} />
      <View style={styles.badges}>
        {badges.map((b) => (
          <View key={b.id} style={[styles.badge, !b.unlocked && { opacity: 0.35 }]}>
            <View style={[styles.badgeIcon, b.unlocked && { backgroundColor: Colors.gold }]}>
              <Ionicons name={b.unlocked ? b.icon : 'lock-closed'} size={22} color={b.unlocked ? Colors.background : Colors.textMuted} />
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
  counts: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.xl },
  count: { alignItems: 'center', paddingHorizontal: Spacing.sm, minHeight: 44, justifyContent: 'center' },
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
