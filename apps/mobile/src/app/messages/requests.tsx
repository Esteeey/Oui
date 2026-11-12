import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { GroupInvitationView, MessageRequestView } from '@qu1z/shared';

import { M } from '@/components/messages-theme';
import { Tap } from '@/components/tap';
import { AppText, Avatar, LoadingState } from '@/components/ui';
import { MaxContentWidth } from '@/constants/theme';
import { api, errorMessage, useApi } from '@/net/api';
import { avatarColor } from '@/utils/avatar';
import { timeAgo } from '@/utils/time';

/** Demandes de message et invitations de groupe : accepter, ignorer, ou ouvrir le profil pour bloquer. */
export default function RequestsScreen() {
  const insets = useSafeAreaInsets();
  const requests = useApi<{ requests: MessageRequestView[] }>('/api/messages/requests');
  const groupInvites = useApi<{ invitations: GroupInvitationView[] }>('/api/groups/invitations');
  const [error, setError] = useState<string | null>(null);
  const incoming = (requests.data?.requests ?? []).filter((r) => r.incoming);
  const outgoing = (requests.data?.requests ?? []).filter((r) => !r.incoming);
  const invites = groupInvites.data?.invitations ?? [];

  const act = (method: string, path: string, open?: boolean) => {
    setError(null);
    api<{ conversationId?: string }>(method, path)
      .then((r) => {
        requests.refresh();
        groupInvites.refresh();
        if (open && r.conversationId) router.replace({ pathname: '/messages/[id]', params: { id: r.conversationId } });
      })
      .catch((e) => setError(errorMessage(e)));
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Tap accessibilityRole="button" accessibilityLabel="Retour" onPress={() => router.back()} style={styles.back}>
          <Ionicons name="chevron-back" size={26} color={M.text} />
        </Tap>
        <AppText style={styles.title}>Demandes</AppText>
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <AppText style={styles.intro}>Des joueurs que tu ne suis pas t’ont écrit. Ils ne savent pas si tu as lu leur message.</AppText>
        {error && <AppText style={{ color: M.danger }}>{error}</AppText>}
        <LoadingState visible={requests.loading && !requests.data} label="Chargement des demandes" />
        {requests.data && incoming.length === 0 && invites.length === 0 && <AppText style={styles.empty}>Aucune demande en attente.</AppText>}

        {incoming.map((r) => (
          <View key={r.id} style={styles.card}>
            <Tap accessibilityRole="button" onPress={() => router.push({ pathname: '/player/[id]', params: { id: r.from.id } })} style={styles.cardHead}>
              <Avatar name={r.from.pseudo} color={avatarColor(r.from.id)} uri={r.from.avatar} size={48} />
              <AppText style={styles.name}>{r.from.pseudo}</AppText>
              <AppText style={styles.time}>{timeAgo(r.createdAt)}</AppText>
            </Tap>
            {r.firstMessage && <AppText style={styles.bubble}>{r.firstMessage}</AppText>}
            <View style={styles.actions}>
              <Tap accessibilityRole="button" onPress={() => act('POST', `/api/messages/requests/${r.id}/accept`, true)} style={[styles.button, styles.primary]}>
                <AppText style={styles.primaryText}>Accepter</AppText>
              </Tap>
              <Tap accessibilityRole="button" onPress={() => act('POST', `/api/messages/requests/${r.id}/decline`)} style={[styles.button, styles.outline]}>
                <AppText style={styles.outlineText}>Ignorer</AppText>
              </Tap>
              <Tap
                accessibilityRole="button"
                accessibilityLabel="Bloquer ou signaler"
                onPress={() => router.push({ pathname: '/player/[id]', params: { id: r.from.id } })}
                style={[styles.iconButton, styles.outline]}>
                <Ionicons name="ban-outline" size={20} color={M.muted} />
              </Tap>
            </View>
          </View>
        ))}

        {invites.map((inv) => (
          <View key={inv.id} style={styles.card}>
            <View style={styles.cardHead}>
              <Avatar name={inv.group.name} color={avatarColor(inv.group.id)} uri={inv.group.avatar} size={48} />
              <View style={{ flex: 1 }}>
                <AppText style={styles.name}>{inv.group.name}</AppText>
                <AppText style={styles.time}>
                  Invité par {inv.inviter.pseudo} · {inv.group.memberCount} membre{inv.group.memberCount > 1 ? 's' : ''}
                </AppText>
              </View>
            </View>
            <View style={styles.actions}>
              <Tap accessibilityRole="button" onPress={() => act('POST', `/api/groups/invitations/${inv.id}/accept`, true)} style={[styles.button, styles.primary]}>
                <AppText style={styles.primaryText}>Rejoindre</AppText>
              </Tap>
              <Tap accessibilityRole="button" onPress={() => act('POST', `/api/groups/invitations/${inv.id}/decline`)} style={[styles.button, styles.outline]}>
                <AppText style={styles.outlineText}>Refuser</AppText>
              </Tap>
            </View>
          </View>
        ))}

        {outgoing.length > 0 && (
          <View style={{ gap: 6 }}>
            <AppText style={styles.section}>Messages envoyés en attente</AppText>
            {outgoing.map((r) => (
              <AppText key={r.id} style={styles.time}>
                {r.to.pseudo} · {timeAgo(r.createdAt)}
              </AppText>
            ))}
          </View>
        )}

        <Tap accessibilityRole="button" onPress={() => router.push('/settings/notifications')} style={styles.setting}>
          <Ionicons name="options-outline" size={20} color={M.muted} />
          <AppText style={{ flex: 1, color: M.text, fontWeight: '600' }}>Qui peut m’écrire</AppText>
          <Ionicons name="chevron-forward" size={18} color={M.muted} />
        </Tap>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: M.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  back: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, color: M.text, fontSize: 26, lineHeight: 34, fontWeight: '800', paddingVertical: 2 },
  content: { gap: 12, paddingHorizontal: 16, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  intro: { color: M.muted, fontSize: 14, lineHeight: 20 },
  empty: { color: M.muted, textAlign: 'center', paddingVertical: 32 },
  card: { borderRadius: 20, backgroundColor: M.field, padding: 14, gap: 12 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { flex: 1, color: M.text, fontWeight: '700', fontSize: 16 },
  time: { color: M.muted, fontSize: 12 },
  bubble: { color: M.text, fontSize: 15, lineHeight: 21, backgroundColor: M.theirs, borderRadius: 18, borderTopLeftRadius: 6, paddingHorizontal: 14, paddingVertical: 10 },
  actions: { flexDirection: 'row', gap: 8 },
  button: { flex: 1, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  iconButton: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  primary: { backgroundColor: M.accent },
  primaryText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  outline: { borderWidth: 1, borderColor: M.border },
  outlineText: { color: M.text, fontWeight: '600', fontSize: 15 },
  section: { color: M.soft, fontWeight: '700', marginTop: 8 },
  setting: { marginTop: 12, minHeight: 52, borderRadius: 16, backgroundColor: M.field, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
});
