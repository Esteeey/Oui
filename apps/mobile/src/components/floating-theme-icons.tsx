import { useEffect } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { ThemeIcon } from '@/components/theme-icon';

/**
 * Icônes de thème placées autour du logo (positions en fraction de l'écran) : chacune arrive depuis
 * le bord le plus proche en tournant, puis flotte doucement. `dx`/`dy` = point de départ hors écran.
 */
const ICONS = [
  { id: 'sports-football', x: 0.06, y: 0.08, size: 72, rot: -12, dx: -160, dy: -120 },
  { id: 'music-hits', x: 0.74, y: 0.06, size: 68, rot: 10, dx: 160, dy: -140 },
  { id: 'manga-anime', x: 0.4, y: 0.02, size: 54, rot: 6, dx: 0, dy: -220 },
  { id: 'gaming-cult', x: -0.03, y: 0.27, size: 64, rot: 14, dx: -180, dy: 0 },
  { id: 'auto-f1', x: 0.82, y: 0.24, size: 62, rot: -10, dx: 180, dy: -20 },
  { id: 'marvel-dc', x: 0.04, y: 0.4, size: 52, rot: 12, dx: -180, dy: 60 },
  { id: 'food-world', x: 0.84, y: 0.4, size: 52, rot: -14, dx: 180, dy: 80 },
] as const;

export function FloatingThemeIcons() {
  const { width, height } = useWindowDimensions();
  const reduced = useReducedMotion();
  return (
    <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {ICONS.map((icon, i) => (
        <FloatingIcon key={icon.id} {...icon} index={i} left={icon.x * Math.min(width, 520) + Math.max(0, (width - 520) / 2)} top={icon.y * height} reduced={reduced} />
      ))}
    </View>
  );
}

function FloatingIcon({
  id,
  size,
  rot,
  dx,
  dy,
  index,
  left,
  top,
  reduced,
}: {
  id: string;
  size: number;
  rot: number;
  dx: number;
  dy: number;
  index: number;
  left: number;
  top: number;
  reduced: boolean;
}) {
  const enter = useSharedValue(reduced ? 1 : 0);
  const bob = useSharedValue(0);

  useEffect(() => {
    if (reduced) return;
    enter.set(withDelay(index * 80, withSpring(1, { damping: 14, stiffness: 90 })));
    bob.set(
      withDelay(
        900 + index * 200,
        withRepeat(withSequence(withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.sin) }), withTiming(0, { duration: 2000, easing: Easing.inOut(Easing.sin) })), -1),
      ),
    );
    // Animation lancée une seule fois à l'affichage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  const style = useAnimatedStyle(() => {
    const t = enter.get();
    return {
      opacity: Math.min(1, t * 1.5),
      transform: [
        { translateX: (1 - t) * dx },
        { translateY: (1 - t) * dy - bob.get() * 10 },
        { rotate: `${rot - (1 - t) * 40}deg` },
        { scale: 0.6 + 0.4 * t },
      ],
    };
  });

  return (
    <Animated.View style={[styles.icon, { left, top, width: size, height: size, borderRadius: size * 0.24 }, style]}>
      <ThemeIcon themeId={id} size={size} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  icon: { position: 'absolute', boxShadow: '0 10px 24px rgba(0,0,0,0.35)' },
});
