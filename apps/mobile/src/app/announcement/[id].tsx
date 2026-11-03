import { useLocalSearchParams } from 'expo-router';

import { AppText, Card, Screen } from '@/components/ui';
import { Colors } from '@/constants/theme';
import { useApi } from '@/net/api';

const KIND: Record<string, string> = {
  maintenance: 'Maintenance',
  update: 'Mise à jour',
  event: 'Événement',
  feature: 'Nouveauté',
  info: 'Information',
};

/** Annonce officielle de l'équipe. */
export default function AnnouncementScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const a = useApi<{ title: string; body: string; kind: string; createdAt: number }>(`/api/announcements/${id}`);
  return (
    <Screen back title="Annonce">
      {a.error && <AppText muted>Annonce introuvable.</AppText>}
      {a.data && (
        <Card>
          <AppText variant="caption" color={Colors.accent}>
            {(KIND[a.data.kind] ?? 'Information').toUpperCase()} · {new Date(a.data.createdAt).toLocaleDateString('fr-FR')}
          </AppText>
          <AppText variant="title">{a.data.title}</AppText>
          <AppText style={{ lineHeight: 23 }}>{a.data.body}</AppText>
        </Card>
      )}
    </Screen>
  );
}
