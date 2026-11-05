import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { CATEGORIES, THEMES, getCategory, levelFromXp, themesOf } from '@qu1z/shared';

import { SectionHeader } from '@/components/social';
import { HeaderButton } from '@/components/header';
import { AppText, Screen } from '@/components/ui';
import { Colors, Radius, Shadow, Spacing } from '@/constants/theme';
import { useProgress } from '@/state/progress';
import { subscribersLabel, useThemeInfos } from '@/state/themes';
import { Tap } from '@/components/tap';

function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export default function ExploreScreen() {
  const { stats } = useProgress();
  const [query, setQuery] = useState('');
  const q = normalize(query.trim());
  const results = q
    ? THEMES.filter((t) => normalize(`${t.name} ${getCategory(t.categoryId)?.name}`).includes(q))
    : [];
  const played = THEMES.filter((t) => stats[t.id]).sort((a, b) => stats[b.id].xp - stats[a.id].xp);

  return (
    <Screen inTabs title="Thèmes" headerRight={<HeaderButton icon="search" label="Rechercher" onPress={() => router.push('/search')} />}>

      <View style={styles.search}>
        <Ionicons name="search" size={18} color={Colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Chercher un thème…"
          placeholderTextColor={Colors.textMuted}
          style={styles.input}
        />
      </View>

      {q ? (
        <>
          {results.map((t) => <ThemeRow key={t.id} themeId={t.id} level={levelFromXp(stats[t.id]?.xp ?? 0).level} />)}
          {results.length === 0 && <AppText muted>Aucun thème trouvé pour « {query} ».</AppText>}
        </>
      ) : (
        <>
          {played.length > 0 && (
            <>
              <SectionHeader title="Tes thèmes" />
              {played.map((t) => (
                <ThemeRow key={t.id} themeId={t.id} level={levelFromXp(stats[t.id].xp).level} />
              ))}
            </>
          )}

          <SectionHeader title="Catégories" />
          <View style={styles.grid}>
            {CATEGORIES.map((category, i) => {
              const count = themesOf(category.id).length;
              const available = count > 0;
              return (
                <Animated.View key={category.id} entering={FadeInDown.delay(i * 30).springify()} style={styles.cell}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={!available}
                    onPress={() => router.push({ pathname: '/category/[id]', params: { id: category.id } })}
                    style={({ pressed }) => [
                      styles.tile,
                      { borderColor: available ? category.color : Colors.border },
                      !available && { opacity: 0.45 },
                      pressed && { transform: [{ scale: 0.97 }] },
                    ]}>
                    <AppText style={styles.icon}>{category.icon}</AppText>
                    <AppText variant="label" numberOfLines={2}>
                      {category.name}
                    </AppText>
                    <AppText variant="caption" color={available ? category.color : Colors.textMuted}>
                      {available ? `${count} thème${count > 1 ? 's' : ''}` : 'Bientôt'}
                    </AppText>
                  </Pressable>
                </Animated.View>
              );
            })}
          </View>
        </>
      )}
    </Screen>
  );
}

function ThemeRow({ themeId, level }: { themeId: string; level: number }) {
  const theme = THEMES.find((t) => t.id === themeId)!;
  const category = getCategory(theme.categoryId)!;
  const infos = useThemeInfos();
  return (
    <Tap
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/theme/[id]', params: { id: theme.id } })}
      style={[styles.row, { borderLeftColor: category.color }]}>
      <AppText style={{ fontSize: 24 }}>{category.icon}</AppText>
      <View style={{ flex: 1 }}>
        <AppText variant="label">{theme.name}</AppText>
        <AppText variant="caption" muted>
          {[category.name, subscribersLabel(infos.get(theme.id))].filter(Boolean).join(' · ')}
        </AppText>
      </View>
      <AppText variant="caption" color={category.color}>
        Niv. {level}
      </AppText>
    </Tap>
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.md,
    ...Shadow,
  },
  input: { flex: 1, color: Colors.text, fontSize: 16, paddingVertical: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -Spacing.xs },
  cell: { width: '50%', padding: Spacing.xs },
  tile: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderTopWidth: 5,
    padding: Spacing.md,
    gap: 6,
    minHeight: 128,
    ...Shadow,
  },
  icon: { fontSize: 30 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderLeftWidth: 6,
    padding: Spacing.md,
    ...Shadow,
  },
});
