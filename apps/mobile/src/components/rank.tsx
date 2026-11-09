import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Svg, { Defs, Ellipse, LinearGradient as SvgGradient, Path, Stop } from 'react-native-svg';

import { titleForLevel, type ProfileBanner } from '@qu1z/shared';

import { Tap } from '@/components/tap';
import { AppText } from '@/components/ui';
import { Colors } from '@/constants/theme';

const RIBBON_WIDTH = 257;

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
  const shape = `M0 0 H${width} L${width - notch} ${height / 2} L${width} ${height} H0 L${notch} ${height / 2} Z`;
  return (
    <View style={[styles.band, { width, height }]}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
          <Defs>
            <SvgGradient id={id} x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor="#FFE27A" />
              <Stop offset="0.12" stopColor="#F9C531" />
              <Stop offset="0.55" stopColor="#F6B91C" />
              <Stop offset="0.86" stopColor="#FBCB3C" />
              <Stop offset="1" stopColor="#FFF3B8" />
            </SvgGradient>
            <SvgGradient id={`${id}Shine`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.42} />
              <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity={0} />
              <Stop offset="1" stopColor="#B87400" stopOpacity={0.22} />
            </SvgGradient>
          </Defs>
          <Path d={shape} fill={`url(#${id})`} />
          <Path d={shape} fill={`url(#${id}Shine)`} />
        </Svg>
      </View>
      {children}
    </View>
  );
}

/** Deux rubans dorés superposés : « Meilleur en {thème} » puis « du Monde », avec le mois une fois celui-ci terminé. */
export function BestRibbon({ themeName, season, onPress }: { themeName: string; season?: string | null; onPress?: () => void }) {
  const place = season ? `du Monde · ${season}` : 'du Monde';
  // Calculé plutôt que confié à adjustsFontSizeToFit, qui n'existe pas sur le site.
  const titleSize = Math.max(10, Math.min(14, (14 * 25) / `Meilleur en ${themeName}`.length));
  return (
    <Tap accessibilityRole="button" accessibilityLabel={`Meilleur en ${themeName}, ${place}`} onPress={onPress} style={styles.ribbon}>
      <Band id="ribbonGoldTop" width={RIBBON_WIDTH} height={24}>
        <AppText style={[styles.ribbonTitle, { fontSize: titleSize }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
          Meilleur en {themeName}
        </AppText>
      </Band>
      <Band id="ribbonGoldBottom" width={season ? 236 : 209} height={21}>
        <AppText style={styles.ribbonSub} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
          {place}
        </AppText>
      </Band>
    </Tap>
  );
}

/** Banderoles du joueur : la première est celle qu'il affiche, on voit les autres en swipant. */
export function BannerCarousel({ banners, onOpen }: { banners: ProfileBanner[]; onOpen: (themeId: string) => void }) {
  const [page, setPage] = useState(0);
  if (!banners.length) return null;
  return (
    <View style={styles.carousel}>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={32}
        onScroll={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / RIBBON_WIDTH))}
        style={styles.carouselScroll}>
        {banners.map((b) => (
          <View key={b.key} style={styles.carouselPage}>
            <BestRibbon themeName={b.themeName} season={b.season} onPress={() => onOpen(b.themeId)} />
          </View>
        ))}
      </ScrollView>
      {banners.length > 1 && (
        <View style={styles.dots}>
          {banners.map((b, i) => (
            <View key={b.key} style={[styles.dot, i === page && styles.dotActive]} />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  rankRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexShrink: 1 },
  rank: { justifyContent: 'center', flexShrink: 1 },
  rankText: { fontSize: 12, lineHeight: 17, fontWeight: '600' },
  rankTextSmall: { fontSize: 11, lineHeight: 14 },
  star: { position: 'absolute', alignSelf: 'center', zIndex: 2 },
  ribbon: { alignSelf: 'center', alignItems: 'center', gap: 3 },
  band: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  ribbonTitle: { color: Colors.text, fontSize: 14, lineHeight: 20, fontWeight: '800', fontStyle: 'italic' },
  ribbonSub: { color: Colors.text, fontSize: 12, lineHeight: 17, fontWeight: '800', fontStyle: 'italic' },
  carousel: { alignItems: 'center', gap: 5, marginTop: 2 },
  carouselScroll: { width: RIBBON_WIDTH, flexGrow: 0 },
  carouselPage: { width: RIBBON_WIDTH, alignItems: 'center' },
  dots: { flexDirection: 'row', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.4)' },
  dotActive: { backgroundColor: Colors.goldBright },
});
