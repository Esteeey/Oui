import { Switch, View } from 'react-native';

import { NOTIFICATION_CATEGORIES, type NotificationCategory, type NotificationPrefs } from '@qu1z/shared';

import { SectionHeader } from '@/components/social';
import { AppText, Card, Screen } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { api, useApi } from '@/net/api';

/** Réglages des notifications : push par catégorie, connexions des personnes suivies, aperçus. */
export default function NotificationSettingsScreen() {
  const prefs = useApi<NotificationPrefs>('/api/me/notification-preferences');
  const p = prefs.data;
  const save = (patch: Partial<NotificationPrefs> | { push: Partial<Record<NotificationCategory, boolean>> }) =>
    api('PATCH', '/api/me/notification-preferences', patch).catch(() => {});

  return (
    <Screen title="Notifications" back>

      <SectionHeader title="Notifications push" />
      <AppText variant="caption" muted>
        Désactiver une catégorie n’efface rien : tout reste dans le centre de notifications.
      </AppText>
      <Card style={{ gap: Spacing.md }}>
        {NOTIFICATION_CATEGORIES.filter((c) => c.id !== 'friends_online').map((c) => (
          <Row key={c.id} label={c.label} value={p?.push[c.id] ?? true} onChange={(v) => save({ push: { [c.id]: v } })} />
        ))}
      </Card>

      <SectionHeader title="Connexions" />
      <Card style={{ gap: Spacing.md }}>
        <Row
          label="Connexion des personnes suivies"
          hint="Être prévenu quand une personne que tu suis se connecte (au plus une fois par heure)."
          value={p?.friendsOnline ?? false}
          onChange={(v) => save({ friendsOnline: v, push: { friends_online: v } })}
        />
      </Card>

      <SectionHeader title="Messages" />
      <Card style={{ gap: Spacing.md }}>
        <Row
          label="Notifications push des messages"
          hint="Messages privés, groupes, demandes et invitations. Séparées des notifications communautaires."
          value={p?.messagePush ?? true}
          onChange={(v) => save({ messagePush: v })}
        />
        <Row
          label="Masquer le contenu des aperçus"
          hint="Les notifications push de messages n’afficheront pas le texte."
          value={p?.hideMessagePreviews ?? false}
          onChange={(v) => save({ hideMessagePreviews: v })}
        />
      </Card>
    </Screen>
  );
}

function Row({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="label">{label}</AppText>
        {hint && (
          <AppText variant="caption" muted>
            {hint}
          </AppText>
        )}
      </View>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={label} trackColor={{ true: Colors.accent, false: Colors.border }} />
    </View>
  );
}
