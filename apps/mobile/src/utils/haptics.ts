import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

export type HapticKind = 'tap' | 'success' | 'error' | 'warning';

const WEB_PATTERN: Record<HapticKind, number | number[]> = {
  tap: 10,
  success: [12, 40, 18],
  error: [30, 40, 30],
  warning: 24,
};

/** Retour physique d'un moment important du jeu ; joué au même endroit que le son correspondant. */
export function haptic(kind: HapticKind): void {
  if (Platform.OS === 'web') {
    // Les navigateurs refusent la vibration tant que la personne n'a pas touché la page.
    if (typeof navigator === 'undefined' || !navigator.vibrate || navigator.userActivation?.hasBeenActive === false) return;
    try {
      navigator.vibrate(WEB_PATTERN[kind]);
    } catch {
      // Vibration indisponible : le son et l'animation suffisent.
    }
    return;
  }
  const played =
    kind === 'tap'
      ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      : Haptics.notificationAsync(
          kind === 'success'
            ? Haptics.NotificationFeedbackType.Success
            : kind === 'error'
              ? Haptics.NotificationFeedbackType.Error
              : Haptics.NotificationFeedbackType.Warning,
        );
  played.catch(() => {});
}
