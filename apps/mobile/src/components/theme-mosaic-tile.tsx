import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { CATEGORIES, THEMES, levelFromXp } from '@qu1z/shared';

import { ThemeIcon } from '@/components/theme-icon';
import { AppText } from '@/components/ui';

type Glyph = React.ComponentProps<typeof Ionicons>['name'];

/** Motifs dessinés en fond de tuile, propres à chaque catégorie. */
const MOTIFS: Record<string, Glyph[]> = {
  'culture-generale': ['bulb', 'help', 'sparkles'],
  cinema: ['film', 'videocam', 'star'],
  series: ['tv', 'play', 'star'],
  'jeux-video': ['game-controller', 'heart', 'trophy'],
  sports: ['medal', 'stopwatch', 'trophy'],
  clubs: ['football', 'shirt', 'trophy'],
  musique: ['musical-notes', 'mic', 'headset'],
  histoire: ['hourglass', 'library', 'flag'],
  geographie: ['earth', 'airplane', 'compass'],
  sciences: ['flask', 'planet', 'magnet'],
  automobile: ['car-sport', 'speedometer', 'flag'],
  gastronomie: ['restaurant', 'pizza', 'cafe'],
  'animaux-nature': ['paw', 'leaf', 'fish'],
  technologie: ['hardware-chip', 'laptop', 'wifi'],
  'mode-luxe': ['diamond', 'bag-handle', 'sparkles'],
  'litterature-bd': ['book', 'chatbubble', 'pencil'],
  'culture-pop': ['flash', 'star', 'heart'],
  marques: ['pricetag', 'cart', 'storefront'],
};

/** Positions des motifs : [gauche %, haut %, taille, rotation]. */
const SPOTS: [number, number, number, number][] = [
  [6, 58, 22, -18], [40, 72, 16, 14], [64, 8, 18, 22], [32, 34, 12, -8], [80, 44, 14, -24],
];

export function ThemeMosaicTile({ themeId, xp, big = false, badge }: { themeId: string; xp: number; big?: boolean; badge?: string }) {
  const theme = THEMES.find((item) => item.id === themeId);
  // Bouton « enfoncé » : la tuile s'écrase sous le doigt puis rebondit au relâchement.
  const press = useSharedValue(0);
  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - press.value * 0.07 }, { translateY: press.value * 4 }],
  }));
  if (!theme) return null;
  const category = CATEGORIES.find((item) => item.id === theme.categoryId);
  const color = category?.color ?? '#7B2FFF';
  const motifs = MOTIFS[theme.categoryId] ?? ['sparkles', 'star', 'help'];
  const level = levelFromXp(xp).level;
  const played = xp > 0;
  return (
    <Animated.View style={[styles.outer, big && styles.big, pressStyle]}>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${theme.name}${played ? `, niveau ${level}` : ''}`}
      onPress={() => router.push({ pathname: '/theme/[id]', params: { id: themeId } })}
      style={[styles.tile, big && styles.big, { backgroundColor: color }]}>
      {/* Décor : motifs de la catégorie et grande icône du thème, inclinée dans le coin. */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {SPOTS.map(([left, top, size, rot], i) => (
          <Ionicons
            key={i}
            name={motifs[i % motifs.length]}
            size={big ? size * 1.5 : size}
            color="rgba(255,255,255,0.24)"
            style={{ position: 'absolute', left: `${left}%`, top: `${top}%`, transform: [{ rotate: `${rot}deg` }] }}
          />
        ))}
        <View style={styles.stripe} />
        <View style={[styles.art, big && styles.artBig]}>
          <ThemeIcon themeId={themeId} size={big ? 110 : 62} />
        </View>
      </View>
      <View style={styles.text}>
        {badge && <AppText style={styles.badge}>{badge}</AppText>}
        <AppText numberOfLines={2} style={[styles.name, big && styles.nameBig]}>{theme.name}</AppText>
        {played && (
          <View style={styles.level}>
            <AppText style={styles.levelText}>Niv. {level}</AppText>
          </View>
        )}
      </View>
    </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  outer: { flex: 1 },
  tile: { flex: 1, minHeight: 118, borderRadius: 22, overflow: 'hidden', padding: 12 },
  big: { minHeight: 246 },
  stripe: { position: 'absolute', width: '160%', height: 34, left: '-30%', top: '62%', backgroundColor: 'rgba(255,255,255,0.12)', transform: [{ rotate: '-14deg' }] },
  art: { position: 'absolute', right: -8, bottom: -6, transform: [{ rotate: '-12deg' }] },
  artBig: { right: -14, bottom: -10 },
  text: { gap: 4, alignItems: 'flex-start', maxWidth: '80%' },
  badge: { color: '#0E0F2B', backgroundColor: '#FFD700', fontSize: 10, fontWeight: '800', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2, overflow: 'hidden' },
  name: { color: '#FFFFFF', fontSize: 14, lineHeight: 18, fontWeight: '800', textShadowColor: 'rgba(0,0,0,0.3)', textShadowRadius: 4 },
  nameBig: { fontSize: 20, lineHeight: 25 },
  level: { backgroundColor: 'rgba(14,15,43,0.35)', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  levelText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
});
