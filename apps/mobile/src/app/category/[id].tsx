import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { getCategory, levelFromXp, themesOf } from '@qu1z/shared';

import { AppText, Screen } from '@/components/ui';
import { BackButton } from '@/components/back-button';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useProgress } from '@/state/progress';
import { formatCount, themeSubscriberCount, useSocial } from '@/state/social';

export default function CategoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const category = getCategory(id);
  const { stats } = useProgress();
  const { subscribedThemes } = useSocial();
  if (!category) return <Redirect href="/" />;

  return (
    <Screen>
      <BackButton />
      <View style={styles.hero}>
        <AppText style={{ fontSize: 48 }}>{category.icon}</AppText>
        <AppText variant="title">{category.name}</AppText>
      </View>

      {themesOf(category.id).map((theme) => {
        const level = levelFromXp(stats[theme.id]?.xp ?? 0).level;
        return (
          <Pressable
            key={theme.id}
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/theme/[id]', params: { id: theme.id } })}
            style={({ pressed }) => [styles.row, { borderLeftColor: category.color }, pressed && { opacity: 0.8 }]}>
            <View style={{ flex: 1, gap: 4 }}>
              <AppText variant="heading">{theme.name}</AppText>
              <AppText variant="caption" muted>
                {theme.description}
              </AppText>
              <AppText variant="caption" color={category.color}>
                {formatCount(themeSubscriberCount(theme.id, subscribedThemes))} abonnés
                {subscribedThemes.includes(theme.id) ? ' · abonné ✓' : ''}
              </AppText>
            </View>
            <View style={[styles.level, { backgroundColor: category.color }]}>
              <AppText variant="caption" color={Colors.background}>
                Niv. {level}
              </AppText>
            </View>
          </Pressable>
        );
      })}

      <AppText variant="caption" muted style={{ textAlign: 'center', marginTop: Spacing.md }}>
        D'autres thèmes arrivent bientôt dans cette catégorie.
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderLeftWidth: 6,
    padding: Spacing.md,
  },
  level: { borderRadius: Radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
});
