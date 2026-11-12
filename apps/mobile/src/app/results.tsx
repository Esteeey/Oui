import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Share, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  FadeInDown,
  ZoomIn,
  runOnJS,
  useReducedMotion,
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
  THEMES,
  shareResultText,
  speedSummary,
  type SpeedSummary,
} from '@qu1z/shared';

import { playMusic, playSound } from '@/audio/sounds';
import { GOLD } from '@/components/results-art';
import { OutcomeBanner, QuestionReview, RC, ScoreChart, XpRing } from '@/components/results-sections';
import { ThemeIcon } from '@/components/theme-icon';
import { ThemeCover } from '@/components/theme-cover';
import { AppText, Avatar } from '@/components/ui';
import { ClassicColors as Colors, Spacing } from '@/constants/theme';
import { api, errorMessage } from '@/net/api';
import { useGameServer } from '@/state/game-server';
import { Tap } from '@/components/tap';
import { haptic } from '@/utils/haptics';
import { DuelChat } from '@/components/duel-chat';
import { QuestionReportSheet, type ReportedQuestion } from '@/components/question-report-sheet';

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

export default function ResultsScreen() {
  const game = useGameServer();
  const duel = game.duel;
  const [reportedQuestion, setReportedQuestion] = useState<ReportedQuestion | null>(null);
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
    // La montée d'XP (crans, passage de niveau) est jouée par l'anneau lui-même, au rythme de son animation.
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
  const { height, width } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const scroller = useRef<Animated.ScrollView>(null);
  const statsY = useRef(0);
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

  const [pinned, setPinned] = useState(false);
  const [pinBusy, setPinBusy] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  if (!duel || duel.phase !== 'finished' || !duel.result) return <Redirect href="/" />;
  const result = duel.result;
  const theme = getTheme(duel.themeId);
  const record = result.record;

  const replayOther = () => {
    const others = THEMES.filter((t) => t.id !== duel.themeId);
    const next = others[Math.floor(Math.random() * others.length)] ?? theme;
    if (!next) return;
    router.replace({ pathname: '/duel/[themeId]', params: { themeId: next.id, mode: duel.opponent.isBot ? 'bot' : 'pvp' } });
  };
  const replay = async () => {
    if (rematchBusy) return;
    if (!duel.challenge) {
      router.replace({ pathname: '/duel/[themeId]', params: { themeId: duel.themeId, mode: duel.opponent.isBot ? 'bot' : 'pvp' } });
      return;
    }
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
  const togglePin = () => {
    if (pinBusy) return;
    const next = !pinned;
    setPinBusy(true);
    setPinError(null);
    api(next ? 'PUT' : 'DELETE', `/api/duels/${duel.duelId}/pin`)
      .then(() => setPinned(next))
      .catch((e) => setPinError(errorMessage(e)))
      .finally(() => setPinBusy(false));
  };
  const mySpeed = speedSummary(record.player);
  const theirSpeed = speedSummary(record.opponent);

  const meView = { name: duel.me.name, color: duel.me.color ?? Colors.player, avatar: duel.me.avatar };
  const oppView = { name: duel.opponent.name, color: duel.opponent.color ?? Colors.opponent, avatar: duel.opponent.avatar };
  const contentWidth = Math.min(width, 480) - 40;
  const coverHeight = Math.round(height * 0.24);
  const scrollToStats = () => scroller.current?.scrollTo({ y: statsY.current, animated: !reducedMotion });
  const scrollToTop = () => scroller.current?.scrollTo({ y: 0, animated: !reducedMotion });

  return (
    <GestureHandlerRootView style={styles.backdrop}>
    <GestureDetector gesture={pullDown}>
    <Animated.View style={[styles.screen, dragStyle]}>
      <GestureDetector gesture={scrollGesture}>
      <Animated.ScrollView ref={scroller} onScroll={onScroll} scrollEventThrottle={16} bounces={false} contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl }} showsVerticalScrollIndicator={false}>
        {/* Premier écran : tout tient dans la hauteur de l'appareil. */}
        <View style={{ minHeight: height }}>
          <ThemeCover themeId={duel.themeId} height={coverHeight + insets.top} fadeTo={R.bg} dim={false}>
            <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
              <Tap accessibilityRole="button" accessibilityLabel="Retour" onPress={close} hitSlop={10} style={styles.headerButton}>
                <Ionicons name="arrow-back" size={30} color={R.text} />
              </Tap>
              <View style={styles.headerCenter}>
                <ThemeIcon themeId={duel.themeId} size={58} />
                <View style={{ flexShrink: 1 }}>
                  <AppText style={styles.title}>RÉSULTATS</AppText>
                  <AppText style={styles.subtitle} numberOfLines={1}>{theme?.name}</AppText>
                </View>
              </View>
              <Tap accessibilityRole="button" accessibilityLabel="Partager le résultat" onPress={share} hitSlop={10} style={styles.headerButton}>
                <Ionicons name="share-social" size={28} color={R.text} />
              </Tap>
            </View>
          </ThemeCover>

          <View style={styles.body}>
            <Animated.View entering={reducedMotion ? undefined : ZoomIn.springify()} style={{ marginTop: -Math.round(contentWidth * 0.12) }}>
              <OutcomeBanner outcome={result.outcome} width={contentWidth + 20} />
            </Animated.View>

            {/* Le joueur connecté est TOUJOURS à gauche : le serveur l'envoie comme « me ». */}
            <Animated.View entering={reducedMotion ? undefined : FadeInDown.delay(120).springify()} style={styles.players}>
              <PlayerSlot player={meView} points={duel.me.points} state={result.outcome === 'win' ? 'win' : result.outcome === 'loss' ? 'loss' : 'draw'} />
              <PlayerSlot player={oppView} points={duel.opponent.points} state={result.outcome === 'win' ? 'loss' : result.outcome === 'loss' ? 'win' : 'draw'} />
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

            <View style={styles.buttons}>
              <Tap accessibilityRole="button" accessibilityLabel="Rejouer" disabled={rematchBusy} onPress={replay} style={[styles.bigButton, { backgroundColor: RC.pink }]}>
                <Ionicons name="play" size={26} color="#FFFFFF" style={styles.bigIcon} />
                <View style={[styles.bigDivider, { backgroundColor: 'rgba(255,255,255,0.7)' }]} />
                <AppText style={[styles.bigLabel, { color: '#FFFFFF' }]}>Rejouer</AppText>
              </Tap>
              <Tap accessibilityRole="button" accessibilityLabel="Rejouer dans un autre thème" onPress={replayOther} style={[styles.bigButton, { backgroundColor: '#FFFFFF' }]}>
                <Ionicons name="shuffle" size={26} color={RC.purpleIcon} style={styles.bigIcon} />
                <View style={[styles.bigDivider, { backgroundColor: RC.purple }]} />
                <AppText style={[styles.bigLabel, styles.bigLabelSmall, { color: RC.purple }]} numberOfLines={1} adjustsFontSizeToFit>
                  Rejouer dans un autre thème
                </AppText>
              </Tap>
              {rematch && (
                <AppText variant="caption" color={R.muted} style={{ textAlign: 'center' }}>
                  {rematch}
                </AppText>
              )}
            </View>

            <XpRing xpBefore={record.xpBefore} gained={result.rewards.total} animate={!reducedMotion} />

            <Tap accessibilityRole="button" accessibilityLabel="Voir les statistiques et les questions" onPress={scrollToStats} hitSlop={16} style={styles.chevron}>
              <Ionicons name="chevron-down" size={44} color={RC.chevron} />
            </Tap>
          </View>
        </View>

        {/* Suite de la page : statistiques puis questions. */}
        <View style={styles.body} onLayout={(e) => (statsY.current = e.nativeEvent.layout.y)}>
          <SectionTitle text="STATISTIQUES" />
          <View style={styles.legendRow}>
            <LegendDot color={RC.win} label={duel.me.name} />
            <LegendDot color={RC.lose} label={duel.opponent.name} />
          </View>
          <ScoreChart record={record} myName={duel.me.name} />

          <View style={styles.speed}>
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
          </View>

          <View style={styles.table}>
            <BonusRow icon="ribbon" label="Score" value={result.rewards.scorePoints ?? 0} />
            <BonusRow icon="trophy" label="Bonus fin" value={result.rewards.finishBonus} />
            <BonusRow icon="star" label="Bonus victoire" value={result.rewards.victoryBonus} />
            <BonusRow icon="flash" label="Bonus boost" value={result.rewards.boostBonus} />
            <View style={[styles.row, styles.totalRow]}>
              <Ionicons name="layers" size={24} color={GOLD} style={styles.rowIcon} />
              <AppText style={[styles.rowLabel, { color: GOLD, fontWeight: '800' }]}>XP total</AppText>
              <AppText style={[styles.rowValue, { color: GOLD, fontSize: 26 }]}>{result.rewards.total}</AppText>
            </View>
          </View>

          <SectionTitle text="QUESTIONS" />
          <QuestionReview
            record={record}
            me={meView}
            opponent={oppView}
            width={contentWidth}
            onShare={share}
            onReport={(i) => {
              const q = record.questions[i];
              if (q) setReportedQuestion({ id: q.id, themeId: duel.themeId, text: q.text });
            }}
          />

          {!duel.opponent.isBot && <DuelChat duelId={duel.duelId} opponentName={duel.opponent.name} />}

          <View style={styles.secondary}>
            <Tap
              accessibilityRole="button"
              accessibilityLabel="Discuter avec l’adversaire"
              disabled={duel.opponent.isBot}
              onPress={() => router.push({ pathname: '/messages/new', params: { userId: duel.opponent.id, duelId: duel.duelId } })}
              style={styles.secondaryButton}>
              <Ionicons name="chatbubble-ellipses" size={26} color={duel.opponent.isBot ? '#52525B' : R.text} />
            </Tap>
            {result.outcome === 'win' && (
              <Tap
                accessibilityRole="button"
                accessibilityLabel={pinned ? 'Retirer cette victoire de mon profil' : 'Épingler cette victoire sur mon profil'}
                accessibilityState={{ selected: pinned }}
                disabled={pinBusy}
                onPress={togglePin}
                style={styles.secondaryButton}>
                <Ionicons name={pinned ? 'pin' : 'pin-outline'} size={26} color={pinned ? Colors.accent : R.text} />
              </Tap>
            )}
          </View>
          {(pinned || pinError) && (
            <AppText variant="caption" color={pinError ? Colors.wrong : R.muted} style={{ textAlign: 'center' }}>
              {pinError ?? 'Victoire épinglée sur ton profil.'}
            </AppText>
          )}

          <Tap accessibilityRole="button" accessibilityLabel="Remonter en haut des résultats" onPress={scrollToTop} hitSlop={12} style={styles.toTop}>
            <Ionicons name="chevron-up" size={36} color={RC.chevron} />
            <AppText style={styles.toTopText}>RÉSULTATS</AppText>
          </Tap>
        </View>
      </Animated.ScrollView>
      </GestureDetector>
      <QuestionReportSheet question={reportedQuestion} onClose={() => setReportedQuestion(null)} />
    </Animated.View>
    </GestureDetector>
    </GestureHandlerRootView>
  );
}

function SectionTitle({ text }: { text: string }) {
  return (
    <AppText accessibilityRole="header" style={styles.sectionTitle}>
      {text}
    </AppText>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <AppText style={styles.legendLabel} numberOfLines={1}>{label}</AppText>
    </View>
  );
}

/** Photo ronde cerclée (vert gagnant, rouge perdant), nom, puis score en grand. */
function PlayerSlot({ player, points, state }: { player: { name: string; color: string; avatar: string | null }; points: number; state: 'win' | 'loss' | 'draw' }) {
  const ring = state === 'win' ? RC.win : state === 'loss' ? '#E0101E' : RC.draw;
  const scoreColor = state === 'win' ? RC.win : state === 'loss' ? RC.lose : RC.draw;
  return (
    <View style={styles.slot} accessible accessibilityLabel={`${player.name} : ${points} points${state === 'win' ? ', gagnant' : ''}`}>
      <Avatar name={player.name} color={player.color} uri={player.avatar} size={88} borderColor={ring} />
      <AppText style={styles.slotName} numberOfLines={1}>
        {player.name}
      </AppText>
      <AppText style={[styles.slotScore, { color: scoreColor }]}>{points}</AppText>
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

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#000000' },
  screen: { flex: 1, backgroundColor: R.bg },
  header: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, gap: 8 },
  headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  headerCenter: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  title: { color: R.text, fontSize: 28, lineHeight: 32, fontWeight: '800', letterSpacing: 1, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 6 },
  subtitle: { color: R.text, fontSize: 18, fontWeight: '600', textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 6 },
  body: { width: '100%', maxWidth: 480, alignSelf: 'center', paddingHorizontal: 20, gap: Spacing.md },
  players: { flexDirection: 'row', justifyContent: 'space-around' },
  slot: { flex: 1, alignItems: 'center', gap: 4 },
  slotName: { color: R.text, fontSize: 16, fontWeight: '600', maxWidth: '95%' },
  slotScore: { fontSize: 52, lineHeight: 58, fontWeight: '900', fontVariant: ['tabular-nums'] },
  buttons: { gap: 12 },
  bigButton: { height: 52, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  bigIcon: { width: 32, textAlign: 'center' },
  bigDivider: { width: 1.5, height: 30, marginHorizontal: 12 },
  bigLabel: { fontSize: 22, fontWeight: '700' },
  bigLabelSmall: { fontSize: 16, flexShrink: 1 },
  chevron: { alignSelf: 'center', marginTop: -Spacing.sm, paddingBottom: Spacing.md },
  sectionTitle: { color: R.text, fontSize: 15, fontWeight: '800', letterSpacing: 2, textAlign: 'center', marginTop: Spacing.lg },
  legendRow: { flexDirection: 'row', justifyContent: 'center', gap: 20, marginTop: -Spacing.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '45%' },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { color: R.muted, fontSize: 13 },
  table: { borderWidth: 1, borderColor: '#3F3F46', borderRadius: 12, overflow: 'hidden', backgroundColor: R.bg },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 50, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: R.line },
  totalRow: { backgroundColor: '#241C02', borderBottomWidth: 0 },
  rowIcon: { width: 40 },
  rowLabel: { flex: 1, color: R.text, fontSize: 16 },
  rowValue: { color: R.text, fontSize: 20, fontWeight: '800', fontVariant: ['tabular-nums'] },
  speed: { borderWidth: 1, borderColor: '#3F3F46', borderRadius: 12, padding: 14, gap: 10 },
  speedTitle: { color: R.text, fontSize: 17, fontWeight: '800', textAlign: 'center' },
  speedHead: { flexDirection: 'row' },
  speedName: { flex: 1, color: R.muted, fontSize: 14, fontWeight: '700' },
  speedRow: { flexDirection: 'row', alignItems: 'center' },
  speedLabel: { flex: 1.2, color: R.muted, fontSize: 14, textAlign: 'center' },
  speedValue: { flex: 1, color: R.text, fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
  speedBest: { color: R.win },
  secondary: { flexDirection: 'row', gap: 12 },
  secondaryButton: { flex: 1, height: 50, borderRadius: 12, backgroundColor: '#111113', alignItems: 'center', justifyContent: 'center' },
  toTop: { alignSelf: 'center', alignItems: 'center', paddingTop: Spacing.md },
  toTopText: { color: RC.chevron, fontSize: 10, fontWeight: '700', letterSpacing: 1, marginTop: -6 },
});
