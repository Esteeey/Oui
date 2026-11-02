import { Redirect, router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';

import { getCategory, getTheme, levelFromXp, totals, type DuelOutcome } from '@qu1z/shared';

import { Image } from 'expo-image';

import { questionImageSource } from '@/game/question-images';
import { AppText, Avatar, Button, Card, ProgressBar, Screen } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { DivisionBadge } from '@/components/social';
import { getPlayer } from '@/demo/data';
import { useProgress } from '@/state/progress';

const HEADLINE: Record<DuelOutcome, { text: string; color: string }> = {
  win: { text: 'Victoire !', color: Colors.gold },
  loss: { text: 'Défaite', color: Colors.wrong },
  draw: { text: 'Égalité', color: Colors.opponent },
};

export default function ResultsScreen() {
  const { lastDuel, playerName } = useProgress();
  if (!lastDuel) return <Redirect href="/" />;

  const theme = getTheme(lastDuel.themeId)!;
  const category = getCategory(theme.categoryId)!;
  const me = totals(lastDuel.player);
  const them = totals(lastDuel.opponent);
  const before = levelFromXp(lastDuel.xpBefore);
  const after = levelFromXp(lastDuel.xpBefore + lastDuel.xpGained);
  const headline = HEADLINE[lastDuel.outcome];
  const opponentColor = (lastDuel.opponentId && getPlayer(lastDuel.opponentId)?.color) || Colors.opponent;
  const ratingAfter = lastDuel.ratingBefore + lastDuel.ratingDelta;

  return (
    <Screen>
      <Animated.View entering={ZoomIn.springify()} style={styles.headline}>
        <AppText variant="display" color={headline.color}>
          {headline.text}
        </AppText>
        <AppText variant="caption" color={category.color}>
          {category.icon} {theme.name}
        </AppText>
      </Animated.View>

      <Card style={styles.versus}>
        <Side name={playerName} color={Colors.player} points={me.points} correct={me.correct} />
        <AppText variant="heading" muted>
          –
        </AppText>
        <Side name={lastDuel.opponentName} color={opponentColor} points={them.points} correct={them.correct} />
      </Card>

      <Animated.View entering={FadeInDown.delay(200).springify()}>
        <Card>
          <View style={styles.xpRow}>
            <AppText variant="heading">+{lastDuel.xpGained} XP</AppText>
            <AppText variant="label" color={after.level > before.level ? Colors.gold : Colors.textMuted}>
              {after.level > before.level ? `Niveau ${after.level} atteint !` : `Niveau ${after.level}`}
            </AppText>
          </View>
          <ProgressBar progress={after.progress} color={category.color} />
          <View style={styles.xpRow}>
            <AppText variant="label" color={lastDuel.ratingDelta >= 0 ? Colors.correct : Colors.wrong}>
              {lastDuel.ratingDelta >= 0 ? '▲ +' : '▼ '}
              {lastDuel.ratingDelta} cote
            </AppText>
            <DivisionBadge rating={ratingAfter} />
          </View>
        </Card>
      </Animated.View>

      <AppText variant="heading">Question par question</AppText>
      {lastDuel.questions.map((q, i) => {
        const mine = lastDuel.player[i];
        const theirs = lastDuel.opponent[i];
        return (
          <Animated.View key={q.id} entering={FadeInDown.delay(300 + i * 60).springify()}>
            <Card style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' }}>
                {questionImageSource(q.image) !== null && (
                  <Image source={questionImageSource(q.image)!} contentFit="cover" style={styles.thumb} accessibilityLabel="Illustration" />
                )}
                <AppText variant="caption" muted style={{ flex: 1 }}>
                  {i + 1}. {q.text}
                </AppText>
              </View>
              <AppText variant="label" color={Colors.correct}>
                {q.choices[q.correctIndex]}
              </AppText>
              <View style={styles.answerRow}>
                <AnswerPill color={Colors.player} correct={mine.correct} points={mine.points} ms={mine.responseMs} answered={mine.choice !== null} />
                <AnswerPill color={opponentColor} correct={theirs.correct} points={theirs.points} ms={theirs.responseMs} answered={theirs.choice !== null} />
              </View>
            </Card>
          </Animated.View>
        );
      })}

      <View style={styles.actions}>
        <Button
          label="Revanche"
          onPress={() =>
            router.replace({
              pathname: '/duel/[themeId]',
              params: lastDuel.opponentId ? { themeId: theme.id, opponent: lastDuel.opponentId } : { themeId: theme.id },
            })
          }
        />
        {lastDuel.opponentId && (
          <Button
            label={`Voir le profil de ${lastDuel.opponentName}`}
            variant="outline"
            color={opponentColor}
            onPress={() => router.push({ pathname: '/player/[id]', params: { id: lastDuel.opponentId! } })}
          />
        )}
        <Button label="Retour à l'accueil" variant="outline" color={Colors.text} onPress={() => router.dismissTo('/')} />
      </View>
    </Screen>
  );
}

function Side({ name, color, points, correct }: { name: string; color: string; points: number; correct: number }) {
  return (
    <View style={styles.side}>
      <Avatar name={name} color={color} size={48} />
      <AppText variant="caption" numberOfLines={1}>
        {name}
      </AppText>
      <AppText variant="score" color={color}>
        {points}
      </AppText>
      <AppText variant="caption" muted>
        {correct}/7 bonnes réponses
      </AppText>
    </View>
  );
}

function AnswerPill({
  color,
  correct,
  points,
  ms,
  answered,
}: {
  color: string;
  correct: boolean;
  points: number;
  ms: number;
  answered: boolean;
}) {
  return (
    <View style={[styles.pill, { borderColor: color }]}>
      <AppText variant="caption" color={correct ? Colors.correct : Colors.wrong}>
        {correct ? '✓' : '✗'}
      </AppText>
      <AppText variant="caption">{points} pts</AppText>
      <AppText variant="caption" muted>
        {answered ? `${(ms / 1000).toFixed(1)} s` : '—'}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  headline: { alignItems: 'center', gap: 4, paddingTop: Spacing.lg },
  versus: { flexDirection: 'row', alignItems: 'center' },
  side: { flex: 1, alignItems: 'center', gap: 4 },
  xpRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  answerRow: { flexDirection: 'row', gap: Spacing.sm },
  pill: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  actions: { gap: Spacing.sm, marginTop: Spacing.sm },
  thumb: { width: 54, height: 36, borderRadius: 6 },
});
