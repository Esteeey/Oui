import Svg, { Ellipse, G, Path, Polygon, Rect } from 'react-native-svg';
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppText } from '@/components/ui';

export const GOLD = '#FFC400';

/** Branche de laurier en aplat (dessin original). `flip` la retourne pour le côté droit. */
export function Laurel({ size = 44, flip = false }: { size?: number; flip?: boolean }) {
  const leaves = [0, 1, 2, 3, 4];
  return (
    <Svg width={size * 0.7} height={size} viewBox="0 0 28 40" style={flip ? { transform: [{ scaleX: -1 }] } : undefined}>
      <Path d="M20 38 C 8 32, 6 18, 12 4" stroke={GOLD} strokeWidth={2.2} fill="none" strokeLinecap="round" />
      {leaves.map((i) => {
        const y = 32 - i * 6.5;
        const x = 9 + Math.abs(2 - i) * 0.8;
        return (
          <G key={i}>
            <Ellipse cx={x - 4} cy={y} rx={5} ry={2.4} fill={GOLD} transform={`rotate(-35 ${x - 4} ${y})`} />
            <Ellipse cx={x + 4} cy={y - 2} rx={4.4} ry={2.1} fill={GOLD} transform={`rotate(35 ${x + 4} ${y - 2})`} />
          </G>
        );
      })}
    </Svg>
  );
}

/** Petite couronne en aplat, posée au-dessus de la carte du gagnant. */
export function Crown({ size = 30 }: { size?: number }) {
  return (
    <Svg width={size} height={size * 0.7} viewBox="0 0 30 21" accessibilityLabel="Gagnant">
      <Polygon points="2,19 4,5 10,11 15,2 20,11 26,5 28,19" fill={GOLD} />
      <Rect x={2} y={17} width={26} height={4} rx={1} fill={GOLD} />
    </Svg>
  );
}

/** Célébration compacte : laurier — trophée — laurier. */
export function Celebration({ color = GOLD }: { color?: string }) {
  return (
    <View style={styles.celebration} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Laurel />
      <View style={[styles.dash, { backgroundColor: color }]} />
      <Ionicons name="trophy" size={40} color={color} />
      <View style={[styles.dash, { backgroundColor: color }]} />
      <Laurel flip />
    </View>
  );
}

/** Bandeau incliné avec bandes décoratives : « VICTOIRE ! » en vert, « PERDU ! » en rouge. */
export function ResultBanner({ text, color, dark }: { text: string; color: string; dark: string }) {
  const W = 300;
  const H = 54;
  return (
    <View style={{ width: W, height: H, alignSelf: 'center' }} accessibilityRole="header" accessibilityLabel={text}>
      <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={StyleSheet.absoluteFill}>
        <Polygon points={`8,${H} 24,0 34,0 18,${H}`} fill={dark} />
        <Polygon points={`26,${H} 42,0 52,0 36,${H}`} fill={dark} />
        <Polygon points={`46,${H} 62,0 ${W},0 ${W - 16},${H}`} fill={color} />
      </Svg>
      <View style={[StyleSheet.absoluteFill, { paddingLeft: 52, alignItems: 'center', justifyContent: 'center' }]}>
        <AppText style={styles.bannerText}>{text}</AppText>
      </View>
    </View>
  );
}

/** Bouton principal « Rejouer » : orange #FF6B35, extrémité droite en pointe, aplat. */
export function ReplayButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Rejouer" onPress={onPress} style={({ pressed }) => [styles.replay, pressed && { opacity: 0.85 }]}>
      <Svg width="100%" height="100%" viewBox="0 0 340 60" preserveAspectRatio="none" style={StyleSheet.absoluteFill}>
        <Path d="M12 0 H316 L340 30 L316 60 H12 A12 12 0 0 1 0 48 V12 A12 12 0 0 1 12 0 Z" fill="#FF6B35" />
      </Svg>
      <Ionicons name="play" size={26} color="#FFFFFF" style={{ position: 'absolute', left: 28 }} />
      <AppText style={styles.replayText}>Rejouer</AppText>
      <AppText style={styles.chevrons}>»</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  celebration: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  dash: { width: 22, height: 4, borderRadius: 2 },
  bannerText: { color: '#FFFFFF', fontSize: 28, fontWeight: '900', fontStyle: 'italic', letterSpacing: 0.5 },
  replay: { height: 60, justifyContent: 'center', alignItems: 'center' },
  replayText: { color: '#FFFFFF', fontSize: 24, fontWeight: '800' },
  chevrons: { position: 'absolute', right: 44, color: '#FFFFFF', fontSize: 34, fontWeight: '900', lineHeight: 38 },
});
