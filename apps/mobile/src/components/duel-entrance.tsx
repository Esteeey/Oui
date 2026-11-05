import { useEffect, type ReactNode } from 'react';
import { StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

/**
 * Entrée en duel, juste avant la première question : les deux portraits arrivent des bords de l'écran
 * et se posent face à face, pendant que deux demi-barres aux couleurs des joueurs filent l'une vers
 * l'autre et se rejoignent au centre dans un éclat ; la barre de temps habituelle prend alors le relais.
 *
 * Composant indépendant : il ne touche ni au chrono ni aux règles. Il reçoit le haut d'écran déjà construit
 * (portraits, compteur, barre de temps) et ne fait que l'animer ; terminé, désactivé ou en animation
 * réduite, il rend exactement la mise en page habituelle.
 * Les instants partent de `elapsed` (temps écoulé depuis le début de la question, horloge du serveur) :
 * les deux joueurs voient la même séquence au même moment, et un écran ouvert en cours de route la reprend
 * là où elle en est.
 */

/** Réglages de la séquence (ms depuis le début de la première question). */
export const ENTRANCE = {
  /** Arrivée des portraits, depuis les bords. */
  portraits: { from: 0, to: 620 },
  /** Course des deux demi-barres jusqu'au centre. */
  bars: { from: 120, to: 700 },
  /** Éclat au point de rencontre. */
  flash: { from: 680, to: 1050 },
  /** Passage des demi-barres colorées à la barre de temps habituelle. */
  handover: { from: 820, to: 1100 },
  /** Apparition du compteur central. */
  counter: { from: 450, to: 750 },
  total: 1100,
} as const;

const easeOut = Easing.out(Easing.cubic);
const easeInOut = Easing.inOut(Easing.cubic);

/** Avancement (0 → 1, déjà adouci) d'une étape de la séquence. */
function step(t: number, range: { from: number; to: number }, ease: (x: number) => number) {
  'worklet';
  const x = Math.min(1, Math.max(0, (t - range.from) / (range.to - range.from)));
  return ease(x);
}

type Slots = {
  left: ReactNode;
  center: ReactNode;
  right: ReactNode;
  /** La barre de temps habituelle, révélée une fois les demi-barres réunies. */
  bar: ReactNode;
  leftColor: string;
  rightColor: string;
  headerStyle: StyleProp<ViewStyle>;
};

export function DuelEntrance({ active, elapsed, ...slots }: Slots & { active: boolean; elapsed: number }) {
  const reduced = useReducedMotion();
  const run = active && !reduced && elapsed < ENTRANCE.total;
  const t = useSharedValue(run ? Math.max(0, elapsed) : ENTRANCE.total);

  useEffect(() => {
    if (!run) return;
    t.set(withTiming(ENTRANCE.total, { duration: Math.max(0, ENTRANCE.total - t.get()), easing: Easing.linear }));
    // Une seule fois (le composant est remonté pour chaque duel) : pas de relance aux rendus suivants.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!run) {
    const { left, center, right, bar, headerStyle } = slots;
    return (
      <>
        <View style={headerStyle}>
          {left}
          {center}
          {right}
        </View>
        {bar}
      </>
    );
  }
  return <Sequence t={t} {...slots} />;
}

function Sequence({ t, left, center, right, bar, leftColor, rightColor, headerStyle }: Slots & { t: SharedValue<number> }) {
  const { width } = useWindowDimensions();
  // Portraits : depuis les bords de l'écran, rapides puis freinés.
  const leftIn = useAnimatedStyle(() => ({
    transform: [{ translateX: -width * (1 - step(t.get(), ENTRANCE.portraits, easeOut)) }],
  }));
  const rightIn = useAnimatedStyle(() => ({
    transform: [{ translateX: width * (1 - step(t.get(), ENTRANCE.portraits, easeOut)) }],
  }));
  const counterIn = useAnimatedStyle(() => {
    const p = step(t.get(), ENTRANCE.counter, easeOut);
    return { opacity: p, transform: [{ scale: interpolate(p, [0, 1], [0.6, 1]) }] };
  });
  // Demi-barres : chacune part de son bord et file vers le centre, puis s'efface devant la barre habituelle.
  const half = useAnimatedStyle(() => ({
    width: `${50 * step(t.get(), ENTRANCE.bars, easeInOut)}%`,
    opacity: 1 - step(t.get(), ENTRANCE.handover, easeOut),
  }));
  // Éclat au point de rencontre : s'élargit et s'efface.
  const flash = useAnimatedStyle(() => {
    const p = step(t.get(), ENTRANCE.flash, easeOut);
    return {
      opacity: t.get() >= ENTRANCE.flash.from ? 1 - p : 0,
      transform: [{ scaleX: interpolate(p, [0, 1], [0.4, 3]) }, { scaleY: interpolate(p, [0, 1], [0.6, 1.4]) }],
    };
  });
  const barIn = useAnimatedStyle(() => ({ opacity: step(t.get(), ENTRANCE.handover, easeOut) }));

  return (
    <>
      <View style={headerStyle}>
        <Animated.View style={[styles.side, leftIn]}>{left}</Animated.View>
        <Animated.View style={counterIn}>{center}</Animated.View>
        <Animated.View style={[styles.side, rightIn]}>{right}</Animated.View>
      </View>
      <View>
        <Animated.View style={barIn}>{bar}</Animated.View>
        <View style={styles.halves} pointerEvents="none">
          <Animated.View style={[styles.half, { left: 0, backgroundColor: leftColor }, half]} />
          <Animated.View style={[styles.half, { right: 0, backgroundColor: rightColor }, half]} />
          <Animated.View style={[styles.flash, flash]} />
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  side: { flex: 1 },
  halves: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  half: { position: 'absolute', top: 0, bottom: 0, borderRadius: 4 },
  flash: { width: 28, height: 12, borderRadius: 6, backgroundColor: '#FFFFFF', shadowColor: '#FFFFFF', shadowOpacity: 0.9, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } },
});
