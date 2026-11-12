import { Platform, Switch, View } from 'react-native';
import { useState } from 'react';

import Ionicons from '@expo/vector-icons/Ionicons';

import { NOTIFICATION_CATEGORIES, type MessagesFrom, type NotificationCategory, type NotificationPrefs } from '@qu1z/shared';

import { Tap } from '@/components/tap';

import { SectionHeader } from '@/components/social';
import { AppText, Button, Card, LoadingState, Screen } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { api, useApi } from '@/net/api';
import { enableWebPush, webPushAvailable } from '@/net/web-push';
import { useGameServer } from '@/state/game-server';

/** Réglages des notifications : push par catégorie, connexions des personnes suivies, aperçus. */
export default function NotificationSettingsScreen() {
  const prefs = useApi<NotificationPrefs>('/api/me/notification-preferences');
  const p = prefs.data;
  const { refreshInvitePrefs } = useGameServer();
  const [webPushMessage, setWebPushMessage] = useState('');
  const [messagesFrom, setMessagesFrom] = useState<MessagesFrom | null>(null);
  const save = (patch: Partial<NotificationPrefs> | { push: Partial<Record<NotificationCategory, boolean>> }) =>
    api('PATCH', '/api/me/notification-preferences', patch).then(() => refreshInvitePrefs()).catch(() => {});

  return (
    <Screen title="Notifications" back>
      <LoadingState visible={prefs.loading && !prefs.data} />
      <SectionHeader title="Notifications push" />
      <AppText variant="caption" muted>
        Désactiver une catégorie n’efface rien : tout reste dans le centre de notifications.
      </AppText>
      <Card style={{ gap: Spacing.md }}>
        {NOTIFICATION_CATEGORIES.filter((c) => c.id !== 'friends_online').map((c) => (
          <Row key={c.id} label={c.label} value={p?.push[c.id] ?? true} onChange={(v) => save({ push: { [c.id]: v } })} />
        ))}
      </Card>

      {Platform.OS === 'web' && webPushAvailable() && <>
        <SectionHeader title="Notifications sur ce navigateur" />
        <Card style={{ gap: Spacing.sm }}>
          <AppText variant="caption" muted>Reçois une notification si tu n’as pas QuizX ouvert au premier plan.</AppText>
          <Button label="Activer les notifications Web Push" onPress={() => {
            setWebPushMessage('');
            void enableWebPush().then(() => setWebPushMessage('Notifications activées sur ce navigateur.')).catch((e: unknown) => setWebPushMessage(e instanceof Error ? e.message : 'Activation impossible.'));
          }} />
          {!!webPushMessage && <AppText variant="caption" muted>{webPushMessage}</AppText>}
        </Card>
      </>}

      <SectionHeader title="Défis en direct" />
      <Card style={{ gap: Spacing.md }}>
        <Row label="Notifications de défis" hint="Être averti des invitations de duel reçues." value={p?.duelInvites ?? true} onChange={(v) => save({ duelInvites: v })} />
        <Row label="Son d’invitation" value={p?.duelInviteSound ?? true} onChange={(v) => save({ duelInviteSound: v })} />
        <Row label="Vibration d’invitation" value={p?.duelInviteVibration ?? true} onChange={(v) => save({ duelInviteVibration: v })} />
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

      <SectionHeader title="Qui peut m’écrire" />
      <AppText variant="caption" muted>
        Tout le monde peut t’envoyer un message. Ce réglage décide seulement de ce que tu reçois, sans que l’expéditeur le sache.
      </AppText>
      <Card style={{ gap: Spacing.sm }}>
        {MESSAGES_FROM_CHOICES.map((c) => {
          const selected = (messagesFrom ?? p?.messagesFrom ?? 'requests') === c.id;
          return (
            <Tap
              key={c.id}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => {
                setMessagesFrom(c.id);
                void save({ messagesFrom: c.id });
              }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: 4 }}>
              <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={22} color={selected ? Colors.accent : Colors.textMuted} />
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="label">{c.label}</AppText>
                <AppText variant="caption" muted>
                  {c.hint}
                </AppText>
              </View>
            </Tap>
          );
        })}
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

const MESSAGES_FROM_CHOICES: { id: MessagesFrom; label: string; hint: string }[] = [
  { id: 'everyone', label: 'Tout le monde', hint: 'Les messages arrivent directement dans ta boîte.' },
  { id: 'requests', label: 'Demandes pour les inconnus', hint: 'Directement si tu suis la personne, sinon dans « Demandes » : tu acceptes ou tu ignores.' },
  { id: 'following', label: 'Seulement les personnes que je suis', hint: 'Les messages des autres ne te parviennent pas.' },
];

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
