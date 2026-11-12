import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { LinearGradient as FadeGradient } from 'expo-linear-gradient';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { ClipPath, Defs, G, Image as SvgImage, LinearGradient, Path, Polygon, Rect, Stop } from 'react-native-svg';

import { countryFlag, countryName, getCategory, getTheme, levelFromXp, type DuelSnapshot, type ParticipantView, type PublicProfile } from '@qu1z/shared';

import { Avatar } from '@/components/ui';
import { ClassicColors as Colors } from '@/constants/theme';
import { mediaUri } from '@/net/media';
import { Tap } from '@/components/tap';
import { ThemeIcon } from '@/components/theme-icon';
import { useApi } from '@/net/api';

type P = [number, number];

/**
 * Bord déchiré qui sépare les deux joueurs, en diagonale (repère 100 × 100 étiré sur l'écran).
 * Pseudo-aléatoire figé : le dessin est identique à chaque duel.
 */
function tornEdge(offset: number, seed: number): P[] {
  let s = seed;
  const rand = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const points: P[] = [];
  for (let x = 0; x <= 100; x += 2) points.push([x, 57 - x * 0.12 + (rand() - 0.5) * 1.6 + offset]);
  return [...points, [100, 100], [0, 100]];
}
const WHITE_EDGE = tornEdge(-1.3, 7);
/** Bord de la photo du bas : même diagonale, un peu plus bas, autre tirage, pour une bande blanche fine et irrégulière. */
const LOWER_EDGE = tornEdge(2.2, 13);
/** Haut de la photo du bas (le point le plus haut de la déchirure, côté droit). */
const LOW_TOP = 0.42;
/** Points du repère 100 × 100 convertis en pixels (les photos ne doivent pas être déformées). */
const toPixels = (points: P[], w: number, h: number) => points.map(([x, y]) => `${((x * w) / 100).toFixed(1)},${((y * h) / 100).toFixed(1)}`).join(' ');

/** « VS » peint au pinceau, avec son halo et son ombre portée douce intégrés (fond transparent). */
const VS_IMAGE = require('../../assets/images/vs.png');
const VS_RATIO = 900 / 892;

/** Durée de la course des deux moitiés jusqu'au choc. */
/** Instant du choc des deux moitiés, exporté pour caler le son de l'intro. */
export const VERSUS_CLASH_MS = 950;
const CLASH_MS = VERSUS_CLASH_MS;

/**
 * Écran « VS » avant la première question : la moitié du haut (couverture du joueur, sinon paysage froid) et celle du bas
 * (couverture de l'adversaire, sinon paysage chaud) foncent l'une vers l'autre et s'entrechoquent ; l'écran tremble et
 * le « VS » peint au pinceau s'abat sur la déchirure entre les deux.
 */
export function VersusIntro({
  duel,
  onBack,
  children,
  onVsLongPress,
  armed = false,
}: {
  duel: DuelSnapshot;
  onBack: () => void;
  children?: ReactNode;
  /** Appui long sur le VS (comptes admin) : active ou coupe le mode triche pour cette partie. */
  onVsLongPress?: () => void;
  /** Mode triche actif : seul repère, un point presque invisible sous le VS. */
  armed?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const [box, setBox] = useState({ width: window.width, height: window.height });
  const { width, height } = box;
  const reduceMotion = useReducedMotion();
  const theme = getTheme(duel.themeId);
  const category = theme ? getCategory(theme.categoryId) : undefined;
  const size = Math.round(Math.min(96, width * 0.2));
  const myCover = mediaUri(duel.me.cover);
  const theirCover = mediaUri(duel.opponent.cover);
  const myProfile = useApi<PublicProfile>(`/api/users/${duel.me.id}`);
  const theirProfile = useApi<PublicProfile>(duel.opponent.isBot ? null : `/api/users/${duel.opponent.id}`);
  const myThemeRank = myProfile.data?.best?.themeId === duel.themeId && myProfile.data.best.rank <= 3 ? myProfile.data.best.rank : null;
  const theirThemeRank = theirProfile.data?.best?.themeId === duel.themeId && theirProfile.data.best.rank <= 3 ? theirProfile.data.best.rank : null;
  // L'image a une large marge pour l'ombre noire : les lettres occupent environ un quart de la largeur de l'écran.
  const vsWidth = Math.min(305, width * 0.48);
  // Tout est placé en pixels autour du milieu : la mise en page ne dépend plus de la hauteur de l'écran.
  const middle = height / 2;

  const top = useSharedValue(reduceMotion ? 0 : -height);
  const bottom = useSharedValue(reduceMotion ? 0 : height);
  const shake = useSharedValue(0);
  const flash = useSharedValue(0);
  const vs = useSharedValue(reduceMotion ? 1 : 0);
  const beat = useSharedValue(1);

  useEffect(() => {
    if (reduceMotion) return;
    // On attend que l’écran soit affiché : un premier rendu lent ne doit pas « manger » la course des deux moitiés.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(start);
    });
    return () => cancelAnimationFrame(frame);
  }, [reduceMotion]);

  function start() {
    const rush = { duration: CLASH_MS, easing: Easing.in(Easing.quad) };
    // Au choc, chaque moitié rebondit un peu en arrière, puis se cale et ne bouge plus.
    const settle = { duration: 160, easing: Easing.out(Easing.quad) };
    top.set(withSequence(withTiming(0, rush), withTiming(-18, { duration: 90 }), withTiming(0, settle)));
    bottom.set(withSequence(withTiming(0, rush), withTiming(18, { duration: 90 }), withTiming(0, settle)));
    shake.set(
      withDelay(
        CLASH_MS,
        withSequence(
          withTiming(-12, { duration: 40 }),
          withTiming(10, { duration: 50 }),
          withTiming(-7, { duration: 50 }),
          withTiming(4, { duration: 50 }),
          withTiming(0, { duration: 60 }),
        ),
      ),
    );
    flash.set(withDelay(CLASH_MS, withSequence(withTiming(0.85, { duration: 40 }), withTiming(0, { duration: 320 }))));
    vs.set(withDelay(CLASH_MS + 40, withSequence(withTiming(1.08, { duration: 220, easing: Easing.out(Easing.cubic) }), withTiming(1, { duration: 120 }))));
    startBeat(CLASH_MS + 500);
  }

  /** Une fois posé, le « VS » respire doucement : un battement léger, à peine perceptible. */
  function startBeat(delay: number) {
    const breathe = { duration: 800, easing: Easing.inOut(Easing.sin) };
    beat.set(withDelay(delay, withRepeat(withSequence(withTiming(1.035, breathe), withTiming(1, breathe)), -1)));
  }

  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.get() }, { translateY: shake.get() * 0.4 }] }));
  const topStyle = useAnimatedStyle(() => ({ transform: [{ translateY: top.get() }] }));
  const bottomStyle = useAnimatedStyle(() => ({ transform: [{ translateY: bottom.get() }] }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.get() }));
  // Le « VS » tombe de très gros vers sa taille normale, puis bat.
  const vsStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, vs.get() * 2), transform: [{ scale: (3 - 2 * vs.get()) * beat.get() }] }));

  return (
    <View style={styles.screen} onLayout={(e) => setBox({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}>
      <Animated.View style={[StyleSheet.absoluteFill, shakeStyle]}>
        {/* Moitié du haut : elle déborde sous la moitié du bas, qui la recouvre à partir de la déchirure. */}
        <Animated.View style={[StyleSheet.absoluteFill, topStyle]}>
          {myCover ? (
            <>
              <Image source={{ uri: myCover }} style={styles.topCover} contentFit="cover" />
              <FadeGradient colors={['rgba(0, 0, 0, 0.35)', 'rgba(0, 0, 0, 0)']} style={styles.topShade} />
            </>
          ) : (
            <ColdLandscape />
          )}
          <View style={[styles.half, { bottom: height - middle + VS_GAP }]}>
            <Player player={duel.me} profile={myProfile.data} size={size} color={Colors.player} bannerRank={myThemeRank} themeName={theme?.name} side="top" />
          </View>
        </Animated.View>

        {/* Moitié du bas : derrière un bord déchiré blanc. */}
        <Animated.View style={[StyleSheet.absoluteFill, bottomStyle]} pointerEvents="none">
          <Svg style={StyleSheet.absoluteFill} width={width} height={height}>
            <Defs>
              <LinearGradient id="warm" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#F2902E" />
                <Stop offset="0.55" stopColor="#B4471C" />
                <Stop offset="1" stopColor="#5A1E0B" />
              </LinearGradient>
              {/* La photo du bas suit un second bord déchiré, juste sous le premier : il ne reste qu'une fine bande blanche. */}
              <ClipPath id="lowClip">
                <Polygon points={toPixels(LOWER_EDGE, width, height)} />
              </ClipPath>
            </Defs>
            <Polygon points={toPixels(WHITE_EDGE, width, height)} fill="#F4F2F8" />
            <G clipPath="url(#lowClip)">
              {theirCover ? (
                <SvgImage href={theirCover} x={0} y={height * LOW_TOP} width={width} height={height * (1 - LOW_TOP)} preserveAspectRatio="xMidYMid slice" />
              ) : (
                <>
                  <Rect x={0} y={height * LOW_TOP} width={width} height={height * (1 - LOW_TOP)} fill="url(#warm)" />
                  <G transform={`scale(${width / 100} ${height / 100})`}>
                    <Path d="M0 74 Q20 70 40 73 T80 72 T100 73 V100 H0 Z" fill="#C2541F" opacity={0.75} />
                    <Path d="M0 82 Q25 76 50 81 T100 79 V100 H0 Z" fill="#A9431A" opacity={0.85} />
                    <Path d="M0 92 Q30 86 60 91 T100 88 V100 H0 Z" fill="#8A3412" />
                  </G>
                </>
              )}
            </G>
          </Svg>
          <View style={[styles.half, { top: middle + VS_GAP }]}>
            <Player player={duel.opponent} profile={theirProfile.data} size={size} color={duel.opponent.color ?? Colors.opponent} bannerRank={theirThemeRank} themeName={theme?.name} side="bottom" />
          </View>
          <Animated.View entering={FadeIn.delay(CLASH_MS + 300)} style={[styles.theme, { paddingBottom: insets.bottom + 24 }]}>
            {theme && <ThemeIcon themeId={theme.id} size={26} />}
            <Text style={styles.themeText} numberOfLines={1}>
              {category ? `${category.name} · ` : ''}
              {theme?.name}
            </Text>
          </Animated.View>
        </Animated.View>

        {/* Le VS chevauche la déchirure, au milieu de l'écran. */}
        <View style={styles.vsBox} pointerEvents="box-none">
          <Pressable onLongPress={onVsLongPress} delayLongPress={900} disabled={!onVsLongPress} accessible={false}>
            <Animated.View style={vsStyle} accessible accessibilityLabel="contre">
              <Image source={VS_IMAGE} style={{ width: vsWidth, aspectRatio: VS_RATIO }} contentFit="contain" />
            </Animated.View>
          </Pressable>
          {onVsLongPress && <View style={[styles.armedDot, { opacity: armed ? 0.35 : 0 }]} pointerEvents="none" />}
        </View>
        <Animated.View style={[StyleSheet.absoluteFill, styles.flash, flashStyle]} pointerEvents="none" />
      </Animated.View>

      <View style={[styles.top, { paddingTop: insets.top + 12 }]}>
        <Tap accessibilityRole="button" accessibilityLabel="Abandonner le duel" hitSlop={8} onPress={onBack} style={styles.round}>
          <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
        </Tap>
      </View>
      {children}
    </View>
  );
}

/** Fond du joueur sans photo de couverture : ciel d'orage, montagnes et forêt. */
function ColdLandscape() {
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
      <Defs>
        <LinearGradient id="cold" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#2B3A4C" />
          <Stop offset="0.3" stopColor="#3D5468" />
          <Stop offset="0.6" stopColor="#14301F" />
        </LinearGradient>
      </Defs>
      <Path d="M0 0 H100 V62 H0 Z" fill="url(#cold)" />
      <Path d="M0 24 L14 18 L26 23 L40 15 L55 22 L68 17 L82 21 L100 16 V62 H0 Z" fill="#23384A" opacity={0.85} />
      <Path d="M0 28 L4 24 L8 28 L12 23 L16 28 L20 25 L24 29 L30 26 L36 30 L44 27 L52 31 L60 26 L66 29 L72 22 L78 26 L84 20 L90 24 L96 19 L100 22 V62 H0 Z" fill="#163A27" />
      <Path d="M0 36 L5 31 L9 36 L14 30 L19 37 L25 33 L32 38 L40 35 L50 40 L62 36 L70 31 L76 35 L82 28 L88 33 L94 27 L100 31 V62 H0 Z" fill="#0E2A1B" />
    </Svg>
  );
}

/** Bloc joueur de la maquette : photo, trait vertical, puis pseudo, niveau, pays et classement ; miroir pour l'adversaire. */
function Player({
  player,
  profile,
  size,
  color,
  bannerRank,
  themeName,
  side,
}: {
  player: ParticipantView;
  profile?: PublicProfile | null;
  size: number;
  color: string;
  bannerRank: number | null;
  themeName?: string;
  side: 'top' | 'bottom';
}) {
  const dark = side === 'bottom';
  // Les deux joueurs sont posés sur une photo : texte blanc ombré des deux côtés.
  const ink = '#FFFFFF';
  const level = profile ? levelFromXp(profile.xp).level : null;
  const country = profile?.country ?? null;
  const photo = (
    <View style={styles.photo}>
      <Avatar name={player.name} color={color} uri={player.avatar} size={size} borderColor="#FFFFFF" />
    </View>
  );
  const info = (
    <View style={[styles.info, { alignItems: dark ? 'flex-end' : 'flex-start' }]}>
      <Text style={[styles.name, { color: ink }, shadow]} numberOfLines={1}>
        {player.name}
      </Text>
      {level != null && (
        <View style={[styles.levelPill, { borderColor: ink }]}>
          <Text style={[styles.levelText, { color: ink }]}>Niveau {level}</Text>
        </View>
      )}
      {country ? (
        <View style={styles.countryRow} accessible accessibilityLabel={countryName(country) ?? country}>
          <View style={styles.flagRound}>
            <Text style={styles.flagEmoji}>{countryFlag(country)}</Text>
          </View>
          <Text style={[styles.countryText, { color: ink }]} numberOfLines={1}>
            {countryName(country)}
          </Text>
        </View>
      ) : null}
      {bannerRank && themeName ? (
        <View style={styles.rankBanner} accessible accessibilityLabel={`${bannerRank === 1 ? '1er' : `${bannerRank}e`} en ${themeName}`}>
          <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" viewBox="0 0 100 10" preserveAspectRatio="none">
            <Polygon points="0,0 100,0 95,5 100,10 0,10" fill="#F5B82E" />
          </Svg>
          <Ionicons name="trophy" size={14} color="#1E1240" />
          <Text style={styles.rankBannerText} numberOfLines={1}>
            {bannerRank === 1 ? '1er' : `${bannerRank}e`} en {themeName}
          </Text>
        </View>
      ) : null}
      {player.isBot && <Text style={[styles.bot, { color: ink }]}>Réponses simulées (bot)</Text>}
    </View>
  );
  const rule = <View style={[styles.rule, { backgroundColor: ink, height: size * 0.95 }]} />;
  return (
    <View style={styles.playerRow}>
      {dark ? (
        <>
          {info}
          {rule}
          {photo}
        </>
      ) : (
        <>
          {photo}
          {rule}
          {info}
        </>
      )}
    </View>
  );
}

const shadow = { textShadowColor: 'rgba(0, 0, 0, 0.45)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8 };

/** Espace laissé au « VS » entre les deux joueurs, de part et d'autre du milieu de l'écran. */
const VS_GAP = 58;

const styles = StyleSheet.create({
  armedDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: '#FFFFFF', marginTop: 2 },
  screen: { flex: 1, backgroundColor: '#000000', overflow: 'hidden' },
  top: { position: 'absolute', left: 0, right: 0, top: 0, paddingHorizontal: 20, zIndex: 2 },
  round: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(20, 24, 32, 0.6)', alignItems: 'center', justifyContent: 'center' },
  topCover: { position: 'absolute', left: 0, right: 0, top: 0, height: '62%' },
  topShade: { position: 'absolute', left: 0, right: 0, top: 0, height: 140 },
  half: { position: 'absolute', left: 0, right: 0, alignItems: 'center', gap: 6, paddingHorizontal: 24 },
  photo: { borderRadius: 999, boxShadow: '0 8px 24px rgba(0, 0, 0, 0.45)' },
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: 16, maxWidth: '100%' },
  info: { gap: 7, flexShrink: 1 },
  rule: { width: 2, borderRadius: 1 },
  name: { fontSize: 24, fontWeight: '900', letterSpacing: -0.3 },
  levelPill: { borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 2 },
  levelText: { fontSize: 12, fontWeight: '800' },
  countryRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  flagRound: { width: 20, height: 20, borderRadius: 10, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.9)' },
  flagEmoji: { fontSize: 26, lineHeight: 30, textAlign: 'center' },
  countryText: { fontSize: 12, fontWeight: '700' },
  bot: { fontSize: 12, fontWeight: '600', opacity: 0.8 },
  rankBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 8, paddingRight: 20, paddingVertical: 4, borderRadius: 3 },
  rankBannerText: { color: '#1E1240', fontSize: 12, lineHeight: 15, fontWeight: '800', flexShrink: 1 },
  vsBox: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  flash: { backgroundColor: '#FFFFFF' },
  theme: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, paddingHorizontal: 24 },
  themeText: { ...shadow, color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
});
