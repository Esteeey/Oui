import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { getCategory, getTheme, levelFromXp, questionsOf, titleForLevel } from '@qu1z/shared';

import { BackButton } from '@/components/back-button';
import { OutcomeBar } from '@/components/profile-view';
import { DivisionBadge } from '@/components/social';
import { AppText, Button, Card, ProgressBar, Screen, Stat } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { useThemeStats } from '@/state/progress';

export default function ThemeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = getTheme(id);
  const stats = useThemeStats(id);
  if (!theme) return <Redirect href="/" />;
  const category = getCategory(theme.categoryId)!;
  const level = levelFromXp(stats.xp);

  const precision = stats.answered ? Math.round((stats.correct / stats.answered) * 100) : 0;
  const avgTime = stats.correct ? (stats.totalCorrectResponseMs / stats.correct / 1000).toFixed(1) : '–';

  return (
    <Screen>
      <BackButton />
      <View style={styles.hero}>
        <AppText style={{ fontSize: 48 }}>{category.icon}</AppText>
        <AppText variant="caption" color={category.color}>
          {category.name.toUpperCase()}
        </AppText>
        <AppText variant="title" style={{ textAlign: 'center' }}>
          {theme.name}
        </AppText>
        <AppText muted style={{ textAlign: 'center' }}>
          {theme.description}
        </AppText>
      </View>

      <Card>
        <View style={styles.levelRow}>
          <AppText variant="heading">Niveau {level.level}</AppText>
          <AppText variant="label" color={category.color}>
            {titleForLevel(level.level)}
          </AppText>
        </View>
        <ProgressBar progress={level.progress} color={category.color} />
        <AppText variant="caption" muted>
          {level.current} / {level.needed} XP avant le niveau {level.level + 1}
        </AppText>
        <DivisionBadge rating={stats.rating} />
      </Card>

      <Card style={styles.stats}>
        <Stat label="Duels" value={String(stats.duels)} />
        <Stat label="Victoires" value={String(stats.wins)} />
        <Stat label="Précision" value={`${precision} %`} />
        <Stat label="Temps moyen" value={avgTime === '–' ? avgTime : `${avgTime} s`} />
      </Card>

      <Card>
        <OutcomeBar wins={stats.wins} draws={stats.draws} losses={stats.duels - stats.wins - stats.draws} />
      </Card>

      <Button
        label="Duel d'entraînement"
        color={category.color}
        onPress={() => router.push({ pathname: '/duel/[themeId]', params: { themeId: theme.id } })}
      />
      <Button label="Duel classé · bientôt en ligne" variant="outline" color={Colors.textMuted} disabled />

      <AppText variant="caption" muted style={{ textAlign: 'center' }}>
        {questionsOf(theme.id).length} questions · 7 par duel · 10 s par question
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: Spacing.xs, paddingVertical: Spacing.sm },
  levelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stats: { flexDirection: 'row' },
});
