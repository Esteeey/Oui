import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { getCategory, getTheme } from '@qu1z/shared';

import { AppText } from '@/components/ui';
import { Colors, Gradients, Radius, Spacing } from '@/constants/theme';

/** Grande bannière « Prêt pour un duel ? » : lance un duel classé sur le thème donné. */
export function PlayBanner({ themeId, title = 'Prêt pour un duel ?' }: { themeId: string; title?: string }) {
  const theme = getTheme(themeId);
  const category = theme ? getCategory(theme.categoryId) : undefined;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Jouer un duel : ${theme?.name ?? ''}`}
      onPress={() => router.push({ pathname: '/duel/[themeId]', params: { themeId, mode: 'pvp' } })}
      style={({ pressed }) => [pressed && { transform: [{ scale: 0.98 }] }]}>
      <LinearGradient colors={Gradients.banner} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.play}>
        <AppText style={{ fontSize: 40 }}>{category?.icon ?? '🎯'}</AppText>
        <View style={styles.divider} />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="heading" color={Colors.onAccent}>
            {title}
          </AppText>
          <AppText variant="caption" color="rgba(255,255,255,0.8)">
            {theme?.name} · 7 questions
          </AppText>
        </View>
        <View style={styles.playButton}>
          <Ionicons name="play" size={26} color={Colors.accent} />
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  play: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md + 4,
  },
  divider: { width: 2, alignSelf: 'stretch', marginVertical: 6, backgroundColor: 'rgba(255,255,255,0.35)', borderRadius: 1 },
  playButton: { width: 56, height: 48, borderRadius: Radius.sm, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
});
