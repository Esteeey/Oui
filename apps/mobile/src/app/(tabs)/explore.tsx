import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { CATEGORIES, THEMES, getTheme, themesOf } from '@qu1z/shared';

import { HeaderButton } from '@/components/header';
import { AppText, Avatar, Screen } from '@/components/ui';
import { Colors, Radius, Shadow, Spacing } from '@/constants/theme';
import { useProgress } from '@/state/progress';
import { avatarColor } from '@/utils/avatar';
import { ThemeIcon } from '@/components/theme-icon';
import { ThemeMosaicTile } from '@/components/theme-mosaic-tile';
import { Tap } from '@/components/tap';

function normalize(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export default function ExploreScreen() {
  const { stats, history } = useProgress();
  const [query, setQuery] = useState('');
  const q = normalize(query.trim());
  const allGroups = useMemo(() => CATEGORIES
    .map((category) => ({ category, themes: themesOf(category.id).filter((theme) => !q || normalize(`${theme.name} ${category.name}`).includes(q)) }))
    .filter((group) => group.themes.length > 0), [q]);
  const matches = useMemo(() => allGroups.flatMap((group) => group.themes.map((theme) => theme.id)), [allGroups]);
  // Mur : tes thèmes les plus joués d'abord, puis une sélection mélangée pour découvrir.
  const discover = useMemo(() => THEMES.map((theme) => theme.id).sort(() => Math.random() - 0.5), []);
  const wall = useMemo(() => {
    const played = Object.entries(stats).filter(([id, st]) => id !== FEATURED && (st?.xp ?? 0) > 0 && getTheme(id)).sort((x, y) => (y[1]?.xp ?? 0) - (x[1]?.xp ?? 0)).map(([id]) => id);
    return [...played, ...discover.filter((id) => id !== FEATURED && !played.includes(id))].slice(0, 10);
  }, [stats, discover]);
  const recentDuels = history.slice(0, 5);

  return (
    <Screen inTabs title="Thèmes" headerRight={<HeaderButton icon="search" label="Rechercher" onPress={() => router.push('/search')} />}>
      <View style={styles.search}>
        <Ionicons name="search" size={19} color={Colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Rechercher un thème…"
          placeholderTextColor={Colors.textMuted}
          accessibilityLabel="Rechercher un thème"
          returnKeyType="search"
          style={styles.input}
        />
        {!!query && <Tap accessibilityRole="button" accessibilityLabel="Effacer la recherche" onPress={() => setQuery('')}><Ionicons name="close-circle" size={19} color={Colors.textMuted} /></Tap>}
      </View>

      {q ? (
        matches.length ? <Mosaic ids={matches} stats={stats} /> : <AppText muted style={styles.noResults}>Aucun thème trouvé pour « {query} ».</AppText>
      ) : (
        <Mosaic ids={wall} stats={stats} featured={FEATURED} />
      )}

      <Tap
        accessibilityRole="button"
        accessibilityLabel={`Voir tous les thèmes, ${THEMES.length} thèmes`}
        onPress={() => router.push('/all-themes' as Href)}
        style={styles.allThemes}>
        <View style={styles.allThemesIcon}>
          <Ionicons name="grid" size={20} color="#FFFFFF" />
        </View>
        <View style={{ flex: 1 }}>
          <AppText style={styles.allThemesTitle}>Voir tous les thèmes</AppText>
          <AppText muted style={styles.allThemesSub}>{THEMES.length} thèmes rangés par catégorie</AppText>
        </View>
        <Ionicons name="chevron-forward" size={20} color={Colors.accent} />
      </Tap>

      {!q && recentDuels.length > 0 && <DuelHistory duels={recentDuels} />}
    </Screen>
  );
}

/** Thème mis à la une en grande tuile. */
const FEATURED = 'geo-drapeaux';

function Mosaic({ ids, stats, featured }: { ids: string[]; stats: ReturnType<typeof useProgress>['stats']; featured?: string }) {
  const xp = (id: string) => stats[id]?.xp ?? 0;
  const head = featured ? ids.slice(0, 2) : [];
  const rest = featured ? ids.slice(2) : ids;
  const rows: string[][] = [];
  for (let i = 0; i < rest.length; i += 2) rows.push(rest.slice(i, i + 2));
  return (
    <Animated.View entering={FadeInDown.duration(220)} style={styles.mosaic}>
      {featured && (
        <View style={styles.row}>
          <ThemeMosaicTile themeId={featured} xp={xp(featured)} big badge="À la une" />
          <View style={styles.column}>
            {head.map((id) => <ThemeMosaicTile key={id} themeId={id} xp={xp(id)} />)}
          </View>
        </View>
      )}
      {rows.map((row) => (
        <View key={row.join()} style={styles.row}>
          {row.map((id) => <ThemeMosaicTile key={id} themeId={id} xp={xp(id)} />)}
          {row.length === 1 && <View style={{ flex: 1 }} />}
        </View>
      ))}
    </Animated.View>
  );
}

function DuelHistory({ duels }: { duels: ReturnType<typeof useProgress>['history'] }) {
  return (
    <View style={styles.historyCard}>
      <View style={styles.sectionHeading}>
        <View style={styles.historyTitle}>
          <Ionicons name="trophy" size={21} color={Colors.navy} />
          <AppText variant="heading" style={styles.categoryTitle}>Historique de duel</AppText>
        </View>
        <Tap accessibilityRole="button" accessibilityLabel="Voir tout l’historique de duel" onPress={() => router.push('/duels')} style={styles.seeAllHit}>
          <View style={styles.seeAll}>
            <AppText style={styles.seeAllText}>Tout voir</AppText>
          </View>
        </Tap>
      </View>
      <View style={styles.historyDivider} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.duelStrip}>
        {duels.map((duel) => <DuelHistoryItem key={duel.id} duel={duel} />)}
      </ScrollView>
    </View>
  );
}

function DuelHistoryItem({ duel }: { duel: ReturnType<typeof useProgress>['history'][number] }) {
  const theme = getTheme(duel.themeId);
  const ringColor = duel.outcome === 'win' ? Colors.correct : duel.outcome === 'loss' ? Colors.wrong : Colors.gold;
  const id = duel.opponentId ?? duel.opponentName;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${duel.opponentName}, duel de ${theme?.name ?? 'quiz'}`}
      disabled={!duel.opponentId}
      onPress={() => duel.opponentId && router.push({ pathname: '/player/[id]', params: { id: duel.opponentId } })}
      style={({ pressed }) => [styles.duelItem, pressed && { opacity: 0.7 }]}>
      <View style={[styles.avatarRing, { borderColor: ringColor }]}>
        <Avatar name={duel.opponentName} color={avatarColor(id)} size={42} uri={duel.opponentAvatar} />
      </View>
      <View style={styles.duelNameRow}>
        {theme && <ThemeIcon themeId={theme.id} size={16} />}
        <AppText numberOfLines={1} style={styles.duelName}>{duel.opponentName}</AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  search: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.md,
    ...Shadow,
  },
  input: { flex: 1, color: Colors.text, fontSize: 14, paddingVertical: 6 },
  mosaic: { gap: 10 },
  row: { flexDirection: 'row', gap: 10 },
  column: { flex: 1, gap: 10 },
  noResults: { paddingVertical: Spacing.lg, textAlign: 'center' },
  categorySection: { marginTop: 4 },
  sectionHeading: { zIndex: 1, minHeight: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  categoryTitle: { fontSize: 16, fontWeight: '800' },
  seeAllHit: { paddingVertical: 8, marginVertical: -8 },
  seeAll: { borderWidth: 1, borderColor: Colors.accent, borderRadius: Radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  seeAllText: { color: Colors.accentInk, fontSize: 12, fontWeight: '700' },
  themeStrip: { gap: 4, paddingTop: 2, paddingBottom: 1 },
  themeTile: { width: 92, alignItems: 'center', gap: 2 },
  themeArtwork: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 12, ...Shadow },
  themeName: { minHeight: 28, width: '100%', color: Colors.text, fontSize: 11, lineHeight: 14, fontWeight: '600', textAlign: 'center' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: Colors.border, marginTop: 3 },
  allThemes: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: 6, padding: Spacing.sm, backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.accent, ...Shadow },
  allThemesIcon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.accent },
  allThemesTitle: { fontSize: 15, fontWeight: '800', color: Colors.text },
  allThemesSub: { fontSize: 12 },
  historyCard: { marginTop: 6, padding: Spacing.sm, backgroundColor: Colors.surface, borderRadius: Radius.md, ...Shadow },
  historyTitle: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  historyDivider: { height: StyleSheet.hairlineWidth, backgroundColor: Colors.border, marginTop: Spacing.xs },
  duelStrip: { gap: Spacing.md, paddingHorizontal: Spacing.xs, paddingTop: 6, paddingBottom: Spacing.xs },
  duelItem: { width: 66, alignItems: 'center', gap: 4 },
  avatarRing: { width: 48, height: 48, borderWidth: 2.5, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  duelNameRow: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 },
  duelName: { flexShrink: 1, fontSize: 11, fontWeight: '600' },
});
