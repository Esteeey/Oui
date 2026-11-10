import { useEffect, useMemo, useState } from 'react';
import { Colors } from '@/constants/theme';
import { StyleSheet, View } from 'react-native';
import Animated, { ZoomIn, useReducedMotion } from 'react-native-reanimated';

import { levelFromXp, type Rewards } from '@qu1z/shared';

import { AppText } from '@/components/ui';

export interface XpSegment {
  label: string;
  value: number;
  color: string;
}

/** Segments d'XP d'un duel, dans l'ordre de remplissage : score, bonus fin, bonus victoire, bonus boost. */
export function xpSegments(r: Rewards): XpSegment[] {
  return [
    { label: 'Score', value: r.scorePoints ?? 0, color: '#3B82F6' },
    { label: 'Bonus fin', value: r.finishBonus, color: '#22C55E' },
    { label: 'Bonus victoire', value: r.victoryBonus, color: '#F5B700' },
    { label: 'Bonus boost', value: r.boostBonus, color: Colors.accent },
  ].filter((s) => s.value > 0);
}

/**
 * Barre d'XP qui se remplit segment par segment (score, bonus fin, bonus victoire, bonus boost), en partant
 * de l'XP d'avant le duel. Si un seuil de niveau est franchi, la barre repart du début du nouveau niveau et
 * « Niveau supérieur ! » apparaît. Avec « réduire les animations », l'état final s'affiche tout de suite.
 */
export function XpProgress({ xpBefore, rewards, delayMs = 0, durationMs = 1650 }: { xpBefore: number; rewards: Rewards; delayMs?: number; durationMs?: number }) {
  const reduced = useReducedMotion();
  const segments = useMemo(() => xpSegments(rewards), [rewards]);
  const gained = segments.reduce((t, s) => t + s.value, 0);
  const xpAfter = xpBefore + gained;
  const [shown, setShown] = useState(reduced ? xpAfter : xpBefore);

  useEffect(() => {
    if (reduced || gained === 0) {
      setShown(xpAfter);
      return;
    }
    setShown(xpBefore);
    let raf = 0;
    let start = 0;
    const tick = (now: number) => {
      if (!start) start = now;
      const t = Math.min(1, (now - start) / durationMs);
      setShown(Math.round(xpBefore + gained * t));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    const timer = setTimeout(() => (raf = requestAnimationFrame(tick)), delayMs);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [reduced, xpBefore, xpAfter, gained, delayMs, durationMs]);

  const level = levelFromXp(shown);
  const startLevel = levelFromXp(xpBefore).level;
  const levelStart = shown - level.current;
  const levelEnd = levelStart + level.needed;
  const leveledUp = level.level > startLevel;

  // Morceaux colorés visibles dans le niveau affiché : chaque segment occupe [début, fin] en XP absolue.
  let cursor = xpBefore;
  const pieces = segments.map((s) => {
    const from = cursor;
    cursor += s.value;
    const a = Math.max(from, levelStart);
    const b = Math.min(cursor, shown, levelEnd);
    return { ...s, width: b > a && level.needed ? (b - a) / level.needed : 0 };
  });
  const baseWidth = level.needed ? Math.max(0, Math.min(xpBefore, shown) - levelStart) / level.needed : 1;
  const current = shown < xpAfter ? ([...pieces].reverse().find((p) => p.width > 0) ?? null) : null;

  return (
    <View style={{ gap: 8 }}>
      <View style={styles.row}>
        <AppText style={styles.text}>Niveau {level.level}</AppText>
        <AppText style={styles.text}>{level.needed ? `${level.current} / ${level.needed}` : 'Niveau maximal'}</AppText>
      </View>
      <View style={styles.track} accessible accessibilityLabel={`XP : ${shown}, niveau ${level.level}, ${Math.round(level.progress * 100)} % du niveau`}>
        <View style={[styles.fill, { width: `${baseWidth * 100}%`, backgroundColor: '#7C5CFF' }]} />
        {pieces.map((p) => (p.width > 0 ? <View key={p.label} style={[styles.fill, { width: `${p.width * 100}%`, backgroundColor: p.color }]} /> : null))}
      </View>
      <View style={styles.legend}>
        {segments.map((s) => (
          <View key={s.label} style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: s.color }]} />
            <AppText variant="caption" color={current?.label === s.label ? '#FFFFFF' : '#A1A1AA'}>
              {s.label} +{s.value}
            </AppText>
          </View>
        ))}
      </View>
      {leveledUp && (
        <Animated.View entering={reduced ? undefined : ZoomIn.springify()} style={styles.levelUp} accessibilityLiveRegion="polite">
          <AppText style={styles.levelUpText}>Niveau supérieur ! Niveau {level.level}</AppText>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  text: { color: '#FFFFFF', fontWeight: '700' },
  track: { height: 14, borderRadius: 999, backgroundColor: '#2E2E33', overflow: 'hidden', flexDirection: 'row' },
  fill: { height: '100%' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  levelUp: { alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 6, borderRadius: 999, backgroundColor: '#F5B700' },
  levelUpText: { color: '#000000', fontWeight: '900' },
});
