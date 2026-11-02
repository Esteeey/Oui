import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeInUp, ZoomIn } from 'react-native-reanimated';

import {
  RULES,
  INITIAL_RATING,
  duelOutcome,
  duelXp,
  ratingDelta,
  getCategory,
  getTheme,
  questionsOf,
  type ScoredAnswer,
} from '@qu1z/shared';

import { Image } from 'expo-image';

import { Countdown } from '@/components/countdown';
import { AppText, Avatar, Screen } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { demoRating, getPlayer } from '@/demo/data';
import { BOT_NAME } from '@/game/bot';
import { questionImageSource } from '@/game/question-images';
import { useDuel } from '@/game/use-duel';
import { useProgress, useThemeStats } from '@/state/progress';
import { useSocial } from '@/state/social';

export default function DuelRoute() {
  const { themeId, opponent, challenge } = useLocalSearchParams<{
    themeId: string;
    opponent?: string;
    challenge?: string;
  }>();
  const theme = getTheme(themeId);
  if (!theme || questionsOf(theme.id).length < RULES.questionsPerDuel) return <Redirect href="/" />;
  return <DuelScreen themeId={theme.id} opponentId={opponent ?? null} challengeId={challenge ?? null} />;
}

function DuelScreen({
  themeId,
  opponentId,
  challengeId,
}: {
  themeId: string;
  /** Joueur de démonstration défié (ses réponses sont simulées), ou `null` pour le bot. */
  opponentId: string | null;
  challengeId: string | null;
}) {
  const opponentPlayer = opponentId ? getPlayer(opponentId) : undefined;
  const opponentName = opponentPlayer?.name ?? BOT_NAME;
  const opponentColor = opponentPlayer?.color ?? Colors.opponent;
  const opponentRating = opponentPlayer ? demoRating(opponentPlayer.id, themeId) : INITIAL_RATING;
  const { completeChallenge } = useSocial();
  const theme = getTheme(themeId)!;
  const category = getCategory(theme.categoryId)!;
  const { playerName, recordDuel } = useProgress();
  const stats = useThemeStats(themeId);
  const duel = useDuel(themeId);
  const saved = useRef(false);

  useEffect(() => {
    if (duel.phase !== 'finished' || saved.current) return;
    saved.current = true;
    const outcome = duelOutcome(duel.playerTotals, duel.opponentTotals);
    if (challengeId) completeChallenge(challengeId);
    recordDuel({
      id: `duel-${Date.now()}`,
      playedAt: Date.now(),
      themeId,
      opponentId: opponentPlayer?.id ?? null,
      opponentName,
      questions: duel.questions,
      player: duel.player,
      opponent: duel.opponent,
      outcome,
      xpBefore: stats.xp,
      xpGained: duelXp(outcome, duel.playerTotals.correct, duel.questions.length),
      ratingBefore: stats.rating,
      ratingDelta: ratingDelta(stats.rating, opponentRating, outcome),
    });
    router.replace('/results');
  });

  if (duel.phase === 'intro') {
    return (
      <Screen scroll={false} style={styles.intro}>
        <Animated.View entering={FadeInDown.springify()} style={styles.introPlayer}>
          <Avatar name={playerName} color={Colors.player} size={96} />
          <AppText variant="heading">{playerName}</AppText>
        </Animated.View>
        <Animated.View entering={ZoomIn.delay(300).springify()}>
          <AppText variant="display" color={Colors.gold}>
            VS
          </AppText>
        </Animated.View>
        <Animated.View entering={FadeInUp.delay(150).springify()} style={styles.introPlayer}>
          <Avatar name={opponentName} color={opponentColor} size={96} />
          <AppText variant="heading">{opponentName}</AppText>
          {opponentPlayer && (
            <AppText variant="caption" muted>
              Adversaire de démo · réponses simulées
            </AppText>
          )}
        </Animated.View>
        <Animated.View entering={FadeIn.delay(600)} style={{ alignItems: 'center', gap: 4 }}>
          <AppText variant="caption" color={category.color}>
            {category.icon} {category.name.toUpperCase()}
          </AppText>
          <AppText variant="title">{theme.name}</AppText>
        </Animated.View>
      </Screen>
    );
  }

  const q = duel.question;
  const reveal = duel.phase === 'reveal' || duel.phase === 'finished';
  const lastPlayer = reveal ? duel.player[duel.index] : undefined;

  return (
    <Screen scroll={false}>
      <View style={styles.scoreboard}>
        <PlayerScore name={playerName} color={Colors.player} total={duel.playerTotals.points} answers={duel.player} />
        <View style={styles.round}>
          <AppText variant="caption" muted>
            QUESTION
          </AppText>
          <AppText variant="heading">
            {duel.index + 1}/{duel.questions.length}
          </AppText>
        </View>
        <PlayerScore
          name={opponentName}
          color={Colors.opponent}
          total={duel.opponentTotals.points}
          answers={duel.opponent}
          alignRight
          status={duel.phase === 'answering' && duel.opponentAnswered ? 'A répondu' : undefined}
        />
      </View>

      <Animated.View key={`q-${duel.index}`} entering={FadeInDown.springify()} style={styles.questionCard}>
        {questionImageSource(q.image) !== null && (
          <Image
            source={questionImageSource(q.image)!}
            contentFit="contain"
            accessibilityLabel="Illustration de la question"
            style={styles.questionImage}
          />
        )}
        <AppText variant="heading" style={styles.questionText}>
          {q.text}
        </AppText>
      </Animated.View>

      <Countdown
        running={duel.phase === 'answering' && !duel.playerAnswer}
        startedAt={duel.answeringStartedAt}
        durationMs={RULES.answerTimeMs}
        key={`t-${duel.index}`}
      />

      <View style={styles.choices}>
        {duel.phase === 'reading' ? (
          <AppText muted style={{ textAlign: 'center', marginTop: Spacing.lg }}>
            Prépare-toi…
          </AppText>
        ) : (
          q.choices.map((choice, i) => (
            <Choice
              key={`${duel.index}-${i}`}
              index={i}
              label={choice}
              disabled={duel.phase !== 'answering' || !!duel.playerAnswer}
              selected={duel.playerAnswer?.choice === i}
              opponentPicked={reveal && duel.opponentAnswer?.choice === i}
              state={!reveal ? 'idle' : i === q.correctIndex ? 'correct' : duel.playerAnswer?.choice === i ? 'wrong' : 'dim'}
              onPress={() => duel.answer(i)}
            />
          ))
        )}
      </View>

      <View style={styles.footer}>
        {duel.phase === 'answering' && duel.playerAnswer && (
          <AppText muted>En attente de l'adversaire…</AppText>
        )}
        {reveal && lastPlayer && (
          <Animated.View entering={ZoomIn.springify()}>
            <AppText variant="score" color={lastPlayer.correct ? Colors.correct : Colors.wrong}>
              {lastPlayer.correct ? `+${lastPlayer.points}` : lastPlayer.choice === null ? 'Temps écoulé' : 'Raté'}
            </AppText>
          </Animated.View>
        )}
      </View>
    </Screen>
  );
}

function PlayerScore({
  name,
  color,
  total,
  answers,
  alignRight,
  status,
}: {
  name: string;
  color: string;
  total: number;
  answers: ScoredAnswer[];
  alignRight?: boolean;
  status?: string;
}) {
  return (
    <View style={[styles.player, alignRight && { alignItems: 'flex-end' }]}>
      <AppText variant="caption" color={color} numberOfLines={1}>
        {name}
      </AppText>
      <AppText variant="score" color={color}>
        {total}
      </AppText>
      <View style={styles.dots}>
        {Array.from({ length: RULES.questionsPerDuel }, (_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              answers[i] && { backgroundColor: answers[i].correct ? Colors.correct : Colors.wrong },
            ]}
          />
        ))}
      </View>
      <AppText variant="caption" muted style={{ minHeight: 18 }}>
        {status ?? ''}
      </AppText>
    </View>
  );
}

function Choice({
  index,
  label,
  disabled,
  selected,
  opponentPicked,
  state,
  onPress,
}: {
  index: number;
  label: string;
  disabled: boolean;
  selected: boolean;
  opponentPicked: boolean;
  state: 'idle' | 'correct' | 'wrong' | 'dim';
  onPress: () => void;
}) {
  const background =
    state === 'correct'
      ? Colors.correct
      : state === 'wrong'
        ? Colors.wrong
        : selected
          ? Colors.surfaceRaised
          : Colors.surface;
  const textColor = state === 'correct' || state === 'wrong' ? Colors.background : Colors.text;

  return (
    <Animated.View entering={FadeInDown.delay(index * 60).springify()}>
      <Pressable
        accessibilityRole="button"
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [
          styles.choice,
          { backgroundColor: background, borderColor: selected ? Colors.player : Colors.border },
          state === 'dim' && { opacity: 0.45 },
          pressed && { transform: [{ scale: 0.98 }] },
        ]}>
        {selected && <View style={[styles.marker, { backgroundColor: Colors.player, left: 10 }]} />}
        <AppText variant="label" color={textColor} style={{ textAlign: 'center' }}>
          {label}
        </AppText>
        {opponentPicked && <View style={[styles.marker, { backgroundColor: Colors.opponent, right: 10 }]} />}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  intro: { justifyContent: 'center', alignItems: 'center', gap: Spacing.lg },
  introPlayer: { alignItems: 'center', gap: Spacing.sm },
  scoreboard: { flexDirection: 'row', alignItems: 'flex-start' },
  player: { flex: 1, gap: 2 },
  round: { alignItems: 'center', paddingTop: 4, paddingHorizontal: Spacing.sm },
  dots: { flexDirection: 'row', gap: 4, marginTop: 4 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.surfaceRaised },
  questionCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    minHeight: 150,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  questionText: { textAlign: 'center', lineHeight: 28 },
  questionImage: { width: '100%', height: 130, borderRadius: Radius.sm, marginBottom: Spacing.sm },
  choices: { gap: Spacing.sm, minHeight: 4 * 62 + 3 * Spacing.sm },
  choice: {
    minHeight: 62,
    borderRadius: Radius.md,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  marker: { position: 'absolute', width: 12, height: 12, borderRadius: 6, top: 25 },
  footer: { alignItems: 'center', minHeight: 48, justifyContent: 'center' },
});
