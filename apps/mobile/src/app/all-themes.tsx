import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { CATEGORIES, levelFromXp, themesOf } from '@qu1z/shared';

import { AppText, Screen } from '@/components/ui';
import { ThemeIcon } from '@/components/theme-icon';
import { Tap } from '@/components/tap';
import { Colors, Radius, Shadow, Spacing } from '@/constants/theme';
import { useGameServer } from '@/state/game-server';
import { useProgress } from '@/state/progress';

function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Tous les thèmes de l'application, rangés par catégorie. */
export default function AllThemesScreen() {
  const { stats } = useProgress();
  const { catalogVersion } = useGameServer();
  const [query, setQuery] = useState('');
  const q = normalize(query.trim());
  const groups = useMemo(() => {
    void catalogVersion;
    return CATEGORIES.map((category) => ({
      category,
      themes: themesOf(category.id).filter((t) => !q || normalize(`${t.name} ${t.description} ${category.name}`).includes(q)),
    })).filter((g) => g.themes.length > 0);
  }, [q, catalogVersion]);
  const total = groups.reduce((n, g) => n + g.themes.length, 0);

  return (
    <Screen back title="Tous les thèmes">
      <View style={styles.search}>
        <Ionicons name="search" size={19} color={Colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Rechercher un thème…"
          placeholderTextColor={Colors.textMuted}
          accessibilityLabel="Rechercher un thème"
          style={styles.input}
        />
        {!!query && (
          <Tap accessibilityRole="button" accessibilityLabel="Effacer la recherche" onPress={() => setQuery('')}>
            <Ionicons name="close-circle" size={19} color={Colors.textMuted} />
          </Tap>
        )}
      </View>
      <AppText muted style={styles.count}>
        {total} thème{total > 1 ? 's' : ''} · {groups.length} catégorie{groups.length > 1 ? 's' : ''}
      </AppText>

      {groups.length === 0 && <AppText muted style={styles.empty}>Aucun thème trouvé pour « {query} ».</AppText>}

      {groups.map(({ category, themes }) => (
        <View key={category.id} style={styles.section}>
          <Tap
            accessibilityRole="button"
            accessibilityLabel={`Ouvrir la catégorie ${category.name}`}
            onPress={() => router.push({ pathname: '/category/[id]', params: { id: category.id } })}
            style={styles.heading}>
            <View style={[styles.badge, { backgroundColor: category.color }]}>
              <AppText style={styles.badgeEmoji}>{category.icon}</AppText>
            </View>
            <View style={styles.headingText}>
              <AppText style={styles.categoryName} numberOfLines={1}>{category.name}</AppText>
              <AppText muted style={styles.categoryCount}>{themes.length} thème{themes.length > 1 ? 's' : ''}</AppText>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
          </Tap>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.grid}>
            {themes.map((theme) => {
              const level = levelFromXp(stats[theme.id]?.xp ?? 0).level;
              const played = (stats[theme.id]?.xp ?? 0) > 0;
              return (
                <Tap
                  key={theme.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${theme.name}${played ? `, niveau ${level}` : ''}`}
                  onPress={() => router.push({ pathname: '/theme/[id]', params: { id: theme.id } })}
                  style={styles.tile}>
                  <ThemeIcon themeId={theme.id} size={48} />
                  <AppText numberOfLines={2} style={styles.tileName}>{theme.name}</AppText>
                  {played && <AppText style={styles.tileLevel}>Niv. {level}</AppText>}
                </Tap>
              );
            })}
          </ScrollView>
        </View>
      ))}
    </Screen>
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
  count: { fontSize: 13, textAlign: 'center' },
  empty: { paddingVertical: Spacing.lg, textAlign: 'center' },
  section: { backgroundColor: Colors.surface, borderRadius: Radius.md, paddingVertical: 6, paddingHorizontal: Spacing.sm, gap: 6, ...Shadow },
  heading: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  badge: { width: 28, height: 28, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  badgeEmoji: { fontSize: 16, lineHeight: 20 },
  headingText: { flex: 1, minWidth: 0 },
  categoryName: { fontSize: 15, fontWeight: '800', color: Colors.text },
  categoryCount: { fontSize: 12 },
  grid: { flexDirection: 'row', gap: 4 },
  tile: { width: 68, alignItems: 'center', gap: 3, paddingHorizontal: 2 },
  tileName: { width: '100%', minHeight: 26, fontSize: 10.5, lineHeight: 13, fontWeight: '600', textAlign: 'center', color: Colors.text },
  tileLevel: { fontSize: 10, fontWeight: '800', color: Colors.accentInk },
});
