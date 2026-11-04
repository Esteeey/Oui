import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, Keyframe, ZoomIn, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MAX_DUEL_POINTS, RULES, getCategory, getTheme, type DuelSnapshot, type ParticipantView } from '@qu1z/shared';

import { MATCH_FOUND_MS, MatchmakingMap } from '@/components/matchmaking-map';
import { AppText, Avatar, Button } from '@/components/ui';
import { VERSUS_CLASH_MS, VersusIntro } from '@/components/versus-intro';
import { TICK_WINDOW_MS, VERSUS_HIT_OFFSET_MS, playMusic, playSound, preloadSounds, stopMusic, stopSound } from '@/audio/sounds';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { questionImageSource } from '@/game/question-images';
import { remainingMs, useGameServer } from '@/state/game-server';

/** Couleurs de l'écran de duel (fond noir, boutons clairs). */
const D = {
  bg: '#000000',
  text: '#FFFFFF',
  muted: '#9A9AA3',
  button: '#D4D4D8',
  buttonText: '#0A0A0A',
  correct: '#22C55E',
  wrong: '#EF4444',
  gauge: '#22C55E',
  track: '#2A2A2E',
  ring: '#251F44',
  onButton: '#0E0B1A',
};

/**
 * Transition entre deux questions : la révélation reste visible, fondu au noir, court répit au noir,
 * puis la question suivante sort du noir.
 */
const FADE_OUT_MS = 500;
const REVEAL_TOTAL_MS = RULES.revealMs + RULES.transitionMs;
const FADE_TO_BLACK = new Keyframe({
  0: { opacity: 0 },
  [Math.round((RULES.revealMs / REVEAL_TOTAL_MS) * 100)]: { opacity: 0 },
  [Math.round(((RULES.revealMs + FADE_OUT_MS) / REVEAL_TOTAL_MS) * 100)]: { opacity: 1 },
  100: { opacity: 1 },
}).duration(REVEAL_TOTAL_MS);
const FADE_FROM_BLACK = new Keyframe({ 0: { opacity: 1 }, 100: { opacity: 0 } }).duration(600);

type Params = { themeId: string; mode?: string; resume?: string };

export default function DuelRoute() {
  const params = useLocalSearchParams<Params>();
  const game = useGameServer();
  // Un duel terminé déjà affiché avant d'ouvrir cet écran n'est pas « le nôtre ».
  const staleDuelId = useRef(game.duel?.phase === 'finished' ? game.duel.duelId : null);
  const requested = useRef(false);

  const live = game.duel && game.duel.duelId !== staleDuelId.current ? game.duel : null;

  // Demande un duel au serveur (sauf si l'on revient sur un duel déjà en cours).
  useEffect(() => {
    if (requested.current || game.status !== 'online') return;
    if (game.duel && game.duel.phase !== 'finished') {
      requested.current = true;
      return;
    }
    if (params.resume) return;
    requested.current = true;
    playSound('launch');
    game.play({
      themeId: params.themeId,
      mode: params.mode === 'pvp' ? 'pvp' : 'bot',
    });
  }, [game, params]);

  // Fin du duel : direction les résultats.
  useEffect(() => {
    if (live?.phase === 'finished' && live.result) router.replace('/results');
  }, [live]);

  // Adversaire trouvé après une recherche : la carte plonge d'abord sur lui (étapes 6 et 7), puis le duel s'affiche.
  const searched = useRef(false);
  if (game.queued || (params.mode === 'pvp' && !params.resume)) searched.current = true;
  const [revealed, setRevealed] = useState<string | null>(null);
  const revealing = !!live && live.phase !== 'finished' && searched.current && revealed !== live.duelId;
  useEffect(() => {
    if (!revealing || !live) return;
    const duelId = live.duelId;
    const id = setTimeout(() => setRevealed(duelId), MATCH_FOUND_MS);
    return () => clearTimeout(id);
    // Le minuteur ne dépend que du duel trouvé, pas des mises à jour de son état.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealing, live?.duelId]);

  if (!live || live.phase === 'finished' || revealing) {
    return <Waiting themeId={params.themeId} opponent={revealing ? live.opponent : null} />;
  }
  return <DuelView duel={live} />;
}

/** Attente : connexion au serveur, recherche d'adversaire. */
function Waiting({ opponent }: { themeId: string; opponent: ParticipantView | null }) {
  const game = useGameServer();
  const offline = game.status !== 'online';
  const label = opponent ? 'Adversaire trouvé' : offline ? 'Connexion au serveur' : 'Recherche d’adversaire';
  return (
    <View style={[styles.screen, { backgroundColor: '#000000' }]}>
      {/* La carte du monde occupe tout l'écran et défile ; le texte et l'annulation restent en bas. */}
      <MatchmakingMap opponent={opponent} />
      <SafeAreaView edges={['bottom']} style={waitingStyles.bottom} pointerEvents="box-none">
        {game.status === 'offline' && (
          <AppText variant="caption" color={D.muted} style={{ textAlign: 'center', maxWidth: 300 }}>
            Le serveur de jeu est injoignable. Nouvelle tentative automatique…
          </AppText>
        )}
        {game.lastError && <AppText color={D.wrong}>{game.lastError}</AppText>}
        <AppText variant="caption" color="#B0B0B8" style={waitingStyles.label}>
          {label}
        </AppText>
        {!opponent && (
          <View style={{ gap: Spacing.sm, alignSelf: 'stretch', paddingHorizontal: Spacing.xl }}>
            {game.status === 'offline' && <Button label="Réessayer" color="#FF3B83" textColor={D.onButton} onPress={game.retry} />}
            <Button
              label="Annuler"
              variant="outline"
              color={D.text}
              onPress={() => {
                game.cancelQueue();
                if (router.canGoBack()) router.back();
                else router.replace('/');
              }}
            />
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

const waitingStyles = StyleSheet.create({
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', gap: Spacing.md, paddingBottom: Spacing.lg },
  label: { letterSpacing: 2.5, textTransform: 'uppercase', textAlign: 'center', paddingVertical: Spacing.sm },
});

function useNow(active: boolean): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

/**
 * Sons du duel, déclenchés par les changements de phase envoyés par le serveur.
 * La justesse d'une réponse n'est connue qu'à la révélation : le son tombe donc à ce moment-là.
 */
function useDuelSounds(duel: DuelSnapshot, clockOffset: number) {
  const prev = useRef<{ phase: string; index: number } | null>(null);

  useEffect(() => preloadSounds(), []);

  // Musique de fond : de l'intro VS jusqu'à la fin du duel (l'écran de duel est alors démonté).
  useEffect(() => {
    playMusic('duel');
    return () => {
      stopSound('tick');
      stopMusic('duel');
    };
  }, []);

  // Une seule fois par question et par phase, même si le serveur renvoie plusieurs fois le même état.
  useEffect(() => {
    const before = prev.current;
    prev.current = { phase: duel.phase, index: duel.index };
    if (before && before.phase === duel.phase && before.index === duel.index) return;
    if (duel.phase !== 'answering') stopSound('tick');

    if (duel.phase === 'intro') {
      // Calé sur le choc des deux moitiés de l'intro VS.
      const id = setTimeout(() => playSound('versus'), Math.max(0, VERSUS_CLASH_MS - VERSUS_HIT_OFFSET_MS));
      return () => clearTimeout(id);
    }
    if (duel.phase === 'reading') playSound(duel.index === RULES.questionsPerDuel - 1 ? 'bonusRound' : 'question');
    if (duel.phase === 'reveal') {
      // Son de sa propre réponse, puis celui de l'adversaire dès que son résultat est connu.
      const mine = duel.me.answers[duel.index];
      playSound(mine?.correct ? 'correct' : mine?.choice == null ? 'timeout' : 'wrong');
      if (duel.opponentChoice === null || duel.opponentChoice === undefined) return;
      const opponentCorrect = duel.opponentChoice === duel.correctIndex;
      const id = setTimeout(() => playSound(opponentCorrect ? 'opponentCorrect' : 'opponentWrong'), 350);
      return () => clearTimeout(id);
    }
  }, [duel.phase, duel.index, duel.me.answers, duel.opponentChoice, duel.correctIndex]);

  // Tic-tac des 5 dernières secondes tant qu'on n'a pas répondu, programmé d'après l'heure de fin
  // de la question (et non au fil des rendus) ; coupé dès qu'on répond ou à la révélation.
  useEffect(() => {
    if (duel.phase !== 'answering' || duel.myChoice !== null) {
      stopSound('tick');
      return;
    }
    const left = remainingMs(duel, clockOffset);
    if (left <= 0) return;
    const id = setTimeout(() => playSound('tick'), Math.max(0, left - TICK_WINDOW_MS));
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duel.phase, duel.index, duel.myChoice]);
}

function DuelView({ duel }: { duel: DuelSnapshot }) {
  const game = useGameServer();
  const theme = getTheme(duel.themeId);
  const category = theme ? getCategory(theme.categoryId) : undefined;
  const [confirmQuit, setConfirmQuit] = useState(false);
  const online = game.status === 'online';
  useNow(duel.phase === 'answering' || duel.phase === 'reading');
  useDuelSounds(duel, game.clockOffset);

  const left = remainingMs(duel, game.clockOffset);
  const total = Math.max(1, duel.phaseEndsAt - duel.phaseStartedAt);
  const seconds = duel.phase === 'answering' ? Math.ceil(left / 1000) : duel.phase === 'reading' ? RULES.answerTimeMs / 1000 : 0;
  const reveal = duel.phase === 'reveal';
  const q = duel.question;
  const lastMine = reveal ? duel.me.answers[duel.index] : undefined;

  // Confirmation d’abandon, aussi accessible depuis l’écran « VS ».
  const quitDialog = confirmQuit && (
    <View style={styles.overlay}>
      <View style={styles.dialog}>
        <AppText variant="heading" color={D.text}>
          Abandonner le duel ?
        </AppText>
        <AppText color={D.muted}>
          Ton adversaire gagne et tu ne reçois aucun XP. Une simple coupure de réseau, elle, n’est pas un abandon.
        </AppText>
        <Button
          label="Abandonner"
          color={D.wrong}
          textColor={D.onButton}
          onPress={() => {
            setConfirmQuit(false);
            game.forfeit();
          }}
        />
        <Button label="Continuer à jouer" variant="outline" color={D.text} onPress={() => setConfirmQuit(false)} />
      </View>
    </View>
  );

  if (duel.phase === 'intro') {
    return (
      <VersusIntro duel={duel} onBack={() => setConfirmQuit(true)}>
        {quitDialog}
      </VersusIntro>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <Gauge points={duel.me.points} side="left" />
      <Gauge points={duel.opponent.points} side="right" />

      <View style={styles.content}>
        <View style={styles.header}>
          <PlayerHead player={duel.me} side="left" />
          <View style={styles.timerBox}>
            <AppText variant="heading" color={D.text} style={{ fontVariant: ['tabular-nums'] }}>
              {seconds}
            </AppText>
          </View>
          <PlayerHead player={duel.opponent} side="right" />
        </View>

        <TimeBar running={duel.phase === 'answering' && duel.myChoice === null} fraction={left / total} phase={duel.phase} />

        {!online && (
          <View style={styles.banner}>
            <Ionicons name="cloud-offline" size={16} color={D.text} />
            <AppText variant="caption" color={D.text}>
              Connexion perdue : le duel continue, reconnexion en cours…
            </AppText>
          </View>
        )}

        <View style={styles.stage}>
          <View style={styles.questionZone}>
            {questionImageSource(q?.image) !== null && (
              <Image source={questionImageSource(q?.image)!} contentFit="contain" style={styles.image} accessibilityLabel="Illustration de la question" />
            )}
            <Animated.View key={`q-${duel.index}`} entering={FadeInDown.springify()}>
              {duel.index === RULES.questionsPerDuel - 1 && (
                <AppText variant="caption" color={D.correct} style={{ textAlign: 'center', marginBottom: Spacing.sm }}>
                  DERNIÈRE QUESTION · POINTS ×{RULES.lastQuestionMultiplier}
                </AppText>
              )}
              <AppText style={styles.question}>{q?.text}</AppText>
            </Animated.View>
          </View>

          <View style={styles.choices}>
            {duel.phase === 'reading' ? (
              <AppText color={D.muted} style={{ textAlign: 'center', marginTop: Spacing.lg }}>
                Prépare-toi…
              </AppText>
            ) : (
              q?.choices.map((choice, i) => {
                const state = !reveal ? 'idle' : i === duel.correctIndex ? 'correct' : duel.myChoice === i ? 'wrong' : 'idle';
                return (
                  <Choice
                    key={`${duel.index}-${i}`}
                    index={i}
                    label={choice}
                    state={state}
                    selected={duel.myChoice === i}
                    opponentPicked={reveal && duel.opponentChoice === i}
                    disabled={!online || duel.phase !== 'answering' || duel.myChoice !== null}
                    onPress={() => {
                      playSound('answered');
                      game.answer(i);
                    }}
                  />
                );
              })
            )}
          </View>

          <View style={styles.footer}>
            {duel.phase === 'answering' && duel.myChoice !== null && (
              <AppText color={D.muted}>{duel.opponent.answeredCurrent ? '' : 'En attente de l’adversaire…'}</AppText>
            )}
            {reveal && lastMine && (
              <Animated.View entering={ZoomIn.springify()}>
                <AppText variant="score" color={lastMine.correct ? D.correct : D.wrong}>
                  {lastMine.correct ? `+${lastMine.points}` : lastMine.choice === null ? 'Temps écoulé' : 'Raté'}
                </AppText>
              </Animated.View>
            )}
          </View>

          {reveal ? (
            <Animated.View key={`out-${duel.index}`} entering={FADE_TO_BLACK} style={styles.fade} />
          ) : duel.index > 0 && duel.phase === 'reading' ? (
            <Animated.View key={`in-${duel.index}`} entering={FADE_FROM_BLACK} style={[styles.fade, { opacity: 0 }]} />
          ) : null}
        </View>

        <Pressable accessibilityRole="button" onPress={() => setConfirmQuit(true)} style={styles.quit}>
          <AppText variant="caption" color={D.muted}>
            Abandonner
          </AppText>
        </Pressable>
      </View>

      {quitDialog}
    </SafeAreaView>
  );
}

function PlayerHead({ player, side }: { player: ParticipantView; side: 'left' | 'right' }) {
  const avatar = <Avatar name={player.name} color={side === 'left' ? Colors.player : (player.color ?? Colors.opponent)} size={46} borderColor={D.ring} />;
  const info = (
    <View style={{ alignItems: side === 'left' ? 'flex-start' : 'flex-end', flexShrink: 1 }}>
      <AppText variant="caption" color={D.muted} numberOfLines={1}>
        {player.name}
      </AppText>
      <AppText variant="score" color={D.text} style={{ fontSize: 28 }}>
        {player.points}
      </AppText>
      <AppText variant="caption" color={player.connected ? D.correct : D.wrong} style={{ fontSize: 11, minHeight: 14 }}>
        {!player.connected ? 'Déconnecté' : player.answeredCurrent && side === 'right' ? 'A répondu' : ''}
      </AppText>
    </View>
  );
  return (
    <View style={[styles.head, side === 'right' && { justifyContent: 'flex-end' }]}>
      {side === 'left' ? avatar : info}
      {side === 'left' ? info : avatar}
    </View>
  );
}

/** Jauge verticale des points, collée au bord de l'écran (gauche : moi, droite : l'adversaire). */
function Gauge({ points, side }: { points: number; side: 'left' | 'right' }) {
  const fill = useAnimatedStyle(() => ({
    height: withTiming(`${Math.min(100, (points / MAX_DUEL_POINTS) * 100)}%`, { duration: 500 }),
  }));
  return (
    <View
      accessible
      accessibilityLabel={`${side === 'left' ? 'Tes points' : 'Points de l’adversaire'} : ${points}`}
      style={[styles.gauge, side === 'left' ? { left: 6 } : { right: 6 }]}>
      <Animated.View style={[styles.gaugeFill, fill]} />
    </View>
  );
}

function TimeBar({ running, fraction, phase }: { running: boolean; fraction: number; phase: string }) {
  const width = phase === 'reading' ? 100 : Math.max(0, Math.min(1, fraction)) * 100;
  const color = width < 30 && running ? D.wrong : '#8E8E93';
  return (
    <View style={styles.timeTrack}>
      <View style={{ width: `${width}%`, height: '100%', borderRadius: 4, backgroundColor: color }} />
    </View>
  );
}

function Choice({
  index,
  label,
  state,
  selected,
  opponentPicked,
  disabled,
  onPress,
}: {
  index: number;
  label: string;
  state: 'idle' | 'correct' | 'wrong';
  selected: boolean;
  opponentPicked: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const bg = state === 'correct' ? D.correct : state === 'wrong' ? D.wrong : D.button;
  const fg = state === 'idle' ? D.buttonText : '#FFFFFF';
  return (
    <Animated.View entering={FadeInDown.delay(index * 50).springify()} style={styles.choiceRow}>
      <View style={styles.markerSlot}>{selected && <Triangle direction="right" color="#FF3B83" label="Ta réponse" />}</View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled, selected }}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [styles.choice, { backgroundColor: bg }, selected && state === 'idle' && styles.selected, pressed && { transform: [{ scale: 0.98 }] }]}>
        <AppText style={[styles.choiceText, { color: fg }]} numberOfLines={2}>
          {label}
        </AppText>
        {state !== 'idle' && (
          <View style={styles.choiceIcon}>
            <Ionicons name={state === 'correct' ? 'checkmark-circle' : 'close-circle'} size={30} color="#FFFFFF" />
          </View>
        )}
      </Pressable>
      <View style={styles.markerSlot}>
        {opponentPicked && <Triangle direction="left" color="#FFFFFF" label="Réponse de l’adversaire" />}
      </View>
    </Animated.View>
  );
}

/** Petit triangle pointé vers le bouton : à gauche ma réponse, à droite celle de l'adversaire (après révélation). */
function Triangle({ direction, color, label }: { direction: 'left' | 'right'; color: string; label: string }) {
  return (
    <View
      accessible
      accessibilityLabel={label}
      style={{
        width: 0,
        height: 0,
        borderTopWidth: 9,
        borderBottomWidth: 9,
        borderTopColor: 'transparent',
        borderBottomColor: 'transparent',
        ...(direction === 'right'
          ? { borderLeftWidth: 12, borderLeftColor: color }
          : { borderRightWidth: 12, borderRightColor: color }),
      }}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: D.bg },
  center: { justifyContent: 'center', alignItems: 'center', gap: Spacing.lg, padding: Spacing.lg },
  content: { flex: 1, width: '100%', maxWidth: 560, alignSelf: 'center', paddingHorizontal: 20, paddingTop: Spacing.sm, gap: Spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  head: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  timerBox: {
    minWidth: 64,
    height: 48,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#3A3A3F',
    backgroundColor: '#111114',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeTrack: { height: 8, borderRadius: 4, backgroundColor: D.track, overflow: 'hidden' },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#3A1212',
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
  },
  stage: { gap: Spacing.md },
  fade: { ...StyleSheet.absoluteFill, backgroundColor: D.bg, pointerEvents: 'none' },
  questionZone: { minHeight: 150, justifyContent: 'center', gap: Spacing.sm },
  image: { width: '100%', height: 130, borderRadius: Radius.sm },
  question: { color: D.text, fontSize: 28, lineHeight: 34, fontWeight: '800', textAlign: 'center' },
  choices: { gap: 12 },
  choiceRow: { flexDirection: 'row', alignItems: 'center' },
  markerSlot: { width: 16, alignItems: 'center' },
  choice: {
    flex: 1,
    minHeight: 60,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 48,
  },
  selected: { borderWidth: 3, borderColor: '#FF3B83' },
  choiceText: { fontSize: 20, fontWeight: '800', textAlign: 'center' },
  choiceIcon: { position: 'absolute', right: 14 },
  footer: { alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  quit: { alignSelf: 'center', padding: Spacing.sm },
  gauge: {
    position: 'absolute',
    top: 150,
    bottom: 30,
    width: 5,
    borderRadius: 3,
    backgroundColor: D.track,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  gaugeFill: { width: '100%', backgroundColor: D.gauge, borderRadius: 3 },
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  dialog: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#141416',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#2A2A2E',
    padding: Spacing.lg,
    gap: Spacing.md,
  },
});
