import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { Animated as RNAnimated, ScrollView, StyleSheet, type ScrollViewInstance, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedProps, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, G, Line, LinearGradient, Polyline, Stop, Text as SvgText } from 'react-native-svg';

import { RULES, levelFromXp, xpForLevel, type DuelOutcome, type DuelRecord } from '@qu1z/shared';

import { Tap } from '@/components/tap';
import { AppText, Avatar } from '@/components/ui';
import { Fonts } from '@/constants/theme';
import { playSound } from '@/audio/sounds';
import { haptic } from '@/utils/haptics';
import { questionImageSource } from '@/game/question-images';

/** Couleurs de la page de résultats (fond noir, actions rose et violet, bandeau bleu). */
export const RC = {
  bg: '#000000',
  text: '#FFFFFF',
  muted: '#A1A1AA',
  faint: '#3A3A40',
  win: '#2BE02B',
  lose: '#E0101E',
  draw: '#F5B700',
  pink: '#FC0266',
  purple: '#3B1278',
  purpleIcon: '#4A1D8F',
  xpPale: '#F8DCEB',
  xpTrack: '#2A2A33',
  xpFill: '#FF007A',
  xpNext: '#00E5AB',
  chevron: '#9A9AA0',
  correct: '#1FA65A',
  wrong: '#E5245E',
};

// Couleurs du dégradé qui défile dans le titre (une période, répétée deux fois pour boucler sans saut).
const BANNER: Record<DuelOutcome, { text: string; colors: string[] }> = {
  win: { text: 'VICTOIRE !', colors: ['#2EE62E', '#00E5AB', '#FFD700', '#FF007A', '#7B2FFF'] },
  loss: { text: 'DÉFAITE !', colors: ['#E0101E', '#FF007A', '#FF4F8A', '#B0003A'] },
  draw: { text: 'ÉGALITÉ !', colors: ['#FFD700', '#FF9F1C', '#FFE27A', '#C27C00'] },
};

const AnimatedGradient = Animated.createAnimatedComponent(LinearGradient);
const BANNER_LOOP_MS = 4000;

/** Titre de fin (VICTOIRE ! / DÉFAITE ! / ÉGALITÉ !) rempli d'un dégradé de couleurs qui défile. */
export function OutcomeBanner({ outcome, width }: { outcome: DuelOutcome; width: number }) {
  const b = BANNER[outcome];
  const W = Math.min(width, 380);
  const H = Math.round(W * 0.2);
  const reduced = useReducedMotion();
  const shift = useSharedValue(0);
  useEffect(() => {
    if (!reduced) shift.value = withRepeat(withTiming(1, { duration: BANNER_LOOP_MS, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(shift);
  }, [reduced, shift]);
  const gradientProps = useAnimatedProps(() => ({ x1: -shift.value * W, x2: (2 - shift.value) * W }));
  const stops = [...b.colors, ...b.colors, b.colors[0]];
  return (
    <View style={{ width: W, height: H, alignSelf: 'center' }} accessibilityRole="header" accessibilityLabel={b.text}>
      <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <Defs>
          <AnimatedGradient id="outcome" gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={2 * W} y2={0} animatedProps={gradientProps}>
            {stops.map((c, i) => (
              <Stop key={i} offset={i / (stops.length - 1)} stopColor={c} />
            ))}
          </AnimatedGradient>
        </Defs>
        <SvgText
          x={W / 2}
          y={H * 0.78}
          textAnchor="middle"
          fontFamily={Fonts.extraBold}
          fontSize={Math.round(H * 0.72)}
          fill="url(#outcome)"
          transform={`skewX(-12) translate(${H * 0.14} 0)`}>
          {b.text}
        </SvgText>
      </Svg>
    </View>
  );
}

/** Anneau d'XP : niveau au centre, XP restants à gauche, XP gagnés à droite, reliés à l'anneau. */
/** XP total au moment où le niveau `level + 1` est atteint. */
const xpFromLevelStart = (level: number) => xpForLevel(level + 1);

const XP_START_MS = 1500;
const XP_STEP_MS = 110;
const XP_LEVEL_PAUSE_MS = 650;
const XP_STEPS = 24;

/**
 * Anneau d'XP de fin de partie : il se remplit par crans (un « clac » chacun, son modifiable dans
 * l'administration), flashe et passe au niveau suivant quand il est plein, puis continue.
 */
export function XpRing({ xpBefore, gained, animate = true }: { xpBefore: number; gained: number; animate?: boolean }) {
  const xpAfter = xpBefore + gained;
  const [shown, setShown] = useState(animate ? xpBefore : xpAfter);
  const [levelledUp, setLevelledUp] = useState(!animate && levelFromXp(xpAfter).level > levelFromXp(xpBefore).level);
  const flash = useRef(new RNAnimated.Value(0)).current;

  useEffect(() => {
    if (!animate || gained <= 0) {
      setShown(xpAfter);
      return;
    }
    setShown(xpBefore);
    setLevelledUp(false);
    const timers: ReturnType<typeof setTimeout>[] = [];
    const step = Math.max(1, Math.ceil(gained / XP_STEPS));
    let t = XP_START_MS;
    let xp = xpBefore;
    let level = levelFromXp(xpBefore).level;
    while (xp < xpAfter) {
      const next = Math.min(xpAfter, xp + step);
      const nextLevel = levelFromXp(next).level;
      if (nextLevel > level) {
        // L'anneau se remplit jusqu'au bout, flashe, puis repart au niveau suivant.
        const full = levelFromXp(xp).level;
        timers.push(
          setTimeout(() => {
            setShown(-full);
            playSound('xpTick');
            playSound('levelUp');
            haptic('success');
            flash.setValue(1);
            RNAnimated.timing(flash, { toValue: 0, duration: 450, useNativeDriver: true }).start();
          }, t),
        );
        t += XP_LEVEL_PAUSE_MS;
        timers.push(setTimeout(() => setLevelledUp(true), t));
        level = nextLevel;
      }
      const value = next;
      timers.push(
        setTimeout(() => {
          setShown(value);
          playSound('xpTick');
        }, t),
      );
      t += XP_STEP_MS;
      xp = next;
    }
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [xpBefore, gained, animate]);

  // Valeur négative : anneau plein du niveau |shown| (instant du passage de niveau).
  const full = shown < 0;
  const lvl = full ? { level: -shown, current: 1, needed: 1, progress: 1 } : levelFromXp(shown);
  const done = levelFromXp(xpAfter);
  const remaining = full ? 0 : lvl.needed ? lvl.needed - lvl.current : 0;
  const gainedNow = full ? null : Math.max(0, shown - xpBefore);
  const size = 124;
  const stroke = 22;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const progress = lvl.needed ? lvl.progress : 1;
  const fmt = (n: number) => n.toLocaleString('fr-FR').replace(/ | /g, ' ');
  return (
    <View
      style={styles.xpRow}
      accessible
      accessibilityLabel={`Niveau ${done.level}. ${fmt(gained)} XP gagnés. ${done.needed ? fmt(done.needed - done.current) + ' XP restants avant le niveau suivant' : 'Niveau maximal'}.`}>
      <View style={[styles.xpSide, { justifyContent: 'flex-end', paddingBottom: size * 0.55 }]}>
        <View style={styles.xpLabelBox}>
          <AppText style={styles.xpCaption}>XP RESTANTS</AppText>
          <AppText style={styles.xpValue}>{lvl.needed ? fmt(remaining) : '—'}</AppText>
        </View>
        <View style={styles.connector}>
          <View style={styles.dot} />
          <View style={styles.line} />
        </View>
      </View>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={levelledUp ? '#FFFFFF' : RC.xpTrack} strokeWidth={stroke} fill="none" />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={levelledUp ? RC.xpNext : RC.xpFill}
            strokeWidth={stroke}
            fill="none"
            strokeDasharray={`${c * progress} ${c}`}
          />
        </Svg>
        <RNAnimated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: flash }]}>
          <Svg width={size} height={size}>
            <Circle cx={size / 2} cy={size / 2} r={r} stroke="#FFFFFF" strokeWidth={stroke} fill="none" />
          </Svg>
        </RNAnimated.View>
        <View style={styles.ringCenter}>
          <AppText style={styles.ringCaption}>NIVEAU</AppText>
          <AppText style={styles.ringLevel}>{lvl.level}</AppText>
        </View>
      </View>
      <View style={[styles.xpSide, { justifyContent: 'flex-start', paddingTop: size * 0.5 }]}>
        <View style={[styles.connector, { flexDirection: 'row-reverse' }]}>
          <View style={styles.dot} />
          <View style={styles.line} />
        </View>
        <View style={styles.xpLabelBox}>
          <AppText style={styles.xpCaption}>XP GAGNÉS</AppText>
          <AppText style={styles.xpValue}>{fmt(gainedNow ?? Math.max(0, xpFromLevelStart(-shown) - xpBefore))}</AppText>
        </View>
      </View>
    </View>
  );
}

/** Courbe du score cumulé question après question, pour les deux joueurs. */
export function ScoreChart({ record, myName }: { record: DuelRecord; myName: string }) {
  const [w, setW] = useState(0);
  const H = 190;
  const pad = { l: 30, r: 34, t: 14, b: 26 };
  const cum = (list: { points: number }[]) => list.reduce<number[]>((acc, a) => [...acc, (acc[acc.length - 1] ?? 0) + a.points], [0]);
  const mine = cum(record.player);
  const theirs = cum(record.opponent);
  const n = mine.length - 1;
  const max = Math.max(20, ...mine, ...theirs);
  const step = max > 120 ? 40 : 20;
  const top = Math.ceil(max / step) * step;
  const x = (i: number) => pad.l + (n ? (i / n) * (w - pad.l - pad.r) : 0);
  const y = (v: number) => pad.t + (1 - v / top) * (H - pad.t - pad.b);
  const pts = (arr: number[]) => arr.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const grid = Array.from({ length: top / step + 1 }, (_, i) => i * step);
  return (
    <View
      onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}
      style={{ height: H }}
      accessible
      accessibilityLabel={`Score final : ${myName} ${mine[n]}, ${record.opponentName} ${theirs[n]}.`}>
      {w > 0 && (
        <Svg width={w} height={H}>
          {grid.map((g) => (
            <G key={g}>
              <Line x1={pad.l} x2={w - pad.r} y1={y(g)} y2={y(g)} stroke={RC.faint} strokeWidth={1} />
              <SvgText x={pad.l - 6} y={y(g) + 4} fill={RC.muted} fontSize={10} textAnchor="end">
                {g}
              </SvgText>
            </G>
          ))}
          {record.questions.map((_, i) => (
            <SvgText key={i} x={x(i + 1)} y={H - 6} fill={RC.muted} fontSize={11} textAnchor="middle">
              {i + 1}
            </SvgText>
          ))}
          <Polyline points={pts(theirs)} fill="none" stroke={RC.lose} strokeWidth={2.5} />
          <Polyline points={pts(mine)} fill="none" stroke={RC.win} strokeWidth={2.5} />
          {mine.slice(1).map((v, i) => (
            <SvgText key={'m' + i} x={x(i + 1)} y={y(v) - 7} fill={RC.win} fontSize={10} fontWeight="bold" textAnchor="middle">
              {record.player[i].points}
            </SvgText>
          ))}
          {theirs.slice(1).map((v, i) => (
            <SvgText key={'t' + i} x={x(i + 1)} y={y(v) + 15} fill={RC.lose} fontSize={10} fontWeight="bold" textAnchor="middle">
              {record.opponent[i].points}
            </SvgText>
          ))}
          <Circle cx={x(n)} cy={y(mine[n])} r={4} fill={RC.win} />
          <Circle cx={x(n)} cy={y(theirs[n])} r={4} fill={RC.lose} />
          <SvgText x={x(n) + 7} y={y(mine[n]) + 4} fill={RC.win} fontSize={14} fontWeight="bold">
            {mine[n]}
          </SvgText>
          <SvgText x={x(n) + 7} y={y(theirs[n]) + 4} fill={RC.lose} fontSize={14} fontWeight="bold">
            {theirs[n]}
          </SvgText>
        </Svg>
      )}
    </View>
  );
}

interface Person {
  name: string;
  color: string;
  avatar: string | null;
}

/** Cartes des questions du duel, à faire défiler de gauche à droite : réponses, choix des deux joueurs, bonne réponse. */
export function QuestionReview({
  record,
  me,
  opponent,
  width,
  onReport,
  onShare,
}: {
  record: DuelRecord;
  me: Person;
  opponent: Person;
  width: number;
  onReport: (index: number) => void;
  onShare: () => void;
}) {
  const [page, setPage] = useState(0);
  const pager = useRef<ScrollViewInstance>(null);
  const total = record.questions.length;
  const go = (i: number) => {
    const next = Math.max(0, Math.min(total - 1, i));
    pager.current?.scrollTo({ x: next * width, animated: true });
    setPage(next);
  };
  const onEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => setPage(Math.round(e.nativeEvent.contentOffset.x / width));
  let myRun = 0;
  let theirRun = 0;
  const totals = record.questions.map((_, i) => {
    myRun += record.player[i].points;
    theirRun += record.opponent[i].points;
    return [myRun, theirRun] as const;
  });

  return (
    <View style={{ gap: 12 }}>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${((page + 1) / total) * 100}%` }]} />
      </View>
      <ScrollView
        ref={pager}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onEnd}
        onScrollEndDrag={onEnd}
        style={{ width, alignSelf: 'center' }}>
        {record.questions.map((q, i) => {
          const mine = record.player[i];
          const theirs = record.opponent[i];
          const img = questionImageSource(q.image);
          const timeLeft = Math.max(0, Math.ceil((RULES.answerTimeMs - mine.responseMs) / 1000));
          return (
            <View key={q.id} style={{ width, paddingHorizontal: 2 }}>
              <View style={styles.qCard}>
                <View style={[styles.sideBar, { left: 0, backgroundColor: mine.correct ? RC.correct : RC.wrong }]} />
                <View style={[styles.sideBar, { right: 0, backgroundColor: theirs.correct ? RC.correct : RC.wrong }]} />
                <View style={styles.qHead}>
                  <View style={styles.qPlayer}>
                    <Avatar name={me.name} color={me.color} uri={me.avatar} size={34} ring={false} />
                    <View style={styles.qWho}>
                      <AppText style={styles.qName} numberOfLines={1}>{me.name}</AppText>
                      <AppText style={[styles.qScore, { color: RC.win }]}>{totals[i][0]}</AppText>
                    </View>
                  </View>
                  <View style={styles.qTimeBox}>
                    <AppText style={styles.qTimeCaption}>TEMPS RESTANT</AppText>
                    <AppText style={styles.qTime}>{mine.choice === null ? '—' : timeLeft}</AppText>
                  </View>
                  <View style={[styles.qPlayer, { flexDirection: 'row-reverse' }]}>
                    <Avatar name={opponent.name} color={opponent.color} uri={opponent.avatar} size={34} ring={false} />
                    <View style={[styles.qWho, { alignItems: 'flex-end' }]}>
                      <AppText style={styles.qName} numberOfLines={1}>{opponent.name}</AppText>
                      <AppText style={[styles.qScore, { color: RC.lose }]}>{totals[i][1]}</AppText>
                    </View>
                  </View>
                </View>
                <AppText style={styles.qText}>{q.text}</AppText>
                {img !== null && <Image source={img} contentFit="contain" style={styles.qImage} accessibilityLabel="Illustration de la question" />}
                <View style={styles.answers}>
                  {q.choices.map((choice, c) => {
                    const isCorrect = c === q.correctIndex;
                    const pickedByMe = mine.choice === c;
                    const pickedByThem = theirs.choice === c;
                    const bg = isCorrect ? RC.correct : pickedByMe || pickedByThem ? RC.wrong : '#FFFFFF';
                    const fg = bg === '#FFFFFF' ? '#111116' : '#FFFFFF';
                    const label = [choice, isCorrect ? 'bonne réponse' : null, pickedByMe ? 'ta réponse' : null, pickedByThem ? `réponse de ${opponent.name}` : null]
                      .filter(Boolean)
                      .join(', ');
                    return (
                      <View key={c} style={[styles.answer, { backgroundColor: bg }]} accessible accessibilityLabel={label}>
                        {pickedByMe && <View style={[styles.pick, { left: 0, borderLeftWidth: 5 }]} />}
                        {pickedByThem && <View style={[styles.pick, { right: 0, borderRightWidth: 5 }]} />}
                        <AppText style={[styles.answerText, { color: fg }]} numberOfLines={2} adjustsFontSizeToFit>
                          {choice}
                        </AppText>
                        {isCorrect && <Ionicons name="checkmark-circle" size={16} color="#FFFFFF" style={styles.answerIcon} />}
                      </View>
                    );
                  })}
                </View>
                <View style={styles.legend}>
                  <AppText style={styles.legendText}>
                    {mine.choice === null ? 'Tu n’as pas répondu' : mine.correct ? `Bonne réponse · +${mine.points} pts` : 'Mauvaise réponse'}
                  </AppText>
                  <AppText style={styles.legendText}>
                    {theirs.choice === null ? 'Pas de réponse' : theirs.correct ? `+${theirs.points} pts` : 'Raté'}
                  </AppText>
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.pagerRow}>
        <Tap accessibilityRole="button" accessibilityLabel="Question précédente" disabled={page === 0} onPress={() => go(page - 1)} hitSlop={10}>
          <Ionicons name="chevron-back" size={22} color={page === 0 ? RC.faint : RC.text} />
        </Tap>
        <AppText style={styles.pagerText}>
          QUESTION <AppText style={styles.pagerNum}>{page + 1}</AppText> / {total}
        </AppText>
        <Tap accessibilityRole="button" accessibilityLabel="Question suivante" disabled={page === total - 1} onPress={() => go(page + 1)} hitSlop={10}>
          <Ionicons name="chevron-forward" size={22} color={page === total - 1 ? RC.faint : RC.text} />
        </Tap>
      </View>
      <View style={styles.qActions}>
        <Tap accessibilityRole="button" accessibilityLabel={`Signaler la question ${page + 1}`} onPress={() => onReport(page)} style={styles.qAction}>
          <Ionicons name="flag" size={14} color="#111116" />
          <AppText style={styles.qActionText}>SIGNALER</AppText>
        </Tap>
        <Tap accessibilityRole="button" accessibilityLabel="Partager le résultat" onPress={onShare} style={styles.qAction}>
          <Ionicons name="share-social" size={14} color="#111116" />
          <AppText style={styles.qActionText}>PARTAGER</AppText>
        </Tap>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  xpRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' },
  xpSide: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center' },
  xpLabelBox: { alignItems: 'center' },
  xpCaption: { color: RC.text, fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
  xpValue: { color: RC.text, fontSize: 24, fontWeight: '800', lineHeight: 30 },
  connector: { flexDirection: 'row', alignItems: 'center', width: 34, marginHorizontal: 2 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFFFFF' },
  line: { flex: 1, height: 1.5, backgroundColor: '#FFFFFF' },
  ringCenter: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  ringCaption: { color: RC.text, fontSize: 11, lineHeight: 14, fontWeight: '600' },
  ringLevel: { color: RC.text, fontSize: 36, lineHeight: 42, fontWeight: '800' },
  progressTrack: { height: 3, backgroundColor: RC.faint, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: RC.pink },
  qCard: { backgroundColor: '#111114', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, gap: 12, overflow: 'hidden' },
  sideBar: { position: 'absolute', top: '45%', bottom: 0, width: 4 },
  qHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  qPlayer: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 },
  qWho: { flexShrink: 1, minWidth: 0 },
  qName: { color: RC.muted, fontSize: 11 },
  qTimeBox: { width: 78, alignItems: 'center' },
  qScore: { fontSize: 18, fontWeight: '900', lineHeight: 22 },
  qTimeCaption: { color: RC.muted, fontSize: 8, fontWeight: '700', letterSpacing: 0.5 },
  qTime: { color: '#5AA9FF', fontSize: 18, fontWeight: '800', lineHeight: 22 },
  qText: { color: RC.text, fontSize: 20, fontWeight: '700', textAlign: 'center', lineHeight: 26 },
  qImage: { width: '100%', height: 150, borderRadius: 10, backgroundColor: '#FFFFFF' },
  answers: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  answer: { width: '48.5%', minHeight: 50, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, overflow: 'hidden' },
  answerText: { fontSize: 15, fontWeight: '700', textAlign: 'center' },
  answerIcon: { position: 'absolute', top: 4, right: 4 },
  pick: { position: 'absolute', top: 0, bottom: 0, borderColor: 'rgba(255,255,255,0.95)' },
  legend: { flexDirection: 'row', justifyContent: 'space-between' },
  legendText: { color: RC.muted, fontSize: 12 },
  pagerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18 },
  pagerText: { color: '#B79BFF', fontSize: 14, fontWeight: '800', letterSpacing: 0.5 },
  pagerNum: { color: RC.text, fontSize: 14, fontWeight: '800' },
  qActions: { flexDirection: 'row', justifyContent: 'center', gap: 10 },
  qAction: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#D4D4D8', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  qActionText: { color: '#111116', fontSize: 12, fontWeight: '800' },
});
