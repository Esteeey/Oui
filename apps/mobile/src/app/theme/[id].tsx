import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { getCategory, getTheme, levelFromXp, questionsOf, titleForLevel, type PostView, type ThemeInfo } from '@qu1z/shared';

import { BackButton } from '@/components/back-button';
import { Composer } from '@/components/composer';
import { PostCard } from '@/components/post-card';
import { ThemeCover } from '@/components/theme-cover';
import { OutcomeBar } from '@/components/profile-view';
import { DivisionBadge, SectionHeader } from '@/components/social';
import { AppText, Button, Card, ProgressBar, Screen, Stat } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { useThemeStats } from '@/state/progress';
import { api, useApi } from '@/net/api';
import { formatCount } from '@/utils/format';

export default function ThemeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = getTheme(id);
  const stats = useThemeStats(id);
  const info = useApi<{ themes: ThemeInfo[] }>('/api/themes');
  const posts = useApi<{ posts: PostView[] }>(theme ? `/api/themes/${theme.id}/posts` : null);
  if (!theme) return <Redirect href="/" />;
  const category = getCategory(theme.categoryId)!;
  const level = levelFromXp(stats.xp);
  const themeInfo = info.data?.themes.find((t) => t.themeId === theme.id);
  const subscribed = themeInfo?.subscribed ?? false;
  const feed = posts.data?.posts ?? [];
  const toggleSubscription = () =>
    api(subscribed ? 'DELETE' : 'PUT', `/api/themes/${theme.id}/subscription`).catch(() => {});

  const precision = stats.answered ? Math.round((stats.correct / stats.answered) * 100) : 0;
  const avgTime = stats.correct ? (stats.totalCorrectResponseMs / stats.correct / 1000).toFixed(1) : '–';

  return (
    <Screen>
      <BackButton />
      <View style={styles.cover}>
        <ThemeCover themeId={theme.id} height={190} fadeTo={Colors.background} />
      </View>
      <View style={styles.hero}>
        <AppText variant="caption" color={category.color}>
          {category.icon} {category.name.toUpperCase()}
        </AppText>
        <AppText variant="title" style={{ textAlign: 'center' }}>
          {theme.name}
        </AppText>
        <AppText muted style={{ textAlign: 'center' }}>
          {theme.description}
        </AppText>
        <Button
          label={subscribed ? 'Abonné ✓' : "S'abonner au thème"}
          variant={subscribed ? 'outline' : 'solid'}
          color={subscribed ? Colors.textMuted : category.color}
          onPress={toggleSubscription}
          style={{ marginTop: Spacing.sm, alignSelf: 'stretch' }}
        />
        <AppText variant="caption" muted>
          {themeInfo ? `${formatCount(themeInfo.subscribers)} abonné${themeInfo.subscribers > 1 ? 's' : ''}` : ''}
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
        label="Duel classé"
        color={category.color}
        onPress={() => router.push({ pathname: '/duel/[themeId]', params: { themeId: theme.id, mode: 'pvp' } })}
      />
      <Button
        label="Duel d'entraînement (bot)"
        variant="outline"
        color={Colors.text}
        onPress={() => router.push({ pathname: '/duel/[themeId]', params: { themeId: theme.id } })}
      />

      <AppText variant="caption" muted style={{ textAlign: 'center' }}>
        {questionsOf(theme.id).length} questions · 7 par duel · 10 s par question
      </AppText>

      <SectionHeader title={`Fil du thème · ${feed.length}`} />
      {subscribed ? (
        <Composer target={{ kind: 'theme', themeId: theme.id }} placeholder={`Écris dans le fil « ${theme.name} »…`} />
      ) : (
        <Card style={{ alignItems: 'center' }}>
          <AppText muted style={{ textAlign: 'center' }}>
            Abonne-toi à ce thème pour publier dans son fil et voir ses publications dans ton accueil.
          </AppText>
        </Card>
      )}
      {feed.map((post) => (
        <PostCard key={post.id} post={post} showTheme={false} />
      ))}
      {feed.length === 0 && (
        <AppText muted style={{ textAlign: 'center' }}>
          Personne n'a encore publié ici.
        </AppText>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  cover: { borderRadius: 20, overflow: 'hidden', marginBottom: -Spacing.lg },
  hero: { alignItems: 'center', gap: Spacing.xs, paddingVertical: Spacing.sm },
  levelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stats: { flexDirection: 'row' },
});
