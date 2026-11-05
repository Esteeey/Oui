import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  Keyframe,
  ZoomIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CHALLENGE_EXPIRY_HOURS, MAX_DUEL_POINTS, RULES, getCategory, getTheme, type DuelSnapshot, type ParticipantView } from '@qu1z/shared';

import { shareChallenge } from '@/components/challenge-card';

import { DuelEntrance } from '@/components/duel-entrance';
import { MATCH_FOUND_MS, MatchmakingMap } from '@/components/matchmaking-map';
import { AppText, Avatar, Button } from '@/components/ui';
import { VERSUS_CLASH_MS, VersusIntro } from '@/components/versus-intro';
import { TICK_WINDOW_MS, VERSUS_HIT_OFFSET_MS, playMusic, playSound, preloadSounds, stopSound } from '@/audio/sounds';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { questionImageSource } from '@/game/question-images';
import { remainingMs, useGameServer } from '@/state/game-server';
import { Tap } from '@/components/tap';

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

/** Fin de la révélation : la réponse reste visible, puis fondu au noir juste avant la question suivante. */
const REVEAL_TOTAL_MS = RULES.revealMs + RULES.transitionMs;
const FADE_TO_BLACK = new Keyframe({
  0: { opacity: 0 },
  [Math.round((RULES.revealMs / REVEAL_TOTAL_MS) * 100)]: { opacity: 0 },
  100: { opacity: 1 },
}).duration(REVEAL_TOTAL_MS);

/**
 * Écran « Manche N », au début de chaque question (le serveur lui réserve `RULES.roundCardMs`
 * au début de la phase de lecture). Sur le noir de la zone centrale, sans cadre : l'icône du thème,
 * son nom et sa catégorie, puis « Manche N » qui domine et « N sur 7 » ; tout s'efface en fondu,
 * un court noir, puis la question apparaît. Apparitions douces, sans rebond.
 * Les instants sont comptés depuis le début réel de la phase, pour rester calés si l'écran
 * s'ouvre en cours de route (reprise d'un duel).
 */
const CARD = { icon: 200, names: 550, round: 800, hide: 1780, fadeOut: 200, question: RULES.roundCardMs } as const;

/** Les 3 dernières secondes du chrono sont en rouge. */
const DANGER_MS = 3_000;

/** Apparition de l'icône : légère montée en taille, sans rebond. */
const ICON_IN = new Keyframe({
  0: { opacity: 0, transform: [{ scale: 0.7 }] },
  100: { opacity: 1, transform: [{ scale: 1 }], easing: Easing.out(Easing.cubic) },
}).duration(260);

function RoundCard({ duel, elapsed, top }: { duel: DuelSnapshot; elapsed: number; top: number }) {
  const theme = getTheme(duel.themeId);
  const category = theme ? getCategory(theme.categoryId) : undefined;
  const last = duel.index === duel.questionCount - 1;
  const at = (ms: number) => Math.max(0, ms - elapsed);
  return (
    <Animated.View exiting={FadeOut.duration(CARD.fadeOut)} style={[styles.card, { top }]} pointerEvents="none">
      <Animated.View entering={ICON_IN.delay(at(CARD.icon))}>
        <AppText style={styles.cardEmoji}>{category?.icon ?? '❓'}</AppText>
      </Animated.View>
      <Animated.View entering={FadeIn.delay(at(CARD.names)).duration(220)} style={styles.cardNames}>
        <AppText color={D.text} style={styles.cardTheme} numberOfLines={1}>
          {theme?.name ?? ''}
        </AppText>
        {!!category && (
          <AppText color={D.muted} style={styles.cardCategory} numberOfLines={1}>
            {category.name}
          </AppText>
        )}
      </Animated.View>
      <Animated.View entering={FadeIn.delay(at(CARD.round)).duration(200)} style={styles.cardRound}>
        <AppText color={D.text} style={styles.roundText} numberOfLines={1} adjustsFontSizeToFit>
          {last ? 'Dernière manche' : `Manche ${duel.index + 1}`}
        </AppText>
        <AppText color={D.muted} style={styles.roundHint}>
          {duel.index + 1} sur {duel.questionCount}
        </AppText>
      </Animated.View>
      {last && (
        <Animated.View entering={ZoomIn.delay(at(CARD.round + 200)).springify()} style={styles.doubleBanner} accessibilityLiveRegion="polite">
          <AppText style={styles.doubleText}>POINTS DOUBLÉS ×{RULES.lastQuestionMultiplier}</AppText>
        </Animated.View>
      )}
    </Animated.View>
  );
}

/**
 * Temps écoulé depuis le début de la phase de lecture, et si l'écran « Manche N » est terminé.
 * Bascule une seule fois par question, à l'instant prévu (et non au fil des rendus).
 */
function useRoundCard(duel: DuelSnapshot, clockOffset: number): { showing: boolean; after: boolean; elapsed: number } {
  const reading = duel.phase === 'reading';
  const elapsed = reading ? Math.max(0, Date.now() + clockOffset - duel.phaseStartedAt) : RULES.roundCardMs;
  const hideAt = CARD.hide;
  const [doneFor, setDoneFor] = useState<number | null>(null);
  useEffect(() => {
    if (!reading) return;
    const id = setTimeout(() => setDoneFor(duel.index), Math.max(0, hideAt - elapsed));
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reading, duel.index, duel.phaseStartedAt]);
  return {
    showing: reading && doneFor !== duel.index && elapsed < hideAt,
    // La question arrive juste après l'écran « Manche N » (et non au retour sur un duel en cours).
    after: reading && elapsed < CARD.question + 500,
    elapsed,
  };
}

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

  if (live?.phase === 'finished' && live.challenge?.leg === 1) return <ChallengeSent duel={live} />;
  if (!live || live.phase === 'finished' || revealing) {
    return <Waiting themeId={params.themeId} opponent={revealing ? live.opponent : null} />;
  }
  return <DuelView duel={live} />;
}

/**
 * Fin de la partie de l'invitant d'un défi : son score est enregistré, l'ami rejouera les mêmes questions
 * (il a 24 h). Lien à partager pour le prévenir aussi en dehors de l'application.
 */
function ChallengeSent({ duel }: { duel: DuelSnapshot }) {
  const forfeited = duel.me.forfeited;
  return (
    <SafeAreaView style={[styles.screen, styles.center]}>
      <AppText variant="title" color={D.text} style={{ textAlign: 'center' }}>
        {forfeited ? 'Défi annulé' : 'Défi envoyé !'}
      </AppText>
      {!forfeited && (
        <>
          <AppText variant="score" color={D.correct} style={{ fontSize: 48 }}>
            {duel.me.points}
          </AppText>
          <AppText color={D.muted} style={{ textAlign: 'center' }}>
            {duel.opponent.name} a {CHALLENGE_EXPIRY_HOURS} h pour rejouer les mêmes questions. Tu seras prévenu du résultat.
          </AppText>
          <Button label="Partager le défi" color={Colors.accent} onPress={() => duel.challenge && shareChallenge({ id: duel.challenge.id, themeId: duel.themeId })} />
        </>
      )}
      <Button label="Retour" variant="outline" color={D.text} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
    </SafeAreaView>
  );
}

/** Attente : connexion au serveur, recherche d'adversaire. */
function Waiting({ opponent }: { themeId: string; opponent: ParticipantView | null }) {
  const game = useGameServer();
  const offline = game.status !== 'online';
  const label = opponent ? 'Adversaire trouvé' : offline ? 'Connexion au serveur' : 'Recherche d’adversaire';

  // Musique d'attente tant qu'on cherche ; elle s'efface quand l'adversaire est trouvé ou qu'on annule
  // (la musique de duel prend ensuite le relais).
  useEffect(() => {
    if (opponent) return;
    preloadSounds();
    const stop = playMusic('search');
    return () => stop();
  }, [opponent]);
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
 * Dès que le serveur a reçu ma réponse, il m'envoie la bonne : le son « juste » ou « faux » tombe aussitôt,
 * sans attendre l'adversaire ; la révélation ne fait plus entendre que le résultat de l'adversaire.
 */
function useDuelSounds(duel: DuelSnapshot, clockOffset: number) {
  const prev = useRef<{ phase: string; index: number } | null>(null);
  /** Question dont mon verdict a déjà été joué (une seule fois, même si l'état est renvoyé). */
  const judged = useRef<string | null>(null);
  const questionKey = `${duel.duelId}:${duel.index}`;

  // Verdict immédiat de ma réponse.
  useEffect(() => {
    if (duel.phase !== 'answering' || duel.myChoice === null || duel.correctIndex === null) return;
    if (judged.current === questionKey) return;
    judged.current = questionKey;
    playSound(duel.myChoice === duel.correctIndex ? 'correct' : 'wrong');
  }, [duel.phase, duel.myChoice, duel.correctIndex, questionKey]);

  useEffect(() => preloadSounds(), []);

  // Musique de fond : de l'intro VS jusqu'à la fin du duel (l'écran de duel est alors démonté).
  useEffect(() => {
    const stop = playMusic('duel');
    return () => {
      stopSound('tick');
      stop();
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
    if (duel.phase === 'reading') {
      // Le son de la question tombe quand l'énoncé sort de l'écran « Manche N ».
      const elapsed = Date.now() + clockOffset - duel.phaseStartedAt;
      const wait = CARD.question - elapsed;
      if (wait < -1000) return; // déjà passé (reprise en cours de lecture)
      const id = setTimeout(() => playSound(duel.index === RULES.questionsPerDuel - 1 ? 'bonusRound' : 'question'), Math.max(0, wait));
      return () => clearTimeout(id);
    }
    if (duel.phase === 'answering') {
      // Les réponses apparaissent et le chrono démarre (pas au retour sur une question déjà entamée).
      if (Date.now() + clockOffset - duel.phaseStartedAt < 1000) playSound('choices');
      return;
    }
    if (duel.phase === 'reveal') {
      // Son de sa propre réponse (s'il n'a pas déjà été joué à la réponse), puis celui de l'adversaire.
      const mine = duel.me.answers[duel.index];
      if (judged.current !== questionKey) {
        judged.current = questionKey;
        playSound(mine?.correct ? 'correct' : mine?.choice == null ? 'timeout' : 'wrong');
      }
      if (duel.opponentChoice === null || duel.opponentChoice === undefined) return;
      const opponentCorrect = duel.opponentChoice === duel.correctIndex;
      const id = setTimeout(() => playSound(opponentCorrect ? 'opponentCorrect' : 'opponentWrong'), 350);
      return () => clearTimeout(id);
    }
  }, [duel.phase, duel.index, duel.me.answers, duel.opponentChoice, duel.correctIndex, questionKey]);

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
  const card = useRoundCard(duel, game.clockOffset);
  const [stageTop, setStageTop] = useState(0);

  const left = remainingMs(duel, game.clockOffset);
  const total = Math.max(1, duel.phaseEndsAt - duel.phaseStartedAt);
  const seconds = duel.phase === 'answering' ? Math.ceil(left / 1000) : duel.phase === 'reading' ? RULES.answerTimeMs / 1000 : 0;
  const reveal = duel.phase === 'reveal';
  const danger = duel.phase === 'answering' && left <= DANGER_MS && left > 0;
  const q = duel.question;
  const lastMine = reveal ? duel.me.answers[duel.index] : undefined;
  // Ma réponse est jugée dès que le serveur l'a reçue (bonne réponse connue), sans attendre l'adversaire.
  const judgedNow = reveal || (duel.phase === 'answering' && duel.myChoice !== null && duel.correctIndex !== null);

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
        {/* Entrée en duel au début de la première question : portraits depuis les bords, barres qui se rejoignent. */}
        <DuelEntrance
          key={duel.duelId}
          active={duel.index === 0 && duel.phase === 'reading'}
          elapsed={Date.now() + game.clockOffset - duel.phaseStartedAt}
          headerStyle={styles.header}
          leftColor={Colors.player}
          rightColor={duel.opponent.color ?? Colors.opponent}
          left={<PlayerHead player={duel.me} side="left" />}
          center={
            <View style={[styles.timerBox, danger && { borderColor: D.wrong }]}>
              <AppText variant="heading" color={danger ? D.wrong : D.text} style={{ fontVariant: ['tabular-nums'] }}>
                {seconds}
              </AppText>
            </View>
          }
          right={<PlayerHead player={duel.opponent} side="right" later={duel.challenge?.leg === 1} />}
          bar={
            <TimeBar
              mine={timeBarFraction(duel, duel.myResponseMs ?? null, left, total)}
              theirs={timeBarFraction(duel, duel.opponentResponseMs ?? null, left, total)}
              leftColor={danger && duel.myResponseMs == null ? D.wrong : Colors.player}
              rightColor={danger && duel.opponentResponseMs == null ? D.wrong : (duel.opponent.color ?? Colors.opponent)}
            />
          }
        />

        {!online && (
          <View style={styles.banner}>
            <Ionicons name="cloud-offline" size={16} color={D.text} />
            <AppText variant="caption" color={D.text}>
              Connexion perdue : le duel continue, reconnexion en cours…
            </AppText>
          </View>
        )}

        <View style={styles.stage} onLayout={(e) => setStageTop(e.nativeEvent.layout.y)}>
          <View style={styles.questionZone}>
            {!card.showing && questionImageSource(q?.image) !== null && (
              <Image source={questionImageSource(q?.image)!} contentFit="contain" transition={300} style={styles.image} accessibilityLabel="Illustration de la question" />
            )}
            {!card.showing && (
            <Animated.View
              key={`q-${duel.index}`}
              entering={card.after ? FadeInDown.delay(CARD.question - CARD.hide).duration(320).withInitialValues({ transform: [{ translateY: 12 }] }) : FadeInDown.springify()}>
              {duel.index === RULES.questionsPerDuel - 1 && (
                <AppText variant="caption" color={D.correct} style={{ textAlign: 'center', marginBottom: Spacing.sm }}>
                  DERNIÈRE QUESTION · POINTS ×{RULES.lastQuestionMultiplier}
                </AppText>
              )}
              <AppText style={styles.question}>{q?.text}</AppText>
            </Animated.View>
            )}
          </View>

          <View style={styles.choices}>
            {duel.phase === 'reading' ? (
              <AppText color={D.muted} style={{ textAlign: 'center', marginTop: Spacing.lg }}>
                Prépare-toi…
              </AppText>
            ) : (
              q?.choices.map((choice, i) => {
                const state = !judgedNow ? 'idle' : i === duel.correctIndex ? 'correct' : duel.myChoice === i ? 'wrong' : 'idle';
                return (
                  <Choice
                    key={`${duel.index}-${i}`}
                    index={i}
                    label={choice}
                    state={state}
                    selected={duel.myChoice === i}
                    opponentPicked={reveal && duel.opponentChoice === i}
                    opponent={duel.opponent}
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

          {reveal && <Animated.View key={`out-${duel.index}`} entering={FADE_TO_BLACK} style={styles.fade} />}
        </View>

        <Tap accessibilityRole="button" onPress={() => setConfirmQuit(true)} style={styles.quit}>
          <AppText variant="caption" color={D.muted}>
            Abandonner
          </AppText>
        </Tap>

        {/* L'écran « Manche N » couvre toute la zone sous le haut de l'écran, qui reste visible. */}
        {card.showing && <RoundCard key={`card-${duel.index}`} duel={duel} elapsed={card.elapsed} top={stageTop} />}
      </View>

      {quitDialog}
    </SafeAreaView>
  );
}

function PlayerHead({ player, side, later = false }: { player: ParticipantView; side: 'left' | 'right'; later?: boolean }) {
  const avatar = <Avatar name={player.name} uri={player.avatar} color={side === 'left' ? Colors.player : (player.color ?? Colors.opponent)} size={46} borderColor={D.ring} />;
  const info = (
    <View style={{ alignItems: side === 'left' ? 'flex-start' : 'flex-end', flexShrink: 1 }}>
      <AppText variant="caption" color={D.muted} numberOfLines={1}>
        {player.name}
      </AppText>
      <ScoreCounter points={player.points} />
      <AppText variant="caption" color={player.connected ? D.correct : D.wrong} style={{ fontSize: 11, minHeight: 14 }}>
        {later ? 'Jouera plus tard' : !player.connected ? 'Déconnecté' : player.answeredCurrent && side === 'right' ? 'A répondu' : ''}
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

/**
 * Score qui compte de l'ancienne à la nouvelle valeur (≈ 400 ms) avec un « +N » qui monte au-dessus et
 * s'efface. Avec « réduire les animations », le score change directement, sans « +N » animé.
 */
function ScoreCounter({ points }: { points: number }) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(points);
  const [gain, setGain] = useState<{ value: number; key: number } | null>(null);
  const from = useRef(points);
  useEffect(() => {
    const start = from.current;
    from.current = points;
    if (points === start) return;
    if (reduced || points < start) {
      setShown(points);
      return;
    }
    setGain({ value: points - start, key: Date.now() });
    let raf = 0;
    let t0 = 0;
    const tick = (now: number) => {
      if (!t0) t0 = now;
      const t = Math.min(1, (now - t0) / 400);
      setShown(Math.round(start + (points - start) * t));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const hide = setTimeout(() => setGain(null), 900);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(hide);
      setShown(points);
    };
  }, [points, reduced]);
  return (
    <View>
      {gain && <GainPop key={gain.key} value={gain.value} />}
      <AppText variant="score" color={D.text} style={{ fontSize: 28, fontVariant: ['tabular-nums'] }}>
        {shown}
      </AppText>
    </View>
  );
}

/** « +N » vert qui monte au-dessus du score puis disparaît. */
function GainPop({ value }: { value: number }) {
  const y = useSharedValue(0);
  const o = useSharedValue(1);
  useEffect(() => {
    y.set(withTiming(-26, { duration: 800, easing: Easing.out(Easing.cubic) }));
    o.set(withSequence(withTiming(1, { duration: 450 }), withTiming(0, { duration: 350 })));
  }, [y, o]);
  const style = useAnimatedStyle(() => ({ opacity: o.get(), transform: [{ translateY: y.get() }] }));
  return (
    <Animated.View pointerEvents="none" style={[styles.gainPop, style]}>
      <AppText style={styles.gainText}>+{value}</AppText>
    </Animated.View>
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

/**
 * Remplissage d'une moitié de la barre de temps, d'après le chrono du serveur : pleine pendant la lecture,
 * elle se vide pendant la réponse et se fige dès que son joueur a répondu (`answeredMs`, temps mesuré par
 * le serveur), jusqu'à la question suivante. Sans réponse, elle finit vide.
 * Chaque moitié ne dépend que de la réponse de son joueur.
 */
function timeBarFraction(duel: DuelSnapshot, answeredMs: number | null, left: number, total: number): number {
  if (duel.phase === 'reading') return 1;
  if (duel.phase !== 'answering' && duel.phase !== 'reveal') return 0;
  if (answeredMs !== null) return 1 - answeredMs / RULES.answerTimeMs;
  return duel.phase === 'answering' ? left / total : 0;
}

/**
 * Barre de temps en deux moitiés qui se rejoignent au centre : la mienne à gauche, celle de l'adversaire
 * à droite. Chacune se vide vers son bord pendant que son joueur réfléchit et s'arrête net dès qu'il répond.
 */
function TimeBar({ mine, theirs, leftColor, rightColor }: { mine: number; theirs: number; leftColor: string; rightColor: string }) {
  const half = (f: number) => `${Math.max(0, Math.min(1, f)) * 50}%` as const;
  return (
    <View style={styles.timeTrack} accessible accessibilityLabel={`Temps restant : toi ${Math.round(mine * 100)} %, adversaire ${Math.round(theirs * 100)} %`}>
      <View style={[styles.timeHalf, { left: 0, width: half(mine), backgroundColor: leftColor }]} />
      <View style={[styles.timeHalf, { right: 0, width: half(theirs), backgroundColor: rightColor }]} />
    </View>
  );
}

function Choice({
  index,
  label,
  state,
  selected,
  opponentPicked,
  opponent,
  disabled,
  onPress,
}: {
  index: number;
  label: string;
  state: 'idle' | 'correct' | 'wrong';
  selected: boolean;
  opponentPicked: boolean;
  opponent: ParticipantView;
  disabled: boolean;
  onPress: () => void;
}) {
  // Mauvaise réponse : petite secousse du bouton (sauf si « réduire les animations » est activé).
  const reduced = useReducedMotion();
  const shake = useSharedValue(0);
  useEffect(() => {
    if (state !== 'wrong' || reduced) return;
    shake.set(
      withSequence(
        withTiming(-8, { duration: 50 }),
        withTiming(8, { duration: 70 }),
        withTiming(-6, { duration: 60 }),
        withTiming(4, { duration: 50 }),
        withTiming(0, { duration: 40 }),
      ),
    );
  }, [state, reduced, shake]);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.get() }] }));
  const bg = state === 'correct' ? D.correct : state === 'wrong' ? D.wrong : D.button;
  const fg = state === 'idle' ? D.buttonText : '#FFFFFF';
  return (
    <Animated.View entering={FadeInDown.delay(index * 50).springify()} style={styles.choiceRow}>
      <View style={styles.markerSlot}>{selected && <Triangle direction="right" color="#FF3B83" label="Ta réponse" />}</View>
      <Animated.View style={[{ flex: 1 }, shakeStyle]}>
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
        {opponentPicked && (
          <Animated.View entering={reduced ? undefined : ZoomIn.springify()} style={styles.opponentMark} accessible accessibilityLabel={`Réponse de ${opponent.name}`}>
            <Avatar name={opponent.name} uri={opponent.avatar} color={opponent.color ?? Colors.opponent} size={26} borderColor="#FFFFFF" />
          </Animated.View>
        )}
      </Pressable>
      </Animated.View>
      <View style={styles.markerSlot} />
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
  timeHalf: { position: 'absolute', top: 0, bottom: 0, borderRadius: 4 },
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
  // Proportions relevées sur la référence : icône ≈ 14 % de la largeur, titre ≈ 11 %, bloc centré
  // dans la zone sous le haut de l'écran, un peu au-dessus du milieu.
  // left/right = marge du contenu : les jauges latérales restent visibles.
  card: { position: 'absolute', left: 20, right: 20, bottom: 0, backgroundColor: D.bg, alignItems: 'center', justifyContent: 'center', paddingBottom: '30%' },
  cardEmoji: { fontSize: 46, lineHeight: 56, textAlign: 'center' },
  cardNames: { alignItems: 'center', marginTop: 10, maxWidth: '90%' },
  cardTheme: { fontSize: 17, lineHeight: 22 },
  cardCategory: { fontSize: 10, lineHeight: 14, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', marginTop: 2 },
  cardRound: { alignItems: 'center', marginTop: 26, maxWidth: '100%' },
  roundText: { fontFamily: Fonts.score, fontSize: 44, lineHeight: 52, letterSpacing: 0.5, textTransform: 'uppercase', textAlign: 'center' },
  roundHint: { fontSize: 14, lineHeight: 18, marginTop: 4 },
  questionZone: { minHeight: 150, justifyContent: 'center', gap: Spacing.sm },
  image: { width: '100%', height: 130, borderRadius: Radius.sm },
  question: { color: D.text, fontSize: 28, lineHeight: 34, fontWeight: '800', textAlign: 'center' },
  choices: { gap: 12 },
  choiceRow: { flexDirection: 'row', alignItems: 'center' },
  markerSlot: { width: 16, alignItems: 'center' },
  opponentMark: { position: 'absolute', right: -6, top: -8 },
  gainPop: { position: 'absolute', top: -18, left: 0, right: 0, alignItems: 'center', zIndex: 2 },
  gainText: { color: D.correct, fontWeight: '900', fontSize: 18 },
  doubleBanner: { marginTop: 18, paddingHorizontal: 18, paddingVertical: 8, borderRadius: 999, backgroundColor: '#F5B700' },
  doubleText: { color: '#000000', fontWeight: '900', fontSize: 18, letterSpacing: 1 },
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
