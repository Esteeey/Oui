import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { getTheme, type ActivityView } from '@qu1z/shared';

import { FeedCardHeader, ResultBanner, feedCard } from '@/components/feed-parts';
import { Tap } from '@/components/tap';
import { AppText } from '@/components/ui';
import { Colors, Fonts } from '@/constants/theme';
import { api } from '@/net/api';

function describe(event: ActivityView['event']): { text: string; value: string; pill: string } {
  switch (event.kind) {
    case 'win':
      return { text: `A battu ${event.opponent} !`, value: `${event.score} – ${event.opponentScore}`, pill: 'Victoire' };
    case 'loss':
      return { text: `A perdu contre ${event.opponent}.`, value: `${event.score} – ${event.opponentScore}`, pill: 'Défaite' };
    case 'level':
      return { text: `A atteint le niveau ${event.level} !`, value: `Niv. ${event.level}`, pill: 'Niveau atteint' };
    case 'perfect':
      return { text: 'A fait un sans-faute !', value: '100 %', pill: 'Sans-faute' };
  }
}

/**
 * Activité de jeu (réelle). Les niveaux et sans-faute viennent de moi et des joueurs suivis ; mes victoires
 * et défaites ne sont visibles que de moi, et une victoire peut être épinglée sur mon profil.
 */
export function ActivityCard({ activity }: { activity: ActivityView }) {
  const theme = getTheme(activity.themeId);
  const event = activity.event;
  const { text, value, pill } = describe(event);
  const [pinning, setPinning] = useState(false);
  const openTheme = () => theme && router.push({ pathname: '/theme/[id]', params: { id: theme.id } });
  const isPrivate = event.kind === 'win' || event.kind === 'loss';
  const pin = () => {
    if (event.kind !== 'win' || pinning) return;
    setPinning(true);
    // Le fil se recharge après l'envoi : la victoire y revient sous forme de publication.
    api('PUT', `/api/duels/${event.duelId}/pin`).catch(() => setPinning(false));
  };

  return (
    <View style={styles.card}>
      <FeedCardHeader user={activity.user} createdAt={activity.createdAt} />
      <AppText color={Colors.text} style={styles.text}>
        {text}
      </AppText>
      <ResultBanner themeName={theme?.name ?? 'Duel'} value={value} pill={pill} onPress={openTheme} />
      {isPrivate && (
        <View style={styles.footer}>
          <View style={styles.privacy}>
            <Ionicons name="lock-closed-outline" size={14} color={Colors.textSoft} />
            <AppText style={styles.privacyText}>Visible par toi seul</AppText>
          </View>
          {event.kind === 'win' && (
            <Tap accessibilityRole="button" accessibilityLabel="Épingler cette victoire sur mon profil" disabled={pinning} onPress={pin} style={styles.pin}>
              <Ionicons name="pin-outline" size={15} color={Colors.accent} />
              <AppText style={styles.pinText}>{pinning ? 'Épinglage…' : 'Épingler sur mon profil'}</AppText>
            </Tap>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { ...feedCard, paddingBottom: 10 },
  text: { fontSize: 14, lineHeight: 18, paddingHorizontal: 7 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 7, minHeight: 30 },
  privacy: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  privacyText: { fontSize: 12, lineHeight: 16, color: Colors.textSoft, flexShrink: 1 },
  pin: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 30 },
  pinText: { fontSize: 12.5, lineHeight: 17, fontFamily: Fonts.bold, color: Colors.accent },
});
