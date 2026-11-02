import { View } from 'react-native';

import type { UserSummary } from '@qu1z/shared';

import { BackButton } from '@/components/back-button';
import { UserRow } from '@/components/player-row';
import { SectionHeader } from '@/components/social';
import { AppText, Button, Card, Screen } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { api, useApi } from '@/net/api';

/** Notifications : pour l'instant les demandes d'abonnement (le centre complet arrive au module suivant). */
export default function NotificationsScreen() {
  const requests = useApi<{ requests: { user: UserSummary; createdAt: number }[] }>('/api/me/follow-requests');
  const pending = requests.data?.requests ?? [];
  return (
    <Screen>
      <BackButton />
      <AppText variant="title">Notifications</AppText>
      <SectionHeader title="Demandes d’abonnement" />
      {requests.data && pending.length === 0 && <AppText muted>Aucune demande en attente.</AppText>}
      {pending.map(({ user }) => (
        <UserRow
          key={user.id}
          user={user}
          subtitle="veut s’abonner à toi"
          right={
            <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
              <Button label="Refuser" variant="outline" color={Colors.textMuted} onPress={() => api('POST', `/api/me/follow-requests/${user.id}/decline`).catch(() => {})} />
              <Button label="Accepter" color={Colors.correct} onPress={() => api('POST', `/api/me/follow-requests/${user.id}/accept`).catch(() => {})} />
            </View>
          }
        />
      ))}
      <Card>
        <AppText variant="caption" muted>
          Le centre de notifications complet (likes, commentaires, mentions, défis, progression, annonces) arrive avec le module suivant.
        </AppText>
      </Card>
    </Screen>
  );
}
