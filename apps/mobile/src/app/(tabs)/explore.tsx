import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { CATEGORIES, THEMES, getTheme, levelFromXp, themesOf, type Category } from '@qu1z/shared';

import { HeaderButton } from '@/components/header';
import { AppText, Avatar, Screen } from '@/components/ui';
import { Colors, Radius, Shadow, Spacing } from '@/constants/theme';
import { useProgress } from '@/state/progress';
import { avatarColor } from '@/utils/avatar';
import { ThemeIcon } from '@/components/theme-icon';
import { Tap } from '@/components/tap';

function normalize(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function chooseThree<T extends { category: Category }>(groups: T[], previousIds: string[] = []): T[] {
  const shuffled = [...groups];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  let selected = shuffled.slice(0, 3);
  if (shuffled.length > 3 && selected.length === 3 && selected.every((group) => previousIds.includes(group.category.id))) {
    selected = shuffled.slice(1, 4);
  }
  return selected;
}

export default function ExploreScreen() {
  const { stats, history } = useProgress();
  const [query, setQuery] = useState('');
  const q = normalize(query.trim());
  const allGroups = useMemo(() => CATEGORIES
    .map((category) => ({ category, themes: themesOf(category.id).filter((theme) => !q || normalize(`${theme.name} ${category.name}`).includes(q)) }))
    .filter((group) => group.themes.length > 0), [q]);
  const [visibleCategoryIds, setVisibleCategoryIds] = useState<string[]>(() => chooseThree(allGroups).map((group) => group.category.id));
  const firstFocus = useRef(true);
  useFocusEffect(useCallback(() => {
    if (firstFocus.current) {
      firstFocus.current = false;
      return;
    }
    setVisibleCategoryIds((previous) => chooseThree(allGroups, previous).map((group) => group.category.id));
  }, [allGroups]));
  const selectedGroups = allGroups.filter((group) => visibleCategoryIds.includes(group.category.id));
  const groups = selectedGroups.length || !allGroups.length ? selectedGroups : allGroups.slice(0, 3);
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

      {groups.length ? groups.map(({ category, themes }, index) => (
        <CategoryStrip key={category.id} category={category} themeIds={themes.map((theme) => theme.id)} index={index} stats={stats} />
      )) : (
        <AppText muted style={styles.noResults}>Aucun thème trouvé pour « {query} ».</AppText>
      )}

      {!q && recentDuels.length > 0 && <DuelHistory duels={recentDuels} />}
    </Screen>
  );
}

function CategoryStrip({ category, themeIds, index, stats }: { category: Category; themeIds: string[]; index: number; stats: ReturnType<typeof useProgress>['stats'] }) {
  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 35).duration(220)} style={styles.categorySection}>
      <View style={styles.sectionHeading}>
        <AppText variant="heading" style={styles.categoryTitle}>{category.name}</AppText>
        <Tap
          accessibilityRole="button"
          accessibilityLabel={`Voir tous les thèmes de ${category.name}`}
          onPress={() => router.push({ pathname: '/category/[id]', params: { id: category.id } })}
          style={styles.seeAllHit}>
          <View style={styles.seeAll}>
            <AppText style={styles.seeAllText}>Tout voir</AppText>
          </View>
        </Tap>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.themeStrip}>
        {themeIds.slice(0, 5).map((id) => <ThemeTile key={id} themeId={id} color={category.color} xp={stats[id]?.xp ?? 0} />)}
      </ScrollView>
      <View style={styles.divider} />
    </Animated.View>
  );
}

function ThemeTile({ themeId, color, xp }: { themeId: string; color: string; xp: number }) {
  const theme = THEMES.find((item) => item.id === themeId)!;
  const level = levelFromXp(xp).level;
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={`${theme.name}, niveau ${level}`}
      onPress={() => router.push({ pathname: '/theme/[id]', params: { id: themeId } })}
      style={styles.themeTile}>
      <View style={[styles.themeArtwork, { backgroundColor: color }]}>
        <ThemeIcon themeId={themeId} size={48} />
      </View>
      <AppText numberOfLines={2} style={styles.themeName}>{theme.name}</AppText>
    </Tap>
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
        <Tap accessibilityRole="button" accessibilityLabel="Voir les duels sur mon profil" onPress={() => router.push('/profile')} style={styles.seeAllHit}>
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
        <Avatar name={duel.opponentName} color={avatarColor(id)} size={42} />
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
  historyCard: { marginTop: 6, padding: Spacing.sm, backgroundColor: Colors.surface, borderRadius: Radius.md, ...Shadow },
  historyTitle: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  historyDivider: { height: StyleSheet.hairlineWidth, backgroundColor: Colors.border, marginTop: Spacing.xs },
  duelStrip: { gap: Spacing.md, paddingHorizontal: Spacing.xs, paddingTop: 6, paddingBottom: Spacing.xs },
  duelItem: { width: 66, alignItems: 'center', gap: 4 },
  avatarRing: { width: 48, height: 48, borderWidth: 2.5, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  duelNameRow: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 },
  duelName: { flexShrink: 1, fontSize: 11, fontWeight: '600' },
});
