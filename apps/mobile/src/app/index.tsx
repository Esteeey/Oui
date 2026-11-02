import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { CATEGORIES, getTheme, levelFromXp, themesOf } from '@qu1z/shared';

import { AppText, Avatar, Button, Card, ProgressBar, Screen } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { totalXp, useProgress } from '@/state/progress';

export default function HomeScreen() {
  const { playerName, stats, lastThemeId } = useProgress();
  const level = levelFromXp(totalXp(stats));
  const lastTheme = lastThemeId ? getTheme(lastThemeId) : undefined;

  return (
    <Screen>
      <View style={styles.header}>
        <AppText variant="display">
          Qu<AppText variant="display" color={Colors.player}>1</AppText>z
        </AppText>
      </View>

      <Card style={styles.profile}>
        <Avatar name={playerName} color={Colors.player} />
        <View style={{ flex: 1, gap: 6 }}>
          <AppText variant="heading">{playerName}</AppText>
          <AppText variant="caption" muted>
            Niveau {level.level} · {level.current} / {level.needed} XP
          </AppText>
          <ProgressBar progress={level.progress} />
        </View>
      </Card>

      {lastTheme && (
        <Button
          label={`Rejouer : ${lastTheme.name}`}
          onPress={() => router.push({ pathname: '/duel/[themeId]', params: { themeId: lastTheme.id } })}
        />
      )}

      <AppText variant="title" style={{ marginTop: Spacing.sm }}>
        Catégories
      </AppText>

      <View style={styles.grid}>
        {CATEGORIES.map((category, i) => {
          const count = themesOf(category.id).length;
          const available = count > 0;
          return (
            <Animated.View
              key={category.id}
              entering={FadeInDown.delay(i * 30).springify()}
              style={styles.cell}>
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingTop: Spacing.sm },
  profile: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -Spacing.xs },
  cell: { width: '50%', padding: Spacing.xs },
  tile: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 2,
    padding: Spacing.md,
    gap: 6,
    minHeight: 128,
  },
  icon: { fontSize: 30 },
});
