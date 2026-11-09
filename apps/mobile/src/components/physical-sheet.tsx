import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  cancelAnimation,
  interpolate,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Colors } from '@/constants/theme';

/** Permet à la feuille de finir son animation de sortie après que l'écran l'a fermée. */
export const SheetPresence = createContext<{ closing: boolean; onExited: () => void } | null>(null);

const SETTLE = { duration: 300, dampingRatio: 1 };
const THROWN = { duration: 300, dampingRatio: 0.8 };
const LEAVE = { duration: 280, dampingRatio: 1 };

/** Résistance croissante quand on tire la feuille au-delà de sa position ouverte. */
function rubberBand(overshoot: number, size: number): number {
  'worklet';
  const stretch = 0.55;
  return (overshoot * size * stretch) / (size + stretch * overshoot);
}

/** Vitesse en px/s → distance que parcourrait la feuille si on la lâchait (décélération d'un défilement). */
function projection(velocity: number): number {
  'worklet';
  return ((velocity / 1000) * 0.998) / (1 - 0.998);
}

/**
 * Feuille qui monte du bas et qui suit le doigt : on la tire par sa poignée, on peut la lancer vers le bas
 * ou la rattraper en plein mouvement. Elle repart par le chemin d'où elle est venue.
 */
export function PhysicalSheet({ onClose, style, children }: { onClose: () => void; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const presence = useContext(SheetPresence);
  const closing = presence?.closing ?? false;
  const reduced = useReducedMotion();
  const { height: windowHeight } = useWindowDimensions();
  const height = useSharedValue(0);
  const y = useSharedValue(reduced ? 0 : windowHeight);
  const fade = useSharedValue(reduced ? 0 : 1);
  const dragStart = useSharedValue(0);
  const leaving = useSharedValue(false);
  const opened = useRef(false);

  const exited = () => presence?.onExited();

  const enter = () => {
    leaving.set(false);
    if (reduced) {
      y.set(0);
      fade.set(withTiming(1, { duration: 180 }));
    } else {
      y.set(withSpring(0, SETTLE));
    }
  };

  const leave = (velocity: number) => {
    'worklet';
    leaving.set(true);
    if (reduced) fade.set(withTiming(0, { duration: 160 }));
    else y.set(withSpring(height.get() || windowHeight, { ...LEAVE, velocity }));
  };

  // La feuille cède la place dès qu'elle est sortie de l'écran, sans attendre la fin de son ressort.
  useAnimatedReaction(
    () => leaving.get() && (reduced ? fade.get() <= 0.01 : height.get() > 0 && y.get() >= height.get() - 1),
    (gone, wasGone) => {
      if (gone && !wasGone) runOnJS(exited)();
    },
  );

  useEffect(() => {
    if (closing) {
      if (!leaving.get()) leave(0);
    } else if (leaving.get()) {
      enter();
    }
    // Seule la demande de fermeture de l'écran relance l'animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closing]);

  const pan = Gesture.Pan()
    .enabled(!closing)
    .minDistance(4)
    .onBegin(() => {
      cancelAnimation(y);
      dragStart.set(y.get());
    })
    .onUpdate((e) => {
      const next = dragStart.get() + e.translationY;
      y.set(next >= 0 ? next : -rubberBand(-next, height.get() || windowHeight));
    })
    .onEnd((e) => {
      if (y.get() + projection(e.velocityY) > height.get() / 2) {
        leave(e.velocityY);
        runOnJS(onClose)();
      } else {
        y.set(reduced ? withTiming(0, { duration: 120 }) : withSpring(0, { ...THROWN, velocity: e.velocityY }));
      }
    })
    .onFinalize((_e, success) => {
      if (!success && !leaving.get()) y.set(reduced ? withTiming(0, { duration: 120 }) : withSpring(0, SETTLE));
    });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() }], opacity: fade.get() }));
  const backdropStyle = useAnimatedStyle(() => {
    const size = height.get();
    return { opacity: size === 0 ? 0 : fade.get() * interpolate(y.get(), [0, size], [1, 0], Extrapolation.CLAMP) };
  });

  return (
    <GestureHandlerRootView style={styles.root}>
      <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Fermer" onPress={onClose} style={styles.backdrop} />
      </Animated.View>
      <KeyboardAvoidingView pointerEvents="box-none" behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.place}>
        <Animated.View
          accessibilityViewIsModal
          onLayout={(e) => {
            const size = e.nativeEvent.layout.height;
            height.set(size);
            if (opened.current) return;
            opened.current = true;
            if (!reduced) y.set(size);
            // Refermée avant son premier affichage : elle ne s'ouvre pas, la réaction ci-dessus la retire.
            if (!closing) enter();
          }}
          style={[styles.sheet, style, sheetStyle]}>
          <GestureDetector gesture={pan}>
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.handle}>
              <View style={styles.grab} />
            </View>
          </GestureDetector>
          {children}
        </Animated.View>
      </KeyboardAvoidingView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, zIndex: 40, elevation: 40 },
  backdrop: { flex: 1, backgroundColor: 'rgba(14,15,43,0.45)' },
  place: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  sheet: { width: '100%', borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  handle: { height: 44, alignSelf: 'stretch', alignItems: 'center', paddingTop: 10 },
  grab: { width: 42, height: 5, borderRadius: 3, backgroundColor: Colors.border },
});
