import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { getTheme, type ActivityView } from '@qu1z/shared';

import { FeedCardHeader, ResultBanner, feedCard } from '@/components/feed-parts';
import { AppText } from '@/components/ui';
import { Colors } from '@/constants/theme';

function describe(event: ActivityView['event']): { text: string; value: string; pill: string } {
  switch (event.kind) {
    case 'win':
      return { text: `A battu ${event.opponent} !`, value: `${event.score} – ${event.opponentScore}`, pill: 'Victoire' };
    case 'level':
      return { text: `A atteint le niveau ${event.level} !`, value: `Niv. ${event.level}`, pill: 'Niveau atteint' };
    case 'perfect':
      return { text: 'A fait un sans-faute !', value: '100 %', pill: 'Sans-faute' };
  }
}

/** Activité de jeu (réelle) d'un joueur suivi ou du joueur lui-même. */
export function ActivityCard({ activity }: { activity: ActivityView }) {
  const theme = getTheme(activity.themeId);
  const { text, value, pill } = describe(activity.event);
  const openTheme = () => theme && router.push({ pathname: '/theme/[id]', params: { id: theme.id } });

  return (
    <View style={styles.card}>
      <FeedCardHeader user={activity.user} createdAt={activity.createdAt} />
      <AppText color={Colors.text} style={styles.text}>
        {text}
      </AppText>
      <ResultBanner themeName={theme?.name ?? 'Duel'} value={value} pill={pill} onPress={openTheme} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { ...feedCard, paddingBottom: 10 },
  text: { fontSize: 14, lineHeight: 18, paddingHorizontal: 7 },
});
