import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Share, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  FadeInDown,
  ZoomIn,
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  formatSeconds,
  getTheme,
  levelFromXp,
  shareResultText,
  speedSummary,
  type DuelOutcome,
  type ParticipantView,
  type SpeedSummary,
} from '@qu1z/shared';

import { XP_SOUND_MS, playMusic, playSound } from '@/audio/sounds';
import { Celebration, Crown, GOLD, ReplayButton, ResultBanner } from '@/components/results-art';
import { ThemeCover } from '@/components/theme-cover';
import { AppText, Avatar } from '@/components/ui';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { questionImageSource } from '@/game/question-images';
import { api, errorMessage } from '@/net/api';
import { useGameServer } from '@/state/game-server';
import { Tap } from '@/components/tap';
import { XpProgress } from '@/components/xp-progress';
import { haptic } from '@/utils/haptics';
import { DuelChat } from '@/components/duel-chat';

const R = {
  bg: '#000000',
  text: '#FFFFFF',
  muted: '#A1A1AA',
  win: '#22C55E',
  winDark: '#15803D',
  winBg: '#04140A',
  loss: '#EF4444',
  lossDark: '#B91C1C',
  lossBg: '#160505',
  draw: '#F59E0B',
  line: '#2E2E33',
};

/** Accent rose de l'identité Qu1z (plus d'orange). */
const PINK = Colors.accent;

const BANNER: Record<DuelOutcome, { text: string; color: string; dark: string }> = {
  win: { text: 'VICTOIRE !', color: R.win, dark: R.winDark },
  loss: { text: 'DÉFAITE !', color: R.loss, dark: R.lossDark },
  draw: { text: 'ÉGALITÉ !', color: R.draw, dark: '#B45309' },
};

export default function ResultsScreen() {
  const game = useGameServer();
  const duel = game.duel;
  const [details, setDetails] = useState(false);
  const [rematch, setRematch] = useState<string | null>(null);
  const [rematchBusy, setRematchBusy] = useState(false);

  useEffect(() => {
    if (duel?.phase === 'finished' && duel.result) game.ackResult(duel.duelId);
    // Accusé de réception une seule fois par duel affiché.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duel?.duelId, duel?.result]);

  // Sons de fin, une fois par duel : coup de résultat, musique de résultat (une seule), montée d'XP,
  // puis passage de niveau seulement si le niveau augmente vraiment.
  useEffect(() => {
    const r = duel?.phase === 'finished' ? duel.result : null;
    if (!r) return;
    const music = r.outcome === 'win' ? 'win' : r.outcome === 'loss' ? 'loss' : 'draw';
    playSound(r.outcome === 'win' ? 'endWin' : r.outcome === 'loss' ? 'endLoss' : 'endDraw');
    if (r.outcome !== 'draw') haptic(r.outcome === 'win' ? 'success' : 'error');
    let stop: (() => void) | undefined;
    const timers = [setTimeout(() => (stop = playMusic(music)), 900)];
    if (r.accountXpAfter > r.accountXpBefore) {
      const xpAt = 1500;
      timers.push(setTimeout(() => playSound('xp'), xpAt));
      timers.push(setTimeout(() => playSound('xpEnd'), xpAt + XP_SOUND_MS));
      if (levelFromXp(r.record.xpBefore + r.record.xpGained).level > levelFromXp(r.record.xpBefore).level) {
        timers.push(
          setTimeout(() => {
            playSound('levelUp');
            haptic('success');
          }, xpAt + XP_SOUND_MS + 150),
        );
      }
    }
    return () => {
      timers.forEach(clearTimeout);
      stop?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duel?.duelId, duel?.result]);

  // Retour là où l'on était avant de lancer le défi (l'écran de duel a été remplacé par celui-ci).
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  // Glisser vers le bas (depuis le haut de la page) pour quitter : la page suit le doigt,
  // puis part vers le bas si le geste est assez long ou rapide, sinon elle revient en place.
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const scrollY = useSharedValue(0);
  const drag = useSharedValue(0);
  const base = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.set(e.contentOffset.y);
  });
  const scrollGesture = Gesture.Native();
  const pullDown = Gesture.Pan()
    .activeOffsetY(12)
    .failOffsetY(-12)
    .failOffsetX([-24, 24])
    .simultaneousWithExternalGesture(scrollGesture)
    .onStart(() => {
      base.set(0);
    })
    .onUpdate((e) => {
      // Tant que la page n'est pas remontée tout en haut, le geste fait défiler : on ne compte
      // la descente qu'à partir du moment où le haut est atteint (pas de saut).
      if (scrollY.get() > 0 && drag.get() === 0) base.set(e.translationY);
      else drag.set(Math.max(0, e.translationY - base.get()));
    })
    .onEnd((e) => {
      const d = drag.get();
      if (d > 140 || (d > 40 && e.velocityY > 900)) {
        drag.set(withTiming(height, { duration: 220 }, (done) => done && runOnJS(close)()));
      } else {
        drag.set(withSpring(0, { damping: 22, stiffness: 240 }));
      }
    });
  const dragStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: drag.get() }],
    opacity: 1 - Math.min(0.4, drag.get() / (height * 1.5)),
  }));

  if (!duel || duel.phase !== 'finished' || !duel.result) return <Redirect href="/" />;
  const result = duel.result;
  const theme = getTheme(duel.themeId);
  const banner = BANNER[result.outcome];
  const record = result.record;

  const replay = async () => {
    if (!duel.challenge || rematchBusy) return;
    setRematchBusy(true);
    setRematch(null);
    try {
      const response = await api<{ playDuelId: string | null }>('POST', '/api/challenges', {
        userId: duel.opponent.id,
        themeId: duel.themeId,
        rematchOf: duel.duelId,
      });
      setRematch(response.playDuelId ? 'La revanche démarre…' : `Une revanche est déjà proposée à ${duel.opponent.name}.`);
    } catch (e) {
      setRematch(errorMessage(e));
    } finally {
      setRematchBusy(false);
    }
  };
  const share = () =>
    Share.share({
      message: shareResultText({
        outcome: result.outcome,
        themeName: theme?.name ?? '',
        myPoints: duel.me.points,
        opponentPoints: duel.opponent.points,
        opponentName: duel.opponent.name,
        answers: record.player,
      }),
    }).catch(() => {});
  const mySpeed = speedSummary(record.player);
  const theirSpeed = speedSummary(record.opponent);

  return (
    <GestureHandlerRootView style={styles.backdrop}>
    <GestureDetector gesture={pullDown}>
    <Animated.View style={[styles.screen, dragStyle]}>
      <GestureDetector gesture={scrollGesture}>
      <Animated.ScrollView onScroll={onScroll} scrollEventThrottle={16} bounces={false} contentContainerStyle={{ paddingBottom: Spacing.xl }} showsVerticalScrollIndicator={false}>
        <ThemeCover themeId={duel.themeId} height={300} fadeTo={R.bg}>
          <View style={[styles.coverContent, { paddingTop: insets.top }]}>
            <Tap accessibilityRole="button" accessibilityLabel="Fermer" onPress={close} style={[styles.close, { top: insets.top + 12 }]}>
              <Ionicons name="close" size={26} color={R.text} />
            </Tap>
            <View style={styles.titles}>
              <AppText style={styles.title}>RÉSULTATS</AppText>
              <AppText style={styles.subtitle}>{theme?.name}</AppText>
            </View>
          </View>
        </ThemeCover>

        <View style={styles.body}>
          <Animated.View entering={ZoomIn.springify()} style={{ gap: Spacing.sm, marginTop: -Spacing.lg }}>
            <Celebration color={result.outcome === 'loss' ? '#71717A' : GOLD} />
            <ResultBanner {...banner} />
          </Animated.View>

          {/* Le joueur connecté est TOUJOURS à gauche : le serveur l'envoie comme « me ». */}
          <Animated.View entering={FadeInDown.delay(120).springify()} style={styles.players}>
            <PlayerCard player={duel.me} outcome={result.outcome} self />
            <View style={styles.vs}>
              <AppText style={styles.vsText}>VS</AppText>
            </View>
            <PlayerCard player={duel.opponent} outcome={result.outcome === 'win' ? 'loss' : result.outcome === 'loss' ? 'win' : 'draw'} />
          </Animated.View>

          {!result.finished && !result.forfeited && (
            <AppText variant="caption" color={R.muted} style={{ textAlign: 'center' }}>
              Tu n’étais plus connecté à la fin du duel : pas de bonus de fin.
            </AppText>
          )}
          {result.forfeited && (
            <AppText variant="caption" color={R.muted} style={{ textAlign: 'center' }}>
              Duel abandonné : aucun XP.
            </AppText>
          )}

          <Animated.View entering={FadeInDown.delay(220).springify()} style={styles.table}>
            <BonusRow icon="ribbon" label="Score" value={result.rewards.scorePoints ?? 0} />
            <BonusRow icon="trophy" label="Bonus fin" value={result.rewards.finishBonus} />
            <BonusRow icon="star" label="Bonus victoire" value={result.rewards.victoryBonus} />
            <BonusRow icon="flash" label="Bonus boost" value={result.rewards.boostBonus} />
            <View style={[styles.row, styles.totalRow]}>
              <Ionicons name="layers" size={24} color={GOLD} style={styles.rowIcon} />
              <AppText style={[styles.rowLabel, { color: GOLD, fontWeight: '800' }]}>XP total</AppText>
              <AppText style={[styles.rowValue, { color: GOLD, fontSize: 26 }]}>{result.rewards.total}</AppText>
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(300).springify()} style={styles.speed}>
            <AppText style={styles.speedTitle}>Rapidité</AppText>
            <View style={styles.speedHead}>
              <AppText style={[styles.speedName, { textAlign: 'left' }]} numberOfLines={1}>
                Toi
              </AppText>
              <View style={{ flex: 1.2 }} />
              <AppText style={[styles.speedName, { textAlign: 'right' }]} numberOfLines={1}>
                {record.opponentName}
              </AppText>
            </View>
            <SpeedRow label="Bonnes réponses" mine={mySpeed} theirs={theirSpeed} pick={(s) => s.correct} format={(s) => `${s.correct}/${s.total}`} higherIsBetter />
            <SpeedRow label="Temps moyen" mine={mySpeed} theirs={theirSpeed} pick={(s) => s.averageMs} format={(s) => (s.averageMs === null ? '—' : formatSeconds(s.averageMs))} />
            <SpeedRow label="Plus rapide" mine={mySpeed} theirs={theirSpeed} pick={(s) => s.fastestMs} format={(s) => (s.fastestMs === null ? '—' : formatSeconds(s.fastestMs))} />
            <AppText variant="caption" color={R.muted} style={{ textAlign: 'center' }}>
              Temps calculés sur les bonnes réponses.
            </AppText>
          </Animated.View>

          {/* XP du thème joué (le niveau est calculé par thème), remplie segment par segment. */}
          <XpProgress xpBefore={record.xpBefore} rewards={result.rewards} delayMs={1500} durationMs={XP_SOUND_MS} />

          {duel.challenge && (
            <>
              <ReplayButton onPress={replay} />
              {rematch && (
                <AppText variant="caption" color={R.muted} style={{ textAlign: 'center' }}>
                  {rematch}
                </AppText>
              )}
            </>
          )}

          {!duel.opponent.isBot && !duel.challenge && <DuelChat duelId={duel.duelId} opponentName={duel.opponent.name} />}

          <View style={styles.secondary}>
            <Tap
              accessibilityRole="button"
              accessibilityLabel="Discuter avec l’adversaire"
              disabled={duel.opponent.isBot}
              onPress={() => router.push({ pathname: '/messages/new', params: { userId: duel.opponent.id } })}
              style={styles.secondaryButton}>
              <Ionicons name="chatbubble-ellipses" size={28} color={duel.opponent.isBot ? '#52525B' : R.text} />
            </Tap>
            <Tap accessibilityRole="button" accessibilityLabel="Partager le résultat" onPress={share} style={styles.secondaryButton}>
              <Ionicons name="share-social" size={28} color={R.text} />
            </Tap>
          </View>

          <Tap accessibilityRole="button" onPress={() => setDetails((d) => !d)} style={styles.detailsToggle}>
            <AppText variant="label" color={R.muted}>
              {details ? 'Masquer le détail des questions' : 'Voir le détail des questions'}
            </AppText>
            <Ionicons name={details ? 'chevron-up' : 'chevron-down'} size={18} color={R.muted} />
          </Tap>
          {details &&
            record.questions.map((q, i) => {
              const mine = record.player[i];
              const theirs = record.opponent[i];
              return (
                <View key={q.id} style={styles.detail}>
                  <View style={{ flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' }}>
                    {questionImageSource(q.image) !== null && (
                      <Image source={questionImageSource(q.image)!} contentFit="cover" style={styles.thumb} accessibilityLabel="Illustration" />
                    )}
                    <AppText variant="caption" color={R.muted} style={{ flex: 1 }}>
                      {i + 1}. {q.text}
                    </AppText>
                  </View>
                  <AppText variant="label" color={R.win}>
                    {q.choices[q.correctIndex]}
                  </AppText>
                  <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                    <Pill label="Toi" correct={mine.correct} points={mine.points} ms={mine.responseMs} answered={mine.choice !== null} />
                    <Pill label={record.opponentName} correct={theirs.correct} points={theirs.points} ms={theirs.responseMs} answered={theirs.choice !== null} />
                  </View>
                </View>
              );
            })}
        </View>
      </Animated.ScrollView>
      </GestureDetector>
    </Animated.View>
    </GestureDetector>
    </GestureHandlerRootView>
  );
}

function PlayerCard({ player, outcome, self }: { player: ParticipantView; outcome: DuelOutcome; self?: boolean }) {
  const color = outcome === 'win' ? R.win : outcome === 'loss' ? R.loss : R.draw;
  const bg = outcome === 'win' ? R.winBg : outcome === 'loss' ? R.lossBg : '#141006';
  return (
    <View style={styles.cardSlot}>
      <View style={styles.crown}>{outcome === 'win' && <Crown />}</View>
      <View style={[styles.card, { borderColor: color, backgroundColor: bg }]}>
        <AppText style={styles.cardName} numberOfLines={1}>
          {player.name}
        </AppText>
        <View style={[styles.ring, { borderColor: color }]}>
          <Avatar name={player.name} color={self ? Colors.player : (player.color ?? Colors.opponent)} size={76} borderColor="#251F44" />
        </View>
        <AppText style={[styles.cardScore, { color }]}>{player.points}</AppText>
      </View>
    </View>
  );
}

/** Une ligne de comparaison ; la meilleure valeur des deux est mise en avant. */
function SpeedRow({
  label,
  mine,
  theirs,
  pick,
  format,
  higherIsBetter = false,
}: {
  label: string;
  mine: SpeedSummary;
  theirs: SpeedSummary;
  pick: (s: SpeedSummary) => number | null;
  format: (s: SpeedSummary) => string;
  higherIsBetter?: boolean;
}) {
  const a = pick(mine);
  const b = pick(theirs);
  const better = (x: number | null, y: number | null) => x !== null && (y === null || (higherIsBetter ? x > y : x < y));
  return (
    <View style={styles.speedRow}>
      <AppText style={[styles.speedValue, { textAlign: 'left' }, better(a, b) && styles.speedBest]}>{format(mine)}</AppText>
      <AppText style={styles.speedLabel}>{label}</AppText>
      <AppText style={[styles.speedValue, { textAlign: 'right' }, better(b, a) && styles.speedBest]}>{format(theirs)}</AppText>
    </View>
  );
}

function BonusRow({ icon, label, value }: { icon: 'ribbon' | 'trophy' | 'star' | 'flash'; label: string; value: number }) {
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={24} color={R.text} style={styles.rowIcon} />
      <AppText style={styles.rowLabel}>{label}</AppText>
      <AppText style={styles.rowValue}>+{value}</AppText>
    </View>
  );
}

function Pill({ label, correct, points, ms, answered }: { label: string; correct: boolean; points: number; ms: number; answered: boolean }) {
  return (
    <View style={[styles.pill, { borderColor: correct ? R.win : R.loss }]}>
      <AppText variant="caption" color={R.text} numberOfLines={1} style={{ flex: 1 }}>
        {label}
      </AppText>
      <AppText variant="caption" color={R.text}>
        {points} pts · {answered ? `${(ms / 1000).toFixed(1)} s` : '—'}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#000000' },
  screen: { flex: 1, backgroundColor: R.bg },
  coverContent: { flex: 1 },
  close: {
    position: 'absolute',
    right: 16,
    top: 12,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  titles: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 40, gap: 2 },
  title: { color: R.text, fontSize: 30, fontWeight: '900', letterSpacing: 1 },
  subtitle: { color: '#E4E4E7', fontSize: 18, fontWeight: '600' },
  body: { width: '100%', maxWidth: 480, alignSelf: 'center', paddingHorizontal: 20, gap: Spacing.lg },
  players: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  cardSlot: { flex: 1, alignItems: 'center' },
  crown: { height: 22, justifyContent: 'flex-end' },
  card: { alignSelf: 'stretch', borderWidth: 2, borderRadius: 6, paddingVertical: 12, paddingHorizontal: 8, alignItems: 'center', gap: 8 },
  cardName: { color: R.text, fontSize: 16, fontWeight: '700' },
  ring: { borderWidth: 4, borderRadius: 50, padding: 3 },
  cardScore: { fontSize: 36, fontFamily: Fonts.score, fontVariant: ['tabular-nums'] },
  vs: {
    position: 'absolute',
    left: '50%',
    top: '52%',
    transform: [{ translateX: -24 }, { translateY: -18 }],
    width: 48,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#000000',
    borderWidth: 2,
    borderColor: PINK,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  vsText: { color: '#FFFFFF', fontWeight: '900', fontStyle: 'italic', fontSize: 18 },
  table: { borderWidth: 1, borderColor: '#3F3F46', borderRadius: 4, overflow: 'hidden', backgroundColor: R.bg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 54,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: R.line,
  },
  totalRow: { backgroundColor: '#241C02', borderBottomWidth: 0 },
  rowIcon: { width: 40 },
  rowLabel: { flex: 1, color: R.text, fontSize: 17 },
  rowValue: { color: R.text, fontSize: 22, fontWeight: '800', fontVariant: ['tabular-nums'] },
  speed: { borderWidth: 1, borderColor: '#3F3F46', borderRadius: 4, padding: 14, gap: 10 },
  speedTitle: { color: R.text, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  speedHead: { flexDirection: 'row' },
  speedName: { flex: 1, color: R.muted, fontSize: 14, fontWeight: '700' },
  speedRow: { flexDirection: 'row', alignItems: 'center' },
  speedLabel: { flex: 1.2, color: R.muted, fontSize: 14, textAlign: 'center' },
  speedValue: { flex: 1, color: R.text, fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
  speedBest: { color: R.win },
  levelRow: { flexDirection: 'row', justifyContent: 'space-between' },
  levelText: { color: R.text, fontSize: 17, fontWeight: '800' },
  track: { height: 16, borderRadius: 999, backgroundColor: '#2A2A2E', overflow: 'hidden' },
  secondary: { flexDirection: 'row', gap: 12 },
  secondaryButton: { flex: 1, height: 54, borderRadius: 10, backgroundColor: '#111113', alignItems: 'center', justifyContent: 'center' },
  detailsToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: Spacing.sm },
  detail: { borderTopWidth: 1, borderTopColor: R.line, paddingTop: Spacing.sm, gap: 6 },
  thumb: { width: 54, height: 36, borderRadius: 6 },
  pill: { flex: 1, flexDirection: 'row', gap: 6, borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
});
