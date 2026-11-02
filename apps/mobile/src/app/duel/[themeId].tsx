import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeInUp, ZoomIn, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MAX_DUEL_POINTS, RULES, getCategory, getTheme, type DuelSnapshot, type ParticipantView } from '@qu1z/shared';

import { AppText, Avatar, Button } from '@/components/ui';
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
};

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
    game.play({
      themeId: params.themeId,
      mode: params.mode === 'pvp' ? 'pvp' : 'bot',
    });
  }, [game, params]);

  // Fin du duel : direction les résultats.
  useEffect(() => {
    if (live?.phase === 'finished' && live.result) router.replace('/results');
  }, [live]);

  if (!live || live.phase === 'finished') {
    return <Waiting themeId={params.themeId} />;
  }
  return <DuelView duel={live} />;
}

/** Attente : connexion au serveur, recherche d'adversaire. */
function Waiting({ themeId }: { themeId: string }) {
  const game = useGameServer();
  const theme = getTheme(themeId);
  const offline = game.status !== 'online';
  return (
    <SafeAreaView style={[styles.screen, styles.center]}>
      <AppText variant="title" color={D.text} style={{ textAlign: 'center' }}>
        {offline ? 'Connexion au serveur…' : game.queued ? 'Recherche d’un adversaire…' : 'Préparation du duel…'}
      </AppText>
      {theme && (
        <AppText color={D.muted} style={{ textAlign: 'center' }}>
          {theme.name}
        </AppText>
      )}
      {game.queued && (
        <AppText variant="caption" color={D.muted} style={{ textAlign: 'center' }}>
          Sans adversaire au bout de 10 s, tu joues contre le bot d’entraînement.
        </AppText>
      )}
      {game.status === 'offline' && (
        <AppText variant="caption" color={D.muted} style={{ textAlign: 'center', maxWidth: 300 }}>
          Le serveur de jeu est injoignable. Nouvelle tentative automatique…
        </AppText>
      )}
      {game.lastError && <AppText color={D.wrong}>{game.lastError}</AppText>}
      <View style={{ gap: Spacing.sm, alignSelf: 'stretch', paddingHorizontal: Spacing.xl }}>
        {game.status === 'offline' && <Button label="Réessayer" color="#FF6B35" onPress={game.retry} />}
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
    </SafeAreaView>
  );
}

function useNow(active: boolean): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

function DuelView({ duel }: { duel: DuelSnapshot }) {
  const game = useGameServer();
  const theme = getTheme(duel.themeId);
  const category = theme ? getCategory(theme.categoryId) : undefined;
  const [confirmQuit, setConfirmQuit] = useState(false);
  const online = game.status === 'online';
  useNow(duel.phase === 'answering' || duel.phase === 'reading');

  const left = remainingMs(duel, game.clockOffset);
  const total = Math.max(1, duel.phaseEndsAt - duel.phaseStartedAt);
  const seconds = duel.phase === 'answering' ? Math.ceil(left / 1000) : duel.phase === 'reading' ? RULES.answerTimeMs / 1000 : 0;
  const reveal = duel.phase === 'reveal';
  const q = duel.question;
  const lastMine = reveal ? duel.me.answers[duel.index] : undefined;

  if (duel.phase === 'intro') {
    return (
      <SafeAreaView style={[styles.screen, styles.center]}>
        <Animated.View entering={FadeInDown.springify()} style={styles.introPlayer}>
          <Avatar name={duel.me.name} color={Colors.player} size={96} />
          <AppText variant="heading" color={D.text}>
            {duel.me.name}
          </AppText>
        </Animated.View>
        <Animated.View entering={ZoomIn.delay(250).springify()}>
          <AppText variant="display" color="#FF6B35" style={{ fontStyle: 'italic' }}>
            VS
          </AppText>
        </Animated.View>
        <Animated.View entering={FadeInUp.delay(120).springify()} style={styles.introPlayer}>
          <Avatar name={duel.opponent.name} color={duel.opponent.color ?? Colors.opponent} size={96} />
          <AppText variant="heading" color={D.text}>
            {duel.opponent.name}
          </AppText>
          {duel.opponent.isBot && (
            <AppText variant="caption" color={D.muted}>
              Réponses simulées (bot)
            </AppText>
          )}
        </Animated.View>
        <Animated.View entering={FadeIn.delay(500)} style={{ alignItems: 'center', gap: 4 }}>
          {category && (
            <AppText variant="caption" color={category.color}>
              {category.icon} {category.name.toUpperCase()}
            </AppText>
          )}
          <AppText variant="title" color={D.text}>
            {theme?.name}
          </AppText>
        </Animated.View>
      </SafeAreaView>
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

        <View style={styles.questionZone}>
          {questionImageSource(q?.image) !== null && (
            <Image source={questionImageSource(q?.image)!} contentFit="contain" style={styles.image} accessibilityLabel="Illustration de la question" />
          )}
          <Animated.View key={`q-${duel.index}`} entering={FadeInDown.springify()}>
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
                  onPress={() => game.answer(i)}
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

        <Pressable accessibilityRole="button" onPress={() => setConfirmQuit(true)} style={styles.quit}>
          <AppText variant="caption" color={D.muted}>
            Abandonner
          </AppText>
        </Pressable>
      </View>

      {confirmQuit && (
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
              onPress={() => {
                setConfirmQuit(false);
                game.forfeit();
              }}
            />
            <Button label="Continuer à jouer" variant="outline" color={D.text} onPress={() => setConfirmQuit(false)} />
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

function PlayerHead({ player, side }: { player: ParticipantView; side: 'left' | 'right' }) {
  const avatar = <Avatar name={player.name} color={side === 'left' ? Colors.player : (player.color ?? Colors.opponent)} size={46} />;
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
      <View style={styles.markerSlot}>{selected && <Triangle direction="right" color="#FF6B35" label="Ta réponse" />}</View>
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
  introPlayer: { alignItems: 'center', gap: Spacing.sm },
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
  selected: { borderWidth: 3, borderColor: '#FF6B35' },
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
