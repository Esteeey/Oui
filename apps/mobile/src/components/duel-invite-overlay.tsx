import { BlurView } from 'expo-blur';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Path, RadialGradient, Stop } from 'react-native-svg';

import { DUEL_INVITE_DEFAULTS, getTheme, type DuelInviteAnimation } from '@qu1z/shared';

import { ThemeIcon } from '@/components/theme-icon';
import { Avatar } from '@/components/ui';
import { Colors, Fonts } from '@/constants/theme';
import { useApi } from '@/net/api';
import { appBlurTarget } from '@/state/app-blur-target';
import { currentInvitation, useGameServer } from '@/state/game-server';
import { navLift } from '@/state/nav-lift';
import { avatarColor } from '@/utils/avatar';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const POINTS = 46;
const SIMPLE_MS = 240;
const CARD_MAX_WIDTH = 334;
const CARD_MARGIN = 34;

export interface DuelInviteData {
  id: string;
  /** Joueur affiché sur la carte : l'expéditeur, ou le destinataire d'une invitation envoyée. */
  personId: string;
  pseudo: string;
  avatar: string | null;
  themeId: string;
  themeName: string;
  /** Invitation envoyée par le joueur : même carte, sans la déchirure. */
  outgoing?: boolean;
}

interface Timeline {
  veil: number;
  tearStart: number;
  tearSpread: number;
  tearRun: number;
  cardStart: number;
  cardRun: number;
  flashPeak: number;
  flashFall: number;
  itemStart: number;
  itemRun: number;
  itemGap: number;
  total: number;
}

function timelineOf(s: DuelInviteAnimation): Timeline {
  const tearEnd = s.veilMs + s.tearMs;
  const cardEnd = tearEnd + s.cardMs;
  const contentWindow = s.contentMs + 50;
  return {
    veil: Math.max(1, s.veilMs),
    tearStart: s.veilMs,
    tearSpread: s.tearMs * 0.3,
    tearRun: s.tearMs * 0.7,
    cardStart: tearEnd - 10,
    cardRun: s.cardMs + 10,
    flashPeak: tearEnd + 12,
    flashFall: s.cardMs * 0.88,
    itemStart: cardEnd - 50,
    itemRun: contentWindow * 0.37,
    itemGap: contentWindow * 0.126,
    total: cardEnd + s.contentMs,
  };
}

interface Tear {
  xs: number[];
  base: number[];
  top: number[];
  bottom: number[];
  lipTop: number[];
  lipBottom: number[];
  spread: number[];
  mid: number;
}

/** Tracé unique de la déchirure : les deux bords partent de la même ligne, comme une vraie feuille. */
function buildTear(width: number, height: number, cardHeight: number, s: DuelInviteAnimation, id: string): Tear {
  let seed = 20261109;
  for (let i = 0; i < id.length; i++) seed = (seed * 31 + id.charCodeAt(i)) | 0;
  const rnd = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
  const relief = s.irregularity / 100;
  const paper = s.paperWidth / 100;
  const mid = height * 0.495;
  const extra = (s.opening - 100) / 100;
  const restTop = Math.min(height * 0.126, (height - cardHeight) / 2 - CARD_MARGIN) - extra * mid;
  const restBottom = Math.max(height * 0.846, (height + cardHeight) / 2 + CARD_MARGIN) + extra * (height - mid);
  const origin = width * (0.2 + rnd() * 0.5);
  const tear: Tear = { xs: [], base: [], top: [], bottom: [], lipTop: [], lipBottom: [], spread: [], mid };
  for (let i = 0; i < POINTS; i++) {
    const x = -10 + (i / (POINTS - 1)) * (width + 20) + (i && i < POINTS - 1 ? (rnd() - 0.5) * 4 : 0);
    const spike = rnd() < 0.13 ? (rnd() < 0.5 ? -1 : 1) * (5 + rnd() * 7) : 0;
    const shape = 13 * Math.sin(x * 0.021 + 1.1) + 8 * Math.sin(x * 0.053 + 0.4) + (x / width - 0.5) * -22 + (rnd() - 0.5) * 7 + spike;
    const y = mid + shape * relief;
    tear.xs.push(x);
    tear.base.push(y);
    tear.top.push(restTop + (y - mid) * 0.72 + (rnd() - 0.5) * 7 * relief);
    tear.bottom.push(restBottom + (y - mid) * 0.72 + (rnd() - 0.5) * 7 * relief);
    tear.lipTop.push((9 + 5 * Math.sin(x * 0.037 + 2) + rnd() * 7) * paper);
    tear.lipBottom.push((9 + 5 * Math.sin(x * 0.031 + 0.6) + rnd() * 7) * paper);
    tear.spread.push(Math.abs(x - origin) / width);
  }
  return tear;
}

function clamp(value: number): number {
  'worklet';
  return Math.min(1, Math.max(0, value));
}
function smooth(p: number): number {
  'worklet';
  return p * p * (3 - 2 * p);
}
function outCubic(p: number): number {
  'worklet';
  return 1 - Math.pow(1 - p, 3);
}
function back(p: number, c: number): number {
  'worklet';
  return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2);
}

function polyline(xs: number[], ys: number[], offset: number): string {
  'worklet';
  let d = '';
  for (let i = 0; i < ys.length; i++) d += `${i ? 'L' : 'M'}${xs[i].toFixed(1)} ${(ys[i] + offset).toFixed(1)}`;
  return d;
}
function band(xs: number[], first: number[], second: number[]): string {
  'worklet';
  let d = polyline(xs, first, 0);
  for (let i = second.length - 1; i >= 0; i--) d += `L${xs[i].toFixed(1)} ${second[i].toFixed(1)}`;
  return `${d}Z`;
}

type TearPart = 'hole' | 'lipTop' | 'lipBottom' | 'rimTop' | 'rimBottom' | 'glowTop' | 'glowBottom' | 'shadow1' | 'shadow2' | 'shadow3';

function TearPath({ t, tear, timeline, part, strength, ...paint }: { t: SharedValue<number>; tear: Tear; timeline: Timeline; part: TearPart; strength?: number; fill?: string; stroke?: string; strokeWidth?: number }) {
  const animatedProps = useAnimatedProps(() => {
    const top: number[] = [];
    const bottom: number[] = [];
    let gaps = 0;
    let lip = 0;
    for (let i = 0; i < tear.xs.length; i++) {
      const p = clamp((t.value - timeline.tearStart - tear.spread[i] * timeline.tearSpread) / timeline.tearRun);
      const f = back(Math.pow(p, 2.1), 0.5);
      top.push(tear.base[i] + (tear.top[i] - tear.base[i]) * f);
      bottom.push(tear.base[i] + (tear.bottom[i] - tear.base[i]) * f);
      gaps += bottom[i] - top[i];
      lip = Math.max(lip, clamp(p * 1.7));
    }
    const open = clamp(gaps / tear.xs.length / 70);
    const level = strength ?? 1;
    let d: string;
    let opacity = 1;
    if (part === 'hole') d = band(tear.xs, top, bottom);
    else if (part === 'lipTop') d = band(tear.xs, top.map((y, i) => y - tear.lipTop[i] * lip), top);
    else if (part === 'lipBottom') d = band(tear.xs, bottom.map((y, i) => y + tear.lipBottom[i] * lip), bottom);
    else if (part === 'rimTop' || part === 'glowTop') {
      d = polyline(tear.xs, top, 0);
      opacity = level;
    } else if (part === 'rimBottom' || part === 'glowBottom') {
      d = polyline(tear.xs, bottom, 0);
      opacity = level;
    } else {
      const offset = part === 'shadow1' ? 5 : part === 'shadow2' ? 11 : 20;
      d = polyline(tear.xs, top, offset) + polyline(tear.xs, bottom, -offset);
      opacity = level * open;
    }
    return { d, opacity };
  }, [tear, timeline, part, strength]);
  return <AnimatedPath animatedProps={animatedProps} strokeLinejoin="round" {...paint} />;
}

function Flash({ t, timeline, strength, cx, cy, r }: { t: SharedValue<number>; timeline: Timeline; strength: number; cx: number; cy: number; r: number }) {
  const animatedProps = useAnimatedProps(() => {
    const rise = clamp((t.value - (timeline.flashPeak - 42)) / 42);
    const fall = clamp(1 - (t.value - timeline.flashPeak) / Math.max(1, timeline.flashFall));
    return { opacity: strength * (t.value < timeline.flashPeak ? rise : fall) };
  }, [timeline, strength]);
  return <AnimatedCircle animatedProps={animatedProps} cx={cx} cy={cy} r={r} fill="url(#inviteFlash)" />;
}

function Shard({ t, index, tear, timeline, color }: { t: SharedValue<number>; index: number; tear: Tear; timeline: Timeline; color: string }) {
  const shard = useMemo(() => {
    const unit = (n: number) => {
      const v = Math.sin((index + 1) * n * 12.9898) * 43758.5453;
      return v - Math.floor(v);
    };
    const width = tear.xs[tear.xs.length - 1];
    return {
      x: 30 + unit(1) * (width - 60),
      y: tear.mid + (unit(2) - 0.5) * 20,
      vx: (unit(3) - 0.5) * 0.34,
      vy: (index % 2 ? 1 : -1) * (0.42 + unit(4) * 0.55),
      rotate: unit(5) * 360,
      spin: (unit(6) - 0.5) * 1.2,
      size: 4 + unit(7) * 7,
      delay: timeline.tearStart + timeline.tearRun * 0.26 + unit(8) * timeline.tearSpread,
      life: 200 + unit(9) * 120,
    };
  }, [index, tear, timeline]);
  const style = useAnimatedStyle(() => {
    const age = t.value - shard.delay;
    const life = clamp(age / shard.life);
    return {
      opacity: age < 0 || life >= 1 ? 0 : 1 - life,
      transform: [{ translateX: shard.x + shard.vx * age }, { translateY: shard.y + shard.vy * age }, { rotate: `${shard.rotate + shard.spin * age}deg` }],
    };
  }, [shard]);
  return <Animated.View pointerEvents="none" style={[styles.shard, { width: shard.size, height: shard.size * 0.72, backgroundColor: color }, style]} />;
}

function Item({ t, index, timeline, simple, avatar, children }: { t: SharedValue<number>; index: number; timeline: Timeline; simple: boolean; avatar?: boolean; children: React.ReactNode }) {
  const style = useAnimatedStyle(() => {
    if (simple) return { opacity: 1 };
    const q = clamp((t.value - timeline.itemStart - index * timeline.itemGap) / Math.max(1, timeline.itemRun));
    return { opacity: q, transform: [{ translateY: (1 - outCubic(q)) * 11 }, { scale: avatar ? 0.7 + 0.3 * back(q, 2.1) : 1 }] };
  }, [timeline, simple, index, avatar]);
  return <Animated.View style={[styles.item, style]}>{children}</Animated.View>;
}

function Sheen({ disabled }: { disabled: boolean }) {
  const x = useSharedValue(0);
  useEffect(() => {
    if (disabled) return;
    x.value = withDelay(1100, withRepeat(withSequence(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) }), withDelay(2300, withTiming(0, { duration: 0 }))), -1));
  }, [disabled, x]);
  const style = useAnimatedStyle(() => ({ opacity: x.value > 0 && x.value < 1 ? 1 : 0, transform: [{ translateX: -90 + x.value * 480 }, { skewX: '-20deg' }] }));
  if (disabled) return null;
  return <Animated.View pointerEvents="none" style={[styles.sheen, style]} />;
}

/**
 * Invitation à un duel plein écran. Ne décide de rien : elle affiche `invitation`, signale les choix du joueur
 * et rejoue sa fermeture dès que l'invitation disparaît ou change.
 */
export function DuelInviteOverlay({ invitation, settings, seconds, fraction, error, busy, acceptedId, onAccept, onLater, onRefuse }: {
  invitation: DuelInviteData | null;
  settings: DuelInviteAnimation;
  seconds: number;
  fraction: number;
  error?: string;
  busy?: boolean;
  acceptedId?: string | null;
  onAccept: () => void;
  onLater: () => void;
  onRefuse: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const [shown, setShown] = useState<DuelInviteData | null>(null);
  const simple = reduceMotion || !settings.enabled || !!(shown ?? invitation)?.outgoing;
  const timeline = useMemo(() => timelineOf(settings), [settings]);
  const total = simple ? SIMPLE_MS : timeline.total;
  const t = useSharedValue(0);
  const [closing, setClosing] = useState(false);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [cardHeight, setCardHeight] = useState(0);
  const started = useRef<string | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Une seule carte à la fois : la suivante attend que la fermeture soit terminée.
  useEffect(() => {
    if (invitation && !shown) {
      setShown(invitation);
      return;
    }
    if (shown && invitation?.id !== shown.id && !closing) {
      setClosing(true);
      const duration = total / (acceptedId === shown.id ? 2.6 : 1.9);
      t.value = withTiming(0, { duration, easing: Easing.linear });
      closeTimer.current = setTimeout(() => {
        closeTimer.current = null;
        started.current = null;
        setClosing(false);
        setCardHeight(0);
        setShown(null);
      }, duration + 30);
    }
  }, [invitation, shown, closing, total, acceptedId, t]);

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    navLift.value = 0;
  }, []);

  useEffect(() => {
    if (!shown || !size || !cardHeight || closing || started.current === shown.id) return;
    started.current = shown.id;
    t.value = 0;
    t.value = withTiming(total, { duration: total, easing: Easing.linear });
  }, [shown, size, cardHeight, closing, total, t]);

  const liftBy = simple ? 0 : settings.navLift;
  useAnimatedReaction(
    () => t.value,
    (value) => {
      navLift.value = -liftBy * outCubic(clamp(value / timeline.veil));
    },
    [liftBy, timeline],
  );

  const later = useRef(onLater);
  later.current = onLater;
  const isShown = !!shown;
  useEffect(() => {
    if (!isShown || Platform.OS === 'web') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      later.current();
      return true;
    });
    return () => subscription.remove();
  }, [isShown]);

  const tear = useMemo(
    () => (shown && size && cardHeight ? buildTear(size.width, size.height, cardHeight * Math.min(1, (size.height - 40) / cardHeight), settings, shown.id) : null),
    [shown, size, cardHeight, settings],
  );

  const blurStyle = useAnimatedStyle(() => ({ opacity: simple ? clamp(t.value / SIMPLE_MS) : smooth(clamp(t.value / timeline.veil)) }), [simple, timeline]);
  const veilStyle = useAnimatedStyle(() => {
    const target = settings.veil / 100;
    if (simple) return { opacity: Math.max(target, 0.76) * clamp(t.value / SIMPLE_MS) };
    const deepen = 0.08 * clamp((t.value - timeline.tearStart) / Math.max(1, timeline.tearRun));
    return { opacity: target * smooth(clamp(t.value / timeline.veil)) + deepen };
  }, [simple, timeline, settings.veil]);
  const tearStyle = useAnimatedStyle(() => ({ opacity: t.value > timeline.tearStart ? 1 : 0 }), [timeline]);

  const fit = size && cardHeight ? Math.min(1, (size.height - 40) / cardHeight) : 1;
  const bounce = 1.7 * (settings.bounce / 100);
  const cardStyle = useAnimatedStyle(() => {
    if (simple) return { opacity: clamp((t.value - 60) / 160), transform: [{ scale: fit }] };
    const c = clamp((t.value - timeline.cardStart) / timeline.cardRun);
    return { opacity: clamp(c / 0.42), transform: [{ translateY: (1 - outCubic(c)) * 16 }, { scale: fit * (0.9 + 0.1 * back(c, bounce)) }] };
  }, [simple, timeline, fit, bounce]);

  if (!shown) return null;
  // Les données restent à jour tant que c'est la même invitation ; sinon la carte en cours de fermeture garde les siennes.
  const live = invitation?.id === shown.id ? invitation : shown;
  const accepted = acceptedId === live.id;
  const cardWidth = Math.min(CARD_MAX_WIDTH, (size?.width ?? CARD_MAX_WIDTH + 40) - 40);
  const pseudoSize = live.pseudo.length > 14 ? 22 : 29;
  const disabled = busy || closing || accepted;

  return (
    <View
      pointerEvents={closing ? 'none' : 'auto'}
      accessibilityViewIsModal
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setSize((old) => (old?.width === width && old.height === height ? old : { width, height }));
      }}
      style={styles.root}>
      {settings.blur > 0 && (
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, blurStyle]}>
          <BlurView blurTarget={appBlurTarget} blurMethod="dimezisBlurView" blurReductionFactor={1.2} intensity={settings.blur * 5} style={StyleSheet.absoluteFill} />
        </Animated.View>
      )}
      <Animated.View pointerEvents="none" style={[styles.veil, veilStyle]} />

      {!simple && tear && size && (
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, tearStyle]}>
          <Svg width={size.width} height={size.height}>
            <Defs>
              <SvgGradient id="inviteBackdrop" gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={size.width} y2={size.height}>
                <Stop offset="0" stopColor={settings.backdropStart} />
                <Stop offset="0.55" stopColor={settings.backdropMiddle} />
                <Stop offset="1" stopColor={settings.backdropEnd} />
              </SvgGradient>
              <RadialGradient id="inviteFlash" gradientUnits="userSpaceOnUse" cx={size.width / 2} cy={size.height / 2} r={size.height * 0.36} fx={size.width / 2} fy={size.height / 2}>
                <Stop offset="0" stopColor="#FFFFFF" />
                <Stop offset="0.45" stopColor={settings.backdropEnd} stopOpacity={0.6} />
                <Stop offset="1" stopColor={settings.backdropMiddle} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <TearPath t={t} tear={tear} timeline={timeline} part="hole" fill="url(#inviteBackdrop)" />
            <Flash t={t} timeline={timeline} strength={settings.flash / 100} cx={size.width / 2} cy={size.height / 2} r={size.height * 0.36} />
            <TearPath t={t} tear={tear} timeline={timeline} part="shadow3" strength={0.1} fill="none" stroke={Colors.navy} strokeWidth={40} />
            <TearPath t={t} tear={tear} timeline={timeline} part="shadow2" strength={0.16} fill="none" stroke={Colors.navy} strokeWidth={22} />
            <TearPath t={t} tear={tear} timeline={timeline} part="shadow1" strength={0.24} fill="none" stroke={Colors.navy} strokeWidth={10} />
            <TearPath t={t} tear={tear} timeline={timeline} part="lipTop" fill={settings.paper} />
            <TearPath t={t} tear={tear} timeline={timeline} part="lipBottom" fill={settings.paper} />
            <TearPath t={t} tear={tear} timeline={timeline} part="glowTop" strength={settings.glow / 100} fill="none" stroke={settings.edgeTop} strokeWidth={8} />
            <TearPath t={t} tear={tear} timeline={timeline} part="glowBottom" strength={settings.glow / 100} fill="none" stroke={settings.edgeBottom} strokeWidth={8} />
            <TearPath t={t} tear={tear} timeline={timeline} part="rimTop" fill="none" stroke={settings.edgeTop} strokeWidth={1.2} />
            <TearPath t={t} tear={tear} timeline={timeline} part="rimBottom" fill="none" stroke={settings.edgeBottom} strokeWidth={1.2} />
          </Svg>
          {Array.from({ length: settings.shards }, (_, i) => (
            <Shard key={i} t={t} index={i} tear={tear} timeline={timeline} color={i % 4 === 3 ? settings.edgeTop : settings.paper} />
          ))}
        </Animated.View>
      )}

      <Animated.View
        accessibilityLabel={live.outgoing ? 'Invitation envoyée' : 'Invitation à un duel'}
        onLayout={(e) => {
          const height = e.nativeEvent.layout.height;
          setCardHeight((old) => (old === height ? old : height));
        }}
        style={[styles.card, { width: cardWidth }, cardStyle]}>
        <Item t={t} index={0} timeline={timeline} simple={simple}>
          <Text style={[styles.title, cardWidth < 310 && { fontSize: 29 }]} numberOfLines={1}>{live.outgoing ? 'DÉFI ENVOYÉ !' : 'ON TE DÉFIE !'}</Text>
          <Svg width={158} height={11} viewBox="0 0 158 11" style={{ marginTop: 5 }}>
            <Path d="M0 7 L14 4 L22 8 L37 3 L49 7 L63 2 L74 8 L91 4 L102 9 L118 3 L131 7 L146 4 L158 6" fill="none" stroke={Colors.accent} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
          </Svg>
        </Item>
        <Item t={t} index={1} timeline={timeline} simple={simple} avatar>
          <View style={styles.avatar}>
            <Avatar name={live.pseudo} color={avatarColor(live.personId)} uri={live.avatar} size={104} />
          </View>
        </Item>
        <Item t={t} index={2} timeline={timeline} simple={simple}>
          <Text style={[styles.pseudo, { fontSize: pseudoSize, lineHeight: pseudoSize * 1.25 }]} numberOfLines={1}>{live.pseudo}</Text>
        </Item>
        <Item t={t} index={3} timeline={timeline} simple={simple}>
          <Text style={styles.says}>{live.outgoing ? 'Doit répondre à ton défi' : 'Te lance un défi !'}</Text>
        </Item>
        <Item t={t} index={4} timeline={timeline} simple={simple}>
          <View style={styles.theme}>
            <View style={styles.themeRow}>
              <ThemeIcon themeId={live.themeId} size={46} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.themeLabel}>THÈME DU DÉFI</Text>
                <Text style={styles.themeName} numberOfLines={2}>{live.themeName}</Text>
              </View>
            </View>
            <View style={styles.timeRow}>
              <Text style={styles.time}>Expire dans {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</Text>
              <View style={styles.bar}>
                <View style={[styles.barFill, { width: `${Math.round(clamp(fraction) * 100)}%` }]} />
              </View>
            </View>
          </View>
        </Item>
        <Item t={t} index={5} timeline={timeline} simple={simple}>
          {!!error && <Text style={styles.error}>{error}</Text>}
          {live.outgoing ? (
            <>
              <Pressable accessibilityRole="button" disabled={disabled} onPress={onRefuse} style={({ pressed }) => [styles.cancel, pressed && styles.minorPressed]}>
                <Text style={styles.cancelLabel}>ANNULER L’INVITATION</Text>
              </Pressable>
              <View style={styles.minor}>
                <Pressable accessibilityRole="button" disabled={disabled} onPress={onLater} style={({ pressed }) => [styles.minorButton, pressed && styles.minorPressed]}>
                  <Text style={styles.later}>Fermer</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <Pressable
                accessibilityRole="button"
                disabled={disabled}
                onPress={onAccept}
                style={({ pressed }) => [styles.accept, accepted && styles.accepted, pressed && styles.acceptPressed]}>
                <Text style={styles.acceptLabel}>{accepted ? 'C’EST PARTI !' : 'ACCEPTER LE DÉFI'}</Text>
                {!accepted && <Sheen disabled={simple} />}
              </Pressable>
              <View style={styles.minor}>
                <Pressable accessibilityRole="button" disabled={disabled} onPress={onLater} style={({ pressed }) => [styles.minorButton, pressed && styles.minorPressed]}>
                  <Text style={styles.later}>Plus tard</Text>
                </Pressable>
                <View style={styles.minorLine} />
                <Pressable accessibilityRole="button" disabled={disabled} onPress={onRefuse} style={({ pressed }) => [styles.minorButton, pressed && styles.minorPressed]}>
                  <Text style={styles.refuse}>Refuser</Text>
                </Pressable>
              </View>
            </>
          )}
        </Item>
      </Animated.View>
    </View>
  );
}

/** Branche la carte sur les vraies invitations, reçues ou envoyées. */
export function DuelInviteHost() {
  const { liveInvitations, invitesEnabled, clockOffset, respondInvitation, dismissInvitation, playerId, catalogVersion } = useGameServer();
  void catalogVersion;
  const settings = useApi<{ duelInvite: DuelInviteAnimation }>(playerId ? '/api/animations' : null);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [acceptedId, setAcceptedId] = useState<string | null>(null);
  const active = liveInvitations.length > 0;

  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [active]);

  const current = currentInvitation(liveInvitations, invitesEnabled, clockOffset);
  const invitation = current ?? null;
  const id = invitation?.id;
  useEffect(() => setError(''), [id]);

  const respond = async (action: 'accept' | 'decline' | 'cancel') => {
    if (!invitation || busy) return;
    setBusy(true);
    setError('');
    if (action === 'accept') setAcceptedId(invitation.id);
    try {
      await respondInvitation(invitation, action);
    } catch {
      setAcceptedId(null);
      setError('Cette invitation n’est plus disponible.');
    } finally {
      setBusy(false);
    }
  };

  const data = useMemo<DuelInviteData | null>(() => {
    if (!invitation) return null;
    const person = invitation.incoming ? invitation.sender : invitation.receiver;
    return {
      id: invitation.id,
      personId: person.id,
      pseudo: person.pseudo,
      avatar: person.avatar,
      outgoing: !invitation.incoming,
      themeId: invitation.themeId,
      themeName: getTheme(invitation.themeId)?.name ?? 'Duel',
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invitation?.id, invitation?.incoming, invitation?.sender.pseudo, invitation?.sender.avatar, invitation?.receiver.pseudo, invitation?.receiver.avatar, invitation?.themeId, catalogVersion]);

  const remaining = invitation ? invitation.expiresAt - (now + clockOffset) : 0;
  const lifetime = invitation ? invitation.expiresAt - invitation.createdAt : 1;

  return (
    <DuelInviteOverlay
      invitation={data}
      settings={settings.data?.duelInvite ?? DUEL_INVITE_DEFAULTS}
      seconds={Math.max(0, Math.ceil(remaining / 1000))}
      fraction={lifetime > 0 ? remaining / lifetime : 0}
      error={error}
      busy={busy}
      acceptedId={acceptedId}
      onAccept={() => void respond('accept')}
      onLater={() => id && dismissInvitation(id)}
      onRefuse={() => void respond(invitation && !invitation.incoming ? 'cancel' : 'decline')}
    />
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, zIndex: 50, alignItems: 'center', justifyContent: 'center' },
  veil: { ...StyleSheet.absoluteFill, backgroundColor: Colors.navy },
  shard: { position: 'absolute', left: 0, top: 0 },
  card: { paddingTop: 24, paddingHorizontal: 22, paddingBottom: 10, borderRadius: 30, backgroundColor: Colors.surface, alignItems: 'center', boxShadow: '0 28px 60px rgba(14, 15, 43, 0.42)' },
  item: { width: '100%', alignItems: 'center' },
  title: { fontFamily: Fonts.score, fontSize: 34, lineHeight: 38, color: Colors.ink, transform: [{ skewX: '-7deg' }] },
  avatar: { marginTop: 12, borderRadius: 52, boxShadow: '0 8px 26px rgba(252, 2, 102, 0.32)' },
  pseudo: { marginTop: 9, maxWidth: '100%', fontFamily: Fonts.extraBold, color: Colors.ink },
  says: { fontFamily: Fonts.semiBold, fontSize: 15, lineHeight: 21, color: Colors.textMuted },
  theme: { width: '100%', marginTop: 16, paddingTop: 12, paddingBottom: 11, paddingHorizontal: 14, borderRadius: 18, backgroundColor: Colors.surfaceRaised },
  themeRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  themeLabel: { fontFamily: Fonts.bold, fontSize: 11, lineHeight: 15, letterSpacing: 1.5, color: Colors.violetInk },
  themeName: { fontFamily: Fonts.bold, fontSize: 19, lineHeight: 24, color: Colors.ink },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 10 },
  time: { fontFamily: Fonts.semiBold, fontSize: 11.5, lineHeight: 16, color: Colors.accentInk, fontVariant: ['tabular-nums'] },
  bar: { flex: 1, height: 3, borderRadius: 2, backgroundColor: Colors.border, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: Colors.accent },
  error: { fontFamily: Fonts.semiBold, fontSize: 13, lineHeight: 18, color: Colors.wrong, marginTop: 10, textAlign: 'center' },
  accept: { width: '100%', height: 58, marginTop: 15, borderRadius: 18, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: Colors.accentFill, boxShadow: '0 5px 0 #B80058, 0 14px 26px rgba(252, 2, 102, 0.3)' },
  acceptPressed: { transform: [{ translateY: 4 }, { scale: 0.985 }], boxShadow: '0 1px 0 #B80058, 0 6px 14px rgba(252, 2, 102, 0.28)' },
  accepted: { backgroundColor: Colors.correct, boxShadow: '0 5px 0 #0F7A37, 0 14px 26px rgba(22, 163, 74, 0.3)' },
  acceptLabel: { fontFamily: Fonts.extraBold, fontSize: 17, lineHeight: 24, letterSpacing: 0.4, color: Colors.onAccent },
  sheen: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 70, backgroundColor: 'rgba(255, 255, 255, 0.26)' },
  cancel: { width: '100%', height: 58, marginTop: 15, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: Colors.accent, backgroundColor: Colors.surface },
  cancelLabel: { fontFamily: Fonts.extraBold, fontSize: 15.5, lineHeight: 22, letterSpacing: 0.4, color: Colors.accentInk },
  minor: { width: '100%', flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  minorButton: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  minorPressed: { backgroundColor: Colors.surfaceRaised, transform: [{ scale: 0.95 }] },
  minorLine: { width: 1, height: 18, backgroundColor: Colors.border },
  later: { fontFamily: Fonts.semiBold, fontSize: 14.5, lineHeight: 20, color: Colors.ink },
  refuse: { fontFamily: Fonts.semiBold, fontSize: 14.5, lineHeight: 20, color: Colors.textMuted },
});
