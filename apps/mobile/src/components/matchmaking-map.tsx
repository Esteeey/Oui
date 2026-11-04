import { memo, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { ZoomIn, ZoomOut } from 'react-native-reanimated';

import { AppText } from '@/components/ui';
import { WORLD_DOTS } from '@/components/world-dots';
import { avatarColor } from '@/utils/avatar';

const COLS = WORLD_DOTS[0].length;
const ROWS = WORLD_DOTS.length;
/** Cases de terre où une épingle peut apparaître (on évite le Grand Nord, presque inhabité). */
const SPOTS: [number, number][] = WORLD_DOTS.flatMap((line, r) =>
  r < 3 ? [] : [...line].flatMap((ch, c) => (ch === '#' ? [[c, r] as [number, number]] : [])),
);
const LETTERS = 'ABCDEFGHIJKLMNOPRSTVZ';
/** Nombre d'épingles visibles en même temps ; au-delà, la plus ancienne s'en va. */
const MAX_PINS = 15;
const PIN = 22;

interface Pin {
  key: number;
  col: number;
  row: number;
  letter: string;
  color: string;
}

let nextKey = 0;
function randomPin(taken: Pin[]): Pin {
  // Pas deux épingles collées : on retire jusqu'à trouver une case libre autour (20 essais au plus).
  let col = 0;
  let row = 0;
  for (let i = 0; i < 20; i++) {
    [col, row] = SPOTS[Math.floor(Math.random() * SPOTS.length)];
    if (taken.every((p) => Math.abs(p.col - col) > 4 || Math.abs(p.row - row) > 4)) break;
  }
  const key = nextKey++;
  return { key, col, row, letter: LETTERS[Math.floor(Math.random() * LETTERS.length)], color: avatarColor(`pin${key}${Math.random()}`) };
}

/**
 * Recherche d'adversaire : carte du monde en points, sur laquelle des joueurs apparaissent un à un,
 * au hasard, en épingles qui rebondissent. Design plat (ni ombre ni contour).
 */
export function MatchmakingMap({ label }: { label: string }) {
  const [width, setWidth] = useState(0);
  const [pins, setPins] = useState<Pin[]>([]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const add = () => {
      setPins((list) => {
        const next = [...list, randomPin(list)];
        return next.length > MAX_PINS ? next.slice(1) : next;
      });
      // Rythme irrégulier : une quinzaine d'épingles en 4 s environ, puis la carte continue de vivre.
      timer = setTimeout(add, 120 + Math.random() * 300);
    };
    timer = setTimeout(add, 250);
    return () => clearTimeout(timer);
  }, []);

  const cell = width / COLS;
  return (
    <View style={styles.wrap} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && (
        <View style={{ width, height: cell * ROWS }}>
          <Dots cell={cell} />
          {pins.map((p) => (
            <Animated.View
              key={p.key}
              entering={ZoomIn.springify().damping(8).stiffness(220)}
              exiting={ZoomOut.duration(180)}
              style={[styles.pin, { left: (p.col + 0.5) * cell - PIN / 2, top: (p.row + 0.5) * cell - PIN - 6 }]}>
              <View style={[styles.head, { backgroundColor: p.color }]}>
                <AppText variant="label" color="#FFFFFF" style={styles.letter}>
                  {p.letter}
                </AppText>
              </View>
              <View style={[styles.tip, { borderTopColor: p.color }]} />
            </Animated.View>
          ))}
        </View>
      )}
      <AppText variant="caption" color="#9A9AA3" style={styles.label}>
        {label}
      </AppText>
    </View>
  );
}

/** Les points de la carte (dessinés une fois). */
const Dots = memo(function Dots({ cell }: { cell: number }) {
  const dot = Math.max(2, cell * 0.62);
  const items = useMemo(
    () =>
      WORLD_DOTS.flatMap((line, r) =>
        [...line].flatMap((ch, c) =>
          ch === '#'
            ? [
                <View
                  key={`${c}-${r}`}
                  style={[styles.dot, { width: dot, height: dot, borderRadius: dot / 2, left: (c + 0.5) * cell - dot / 2, top: (r + 0.5) * cell - dot / 2 }]}
                />,
              ]
            : [],
        ),
      ),
    [cell, dot],
  );
  return <>{items}</>;
});

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch', gap: 18, alignItems: 'center' },
  dot: { position: 'absolute', backgroundColor: '#4A4A56' },
  pin: { position: 'absolute', width: PIN, alignItems: 'center' },
  head: { width: PIN, height: PIN, borderRadius: PIN / 2, alignItems: 'center', justifyContent: 'center' },
  letter: { fontSize: 11, lineHeight: 13 },
  // Pointe de l'épingle (triangle) : la base touche le rond, la pointe touche le point de la carte.
  tip: {
    width: 0,
    height: 0,
    marginTop: -1,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  label: { letterSpacing: 2, textTransform: 'uppercase', textAlign: 'center' },
});
