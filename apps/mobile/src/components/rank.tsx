import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, Ellipse, LinearGradient as SvgGradient, Path, Stop } from 'react-native-svg';

import { titleForLevel } from '@qu1z/shared';

import { Tap } from '@/components/tap';
import { AppText } from '@/components/ui';
import { Colors } from '@/constants/theme';

/** Feuilles d'une branche de laurier, de la base vers la pointe : position et inclinaison. */
const LEAVES = [
  [13, 21, 40],
  [8, 17, 20],
  [6, 12, 0],
  [7, 7, -22],
  [11, 3, -45],
] as const;

/** Branche de laurier ; `flip` la retourne pour le côté droit. */
export function Laurel({ flip, height = 24, color = Colors.goldBright, stem = '#E0761A' }: { flip?: boolean; height?: number; color?: string; stem?: string }) {
  return (
    <Svg width={height * 0.75} height={height} viewBox="0 0 18 24" style={flip ? { transform: [{ scaleX: -1 }] } : undefined}>
      <Path d="M16 23 C 8 20, 4 13, 9 2" stroke={stem} strokeWidth={1.4} fill="none" strokeLinecap="round" />
      {LEAVES.map(([x, y, angle]) => (
        <Ellipse key={`${x}-${y}`} cx={x} cy={y} rx={2.1} ry={3.8} fill={color} transform={`rotate(${angle} ${x} ${y})`} />
      ))}
    </Svg>
  );
}

/** Rang affiché : le titre équipé, sinon celui du niveau. */
export function rankLabel(title: string | null | undefined, level: number): string {
  return title || titleForLevel(level);
}

/** Rang du joueur : capsule violette, lauriers dorés et étoile posée dessus (`small` à côté d'un pseudo). */
export function RankBadge({ label, small }: { label: string; small?: boolean }) {
  const height = small ? 16 : 20;
  const laurel = small ? 18 : 25;
  return (
    <View style={styles.rankRow}>
      <View style={{ marginRight: small ? -5 : -7, zIndex: 1 }}>
        <Laurel height={laurel} />
      </View>
      <LinearGradient colors={['#8A00F0', '#C41FE8', '#8A00F0']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={[styles.rank, { height, borderRadius: height / 2, paddingHorizontal: small ? 9 : 15 }]}>
        <AppText color={Colors.onAccent} style={[styles.rankText, small && styles.rankTextSmall]} numberOfLines={1}>
          {label}
        </AppText>
      </LinearGradient>
      <View style={{ marginLeft: small ? -5 : -7, zIndex: 1 }}>
        <Laurel flip height={laurel} />
      </View>
      <View pointerEvents="none" style={[styles.star, { top: small ? -3 : -6 }]}>
        <Ionicons name="star" size={small ? 9 : 14} color={Colors.goldBright} />
      </View>
    </View>
  );
}

function Band({ id, width, height, children }: { id: string; width: number; height: number; children: React.ReactNode }) {
  const notch = height * 0.45;
  return (
    <View style={[styles.band, { width, height }]}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
          <Defs>
            <SvgGradient id={id} x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor="#FFD651" />
              <Stop offset="0.45" stopColor="#F8C235" />
              <Stop offset="0.75" stopColor="#FDBE28" />
              <Stop offset="1" stopColor="#FDEC99" />
            </SvgGradient>
          </Defs>
          <Path d={`M0 0 H${width} L${width - notch} ${height / 2} L${width} ${height} H0 L${notch} ${height / 2} Z`} fill={`url(#${id})`} />
        </Svg>
      </View>
      {children}
    </View>
  );
}

/** Deux rubans dorés superposés, les mêmes pour tous les thèmes : « Best in {thème} » puis « in Monde ». */
export function BestRibbon({ themeName, onPress }: { themeName: string; onPress?: () => void }) {
  return (
    <Tap accessibilityRole="button" accessibilityLabel={`Best in ${themeName}, in Monde`} onPress={onPress} style={styles.ribbon}>
      <Band id="ribbonGoldTop" width={257} height={24}>
        <AppText style={styles.ribbonTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
          Best in {themeName}
        </AppText>
      </Band>
      <Band id="ribbonGoldBottom" width={209} height={21}>
        <AppText style={styles.ribbonSub} numberOfLines={1}>
          in Monde
        </AppText>
      </Band>
    </Tap>
  );
}

const styles = StyleSheet.create({
  rankRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexShrink: 1 },
  rank: { justifyContent: 'center', flexShrink: 1 },
  rankText: { fontSize: 12, lineHeight: 17, fontWeight: '600' },
  rankTextSmall: { fontSize: 9, lineHeight: 13 },
  star: { position: 'absolute', alignSelf: 'center', zIndex: 2 },
  ribbon: { alignSelf: 'center', alignItems: 'center', gap: 3 },
  band: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  ribbonTitle: { color: Colors.text, fontSize: 14, lineHeight: 20, fontWeight: '800', fontStyle: 'italic' },
  ribbonSub: { color: Colors.text, fontSize: 12, lineHeight: 17, fontWeight: '800', fontStyle: 'italic' },
});
