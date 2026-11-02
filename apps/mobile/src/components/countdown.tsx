import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { AppText } from '@/components/ui';
import { Colors } from '@/constants/theme';

/** Chrono de réponse : une barre qui se vide et passe du turquoise au rouge, avec les secondes. */
export function Countdown({
  running,
  startedAt,
  durationMs,
}: {
  running: boolean;
  startedAt: number;
  durationMs: number;
}) {
  const progress = useSharedValue(1);
  const [remaining, setRemaining] = useState(durationMs);

  useEffect(() => {
    if (!running) {
      cancelAnimation(progress);
      return;
    }
    const left = Math.max(durationMs - (Date.now() - startedAt), 0);
    progress.set(left / durationMs);
    progress.set(withTiming(0, { duration: left, easing: Easing.linear }));
    setRemaining(left);
    const id = setInterval(() => {
      setRemaining(Math.max(durationMs - (Date.now() - startedAt), 0));
    }, 100);
    return () => clearInterval(id);
  }, [running, startedAt, durationMs, progress]);

  const bar = useAnimatedStyle(() => ({
    width: `${progress.get() * 100}%`,
    backgroundColor: interpolateColor(
      progress.get(),
      [0, 0.3, 1],
      [Colors.wrong, Colors.gold, Colors.opponent],
    ),
  }));

  return (
    <View style={styles.row}>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, bar]} />
      </View>
      <AppText variant="label" style={styles.seconds}>
        {running ? Math.ceil(remaining / 1000) : ''}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  track: {
    flex: 1,
    height: 10,
    borderRadius: 10,
    backgroundColor: '#251F44',
    overflow: 'hidden',
  },
  fill: { height: 10, borderRadius: 10 },
  seconds: { width: 24, textAlign: 'right', fontVariant: ['tabular-nums'] },
});
