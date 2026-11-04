import Ionicons from '@expo/vector-icons/Ionicons';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing,
  FadeOut,
  ZoomIn,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import type { ParticipantView } from '@qu1z/shared';

import { Avatar } from '@/components/ui';
import { WORLD_DOTS } from '@/components/world-dots';

/** Couleur principale de la recherche, et quelques teintes secondaires discrètes pour varier les épingles. */
const MAGENTA = '#990054';
const SECONDARY = ['#5A4A86', '#2E6B6F', '#7A5C2E'];

const COLS = WORLD_DOTS[0].length;
const ROWS = WORLD_DOTS.length;
const PIN = 30;
const CHOSEN = 46;
/** Défilement : des Amériques jusqu'à l'Asie (position horizontale du centre de l'écran, 0..1). */
const SCROLL_FROM = 0.25;
const SCROLL_TO = 0.76;
/** Le serveur cherche 10 s au plus avant de proposer le bot : la traversée tient dans ce temps. */
const SCROLL_MS = 10_000;
const scrollEase = Easing.inOut(Easing.sin);
const MAX_PINS = 14;
const MAP_HEIGHT = 0.8;
/** Zoom final sur l'adversaire trouvé. */
const ZOOM_FOUND = 1.6;
/** Durée de la sélection de l'adversaire, avant le passage à l'écran de duel. */
export const MATCH_FOUND_MS = 1100;

/** Cases de terre (coordonnées 0..1) où une épingle peut apparaître ; on évite le Grand Nord, presque inhabité. */
const SPOTS: [number, number][] = WORLD_DOTS.flatMap((line, r) =>
  r < 10 ? [] : [...line].flatMap((ch, c) => (ch === '#' ? [[(c + 0.5) / COLS, (r + 0.5) / ROWS] as [number, number]] : [])),
);

type Pin = { key: number; u: number; v: number; color: string; pulse: boolean };

let nextKey = 0;
const scrollAt = (t: number) => SCROLL_FROM + (SCROLL_TO - SCROLL_FROM) * scrollEase(Math.min(1, t / SCROLL_MS));

/**
 * Recherche d'adversaire : la carte du monde occupe tout l'écran et défile d'ouest en est ; des joueurs
 * apparaissent sur les terres qui passent. Quand le serveur trouve l'adversaire (`opponent`), les autres
 * marqueurs s'effacent, le sien grossit, ondule, et la carte s'approche de lui avant l'écran de duel.
 * Les épingles d'ambiance sont anonymes : le serveur ne communique ni la liste ni la position des
 * joueurs en attente (le pays d'un joueur est réservé au classement). Seul l'adversaire final est réel.
 */
export function MatchmakingMap({ opponent }: { opponent: ParticipantView | null }) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [pins, setPins] = useState<Pin[]>([]);
  const [chosen, setChosen] = useState<{ u: number; v: number } | null>(null);
  const start = useRef(Date.now());
  const pinsRef = useRef(pins);
  useEffect(() => {
    pinsRef.current = pins;
  }, [pins]);

  const camU = useSharedValue(SCROLL_FROM);
  const camV = useSharedValue(0.5);
  const zoom = useSharedValue(1);
  const found = opponent !== null;

  /** La carte occupe presque toute la hauteur de l'écran (léger noir en haut et en bas). */
  const mapH = size.h * MAP_HEIGHT;
  const mapW = (mapH * COLS) / ROWS;
  /** Moitié de la largeur visible, en coordonnées de carte (0..1). */
  const half = mapW > 0 ? size.w / mapW / 2 : 0.1;

  // Défilement continu, puis va-et-vient lent si la recherche se prolonge (connexion lente).
  useEffect(() => {
    if (found || size.h === 0) return;
    const elapsed = Date.now() - start.current;
    const remaining = Math.max(0, SCROLL_MS - elapsed);
    camU.set(
      withSequence(
        withTiming(SCROLL_TO, { duration: remaining, easing: scrollEase }),
        withRepeat(withTiming(SCROLL_FROM, { duration: SCROLL_MS * 1.6, easing: scrollEase }), -1, true),
      ),
    );
  }, [found, size.h, camU]);

  // Des joueurs apparaissent sur les terres visibles, surtout du côté qui arrive à l'écran.
  useEffect(() => {
    if (found || size.h === 0) return;
    const id = setInterval(() => {
      const t = Date.now() - start.current;
      const center = t <= SCROLL_MS ? scrollAt(t) : camU.get();
      setPins((list) => {
        const visible = list.filter((p) => p.u > center - half - 0.02);
        const kept = visible.length > MAX_PINS ? visible.slice(visible.length - MAX_PINS) : visible;
        if (Math.random() > 0.7) return kept;
        const pool = SPOTS.filter(([u, v]) => u > center - half * 0.6 && u < center + half * 0.95 && v > 0.12 && v < 0.88);
        if (pool.length === 0) return kept;
        let u = 0;
        let v = 0;
        for (let i = 0; i < 20; i++) {
          [u, v] = pool[Math.floor(Math.random() * pool.length)];
          if (kept.every((p) => Math.hypot((p.u - u) * 2.6, p.v - v) > 0.06)) break;
        }
        const secondary = Math.random() < 0.3;
        return [
          ...kept,
          {
            key: nextKey++,
            u,
            v,
            color: secondary ? SECONDARY[Math.floor(Math.random() * SECONDARY.length)] : MAGENTA,
            pulse: Math.random() < 0.3,
          },
        ];
      });
    }, 190);
    return () => clearInterval(id);
  }, [found, size.h, half, camU]);

  // Adversaire trouvé : il prend la place du joueur visible le plus central, la carte s'approche de lui.
  useEffect(() => {
    if (!found || size.h === 0) return;
    const center = camU.get();
    const list = pinsRef.current;
    let spot: { u: number; v: number };
    if (list.length > 0) {
      spot = list.reduce((best, p) => (Math.abs(p.u - center) + Math.abs(p.v - 0.45) < Math.abs(best.u - center) + Math.abs(best.v - 0.45) ? p : best));
    } else {
      const pool = SPOTS.filter(([u]) => Math.abs(u - center) < half * 0.5);
      const [u, v] = pool.length ? pool[Math.floor(Math.random() * pool.length)] : [center, 0.4];
      spot = { u, v };
    }
    setChosen({ u: spot.u, v: spot.v });
    setPins([]);
    const ease = { duration: MATCH_FOUND_MS - 100, easing: Easing.inOut(Easing.cubic) };
    camU.set(withTiming(spot.u, ease));
    camV.set(withTiming(spot.v, ease));
    zoom.set(withTiming(ZOOM_FOUND, ease));
  }, [found, size.h, half, camU, camV, zoom]);

  const camera = useAnimatedStyle(() => {
    const z = zoom.get();
    return {
      transform: [
        { translateX: size.w / 2 - camU.get() * mapW * z },
        { translateY: size.h / 2 - camV.get() * mapH * z },
        { scale: z },
      ],
    };
  });

  return (
    <View style={StyleSheet.absoluteFill} onLayout={(e: LayoutChangeEvent) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {size.h > 0 && (
        <Animated.View style={[{ width: mapW, height: mapH, transformOrigin: 'left top' }, camera]}>
          <Dots width={mapW} height={mapH} />
          {pins.map((p) => (
            <Marker key={p.key} u={p.u} v={p.v} mapW={mapW} mapH={mapH} zoom={zoom}>
              <AmbientPin color={p.color} pulse={p.pulse} />
            </Marker>
          ))}
          {opponent && chosen && (
            <Marker u={chosen.u} v={chosen.v} mapW={mapW} mapH={mapH} zoom={zoom}>
              <ChosenPin opponent={opponent} />
            </Marker>
          )}
        </Animated.View>
      )}
    </View>
  );
}

/** Place un marqueur : sa pointe touche le point (u, v) et il garde sa taille à l'écran quel que soit le zoom. */
function Marker({
  u,
  v,
  mapW,
  mapH,
  zoom,
  children,
}: {
  u: number;
  v: number;
  mapW: number;
  mapH: number;
  zoom: SharedValue<number>;
  children: React.ReactNode;
}) {
  const counter = useAnimatedStyle(() => ({ transform: [{ scale: 1 / zoom.get() }] }));
  return <Animated.View style={[styles.anchor, { left: u * mapW, top: v * mapH }, counter]}>{children}</Animated.View>;
}

/** Joueur anonyme : épingle colorée avec une silhouette d'avatar, qui pulse parfois doucement. */
function AmbientPin({ color, pulse }: { color: string; pulse: boolean }) {
  const ring = useSharedValue(0);
  useEffect(() => {
    if (!pulse) return;
    ring.set(withDelay(Math.random() * 600, withRepeat(withTiming(1, { duration: 1400, easing: Easing.out(Easing.quad) }), -1)));
  }, [pulse, ring]);
  const ringStyle = useAnimatedStyle(() => ({
    opacity: pulse ? 0.55 * (1 - ring.get()) : 0,
    transform: [{ scale: 1 + ring.get() * 0.9 }],
  }));

  return (
    <Animated.View
      entering={ZoomIn.springify().damping(9).stiffness(200)}
      exiting={FadeOut.duration(260)}
      style={[styles.pin, { width: PIN, height: PIN + 8, left: -PIN / 2, top: -PIN - 8 }]}>
      <Animated.View style={[styles.ring, { width: PIN, height: PIN, borderRadius: PIN / 2, borderColor: color }, ringStyle]} />
      <View style={[styles.head, { width: PIN, height: PIN, borderRadius: PIN / 2, backgroundColor: color }]}>
        <View style={[styles.face, { width: PIN - 6, height: PIN - 6, borderRadius: (PIN - 6) / 2 }]}>
          <Ionicons name="person" size={PIN * 0.5} color="#6E6E78" />
        </View>
      </View>
      <View style={[styles.tip, { borderTopColor: color }]} />
    </Animated.View>
  );
}

/** Adversaire trouvé : son vrai avatar, contour magenta qui pulse et ondulations discrètes. */
function ChosenPin({ opponent }: { opponent: ParticipantView }) {
  const beat = useSharedValue(1);
  const wave0 = useSharedValue(0);
  const wave1 = useSharedValue(0);
  useEffect(() => {
    beat.set(withRepeat(withSequence(withTiming(1.1, { duration: 280 }), withTiming(1, { duration: 280 })), -1));
    wave0.set(withRepeat(withTiming(1, { duration: 900, easing: Easing.out(Easing.quad) }), -1));
    wave1.set(withDelay(380, withRepeat(withTiming(1, { duration: 900, easing: Easing.out(Easing.quad) }), -1)));
  }, [beat, wave0, wave1]);
  const contour = useAnimatedStyle(() => ({ transform: [{ scale: beat.get() }] }));
  const ripple0 = useAnimatedStyle(() => ({ opacity: 0.6 * (1 - wave0.get()), transform: [{ scale: 1 + wave0.get() * 1.6 }] }));
  const ripple1 = useAnimatedStyle(() => ({ opacity: 0.6 * (1 - wave1.get()), transform: [{ scale: 1 + wave1.get() * 1.6 }] }));
  const ringBox = { width: CHOSEN, height: CHOSEN, borderRadius: CHOSEN / 2, borderColor: MAGENTA };

  return (
    <Animated.View
      entering={ZoomIn.springify().damping(8).stiffness(180)}
      style={[styles.pin, { width: CHOSEN, height: CHOSEN + 10, left: -CHOSEN / 2, top: -CHOSEN - 10 }]}>
      <Animated.View style={[styles.ring, ringBox, ripple0]} />
      <Animated.View style={[styles.ring, ringBox, ripple1]} />
      <Animated.View style={[styles.head, { width: CHOSEN, height: CHOSEN, borderRadius: CHOSEN / 2, backgroundColor: MAGENTA }, contour]}>
        <Avatar name={opponent.name} color={opponent.color ?? MAGENTA} uri={opponent.avatar} size={CHOSEN - 8} borderColor={MAGENTA} />
      </Animated.View>
      <View style={[styles.tip, styles.tipChosen]} />
    </Animated.View>
  );
}

/** Nombre de bandes verticales : chaque bande reste assez petite pour être dessinée sans souci sur Android. */
const STRIPS = 14;
const TONES = ['#2A2A2F', '#323238', '#3A3A41'];

/**
 * Les continents : un nuage de points gris anthracite en trois nuances (léger effet de texture),
 * dessiné une seule fois en SVG, découpé en bandes verticales.
 */
const Dots = memo(function Dots({ width, height }: { width: number; height: number }) {
  const strips = useMemo(() => {
    const cw = width / COLS;
    const ch = height / ROWS;
    const r = Math.min(cw, ch) * 0.34;
    const per = Math.ceil(COLS / STRIPS);
    return Array.from({ length: STRIPS }, (_, s) => {
      const left = s * per * cw;
      const tones = ['', '', ''];
      WORLD_DOTS.forEach((line, row) => {
        for (let col = s * per; col < Math.min(COLS, (s + 1) * per); col++) {
          if (line[col] !== '#') continue;
          const x = (col + 0.5) * cw - left;
          const y = (row + 0.5) * ch;
          // Nuance pseudo-aléatoire mais stable d'un rendu à l'autre.
          const tone = (col * 7 + row * 13 + ((col * row) % 5)) % 3;
          tones[tone] += `M${(x - r).toFixed(1)} ${y.toFixed(1)}a${r.toFixed(1)} ${r.toFixed(1)} 0 1 0 ${(2 * r).toFixed(1)} 0a${r.toFixed(1)} ${r.toFixed(1)} 0 1 0 ${(-2 * r).toFixed(1)} 0`;
        }
      });
      return { left, width: per * cw, tones };
    });
  }, [width, height]);
  return (
    <>
      {strips.map((s, i) => (
        <Svg key={i} width={s.width} height={height} style={{ position: 'absolute', left: s.left, top: 0 }}>
          {s.tones.map((d, t) => (d ? <Path key={t} d={d} fill={TONES[t]} /> : null))}
        </Svg>
      ))}
    </>
  );
});

const styles = StyleSheet.create({
  anchor: { position: 'absolute', width: 0, height: 0 },
  pin: { position: 'absolute', alignItems: 'center' },
  ring: { position: 'absolute', top: 0, borderWidth: 2 },
  head: { alignItems: 'center', justifyContent: 'center' },
  face: { backgroundColor: '#1C1C21', alignItems: 'center', justifyContent: 'flex-end', overflow: 'hidden' },
  // Pointe de l'épingle (triangle) : la base touche le rond, la pointe touche le point de la carte.
  tip: {
    width: 0,
    height: 0,
    marginTop: -1,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 9,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  tipChosen: { borderLeftWidth: 8, borderRightWidth: 8, borderTopWidth: 11, borderTopColor: MAGENTA },
});
