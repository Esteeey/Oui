import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { attachmentLabel, type ConversationSummary, type GroupInvitationView, type MessageRequestView } from '@qu1z/shared';

import { SectionHeader } from '@/components/social';
import { GroupAvatar } from '@/components/group';
import { HeaderButton } from '@/components/header';
import { AppText, Avatar, Button, Card, Screen } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { api, errorMessage, useApi } from '@/net/api';
import { useGameServer } from '@/state/game-server';
import { avatarColor } from '@/utils/avatar';
import { timeAgo } from '@/utils/time';

/** Messagerie : demandes reçues, puis conversations (épinglées d'abord). Séparée des notifications. */
export default function InboxScreen() {
  const { playerId } = useGameServer();
  const inbox = useApi<{ conversations: ConversationSummary[] }>('/api/messages');
  const requests = useApi<{ requests: MessageRequestView[] }>('/api/messages/requests');
  const groupInvites = useApi<{ invitations: GroupInvitationView[] }>('/api/groups/invitations');
  const invites = groupInvites.data?.invitations ?? [];
  const [menu, setMenu] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const incoming = (requests.data?.requests ?? []).filter((r) => r.incoming);
  const outgoing = (requests.data?.requests ?? []).filter((r) => !r.incoming);
  const conversations = inbox.data?.conversations ?? [];

  const act = (method: string, path: string, then?: (r: { conversationId?: string }) => void) => {
    setError(null);
    api<{ conversationId?: string }>(method, path)
      .then((r) => then?.(r))
      .catch((e) => setError(errorMessage(e)));
  };

  return (
    <Screen
      back
      title="Messages"
      headerRight={
        <>
          <HeaderButton icon="people-outline" label="Nouveau groupe" onPress={() => router.push('/messages/new-group')} />
          <HeaderButton icon="create-outline" label="Nouveau message" onPress={() => router.push('/messages/new')} />
        </>
      }>
      {error && <AppText color={Colors.wrong}>{error}</AppText>}

      {incoming.length > 0 && (
        <>
          <SectionHeader title={`Demandes de message · ${incoming.length}`} />
          {incoming.map((r) => (
            <Card key={r.id}>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/player/[id]', params: { id: r.from.id } })}
                style={styles.requestHead}>
                <Avatar name={r.from.pseudo} color={avatarColor(r.from.id)} uri={r.from.avatar} size={40} />
                <View style={{ flex: 1 }}>
                  <AppText variant="label">{r.from.pseudo}</AppText>
                  <AppText variant="caption" muted>
                    {timeAgo(r.createdAt)}
                  </AppText>
                </View>
              </Pressable>
              {r.firstMessage && <AppText>« {r.firstMessage} »</AppText>}
              <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                <Button label="Refuser" variant="outline" color={Colors.textMuted} onPress={() => act('POST', `/api/messages/requests/${r.id}/decline`)} style={{ flex: 1 }} />
                <Button
                  label="Accepter"
                  color={Colors.correct}
                  onPress={() =>
                    act('POST', `/api/messages/requests/${r.id}/accept`, (res) =>
                      res.conversationId && router.push({ pathname: '/messages/[id]', params: { id: res.conversationId } }),
                    )
                  }
                  style={{ flex: 1 }}
                />
              </View>
            </Card>
          ))}
        </>
      )}

      {invites.length > 0 && (
        <>
          <SectionHeader title={`Invitations de groupe · ${invites.length}`} />
          {invites.map((inv) => (
            <Card key={inv.id}>
              <View style={styles.requestHead}>
                <Avatar name={inv.group.name} color={avatarColor(inv.group.id)} uri={inv.group.avatar} size={40} />
                <View style={{ flex: 1 }}>
                  <AppText variant="label">{inv.group.name}</AppText>
                  <AppText variant="caption" muted>
                    Invité par {inv.inviter.pseudo} · {inv.group.memberCount} membre{inv.group.memberCount > 1 ? 's' : ''} · {timeAgo(inv.createdAt)}
                  </AppText>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                <Button label="Refuser" variant="outline" color={Colors.textMuted} onPress={() => act('POST', `/api/groups/invitations/${inv.id}/decline`)} style={{ flex: 1 }} />
                <Button
                  label="Rejoindre"
                  color={Colors.correct}
                  onPress={() =>
                    act('POST', `/api/groups/invitations/${inv.id}/accept`, (res) =>
                      res.conversationId && router.push({ pathname: '/messages/[id]', params: { id: res.conversationId } }),
                    )
                  }
                  style={{ flex: 1 }}
                />
              </View>
            </Card>
          ))}
        </>
      )}

      <SectionHeader title="Conversations" />
      {inbox.data && conversations.length === 0 && <AppText muted>Aucune conversation. Écris à un joueur depuis son profil.</AppText>}
      <View style={styles.list}>
        {conversations.map((c) => {
          const last = c.lastMessage;
          const preview = !last
            ? 'Conversation ouverte'
            : last.kind === 'system'
              ? (last.text ?? '')
              : `${last.senderId === playerId ? 'Toi : ' : ''}${last.kind === 'text' ? (last.text ?? '') : `${attachmentLabel(last.kind)}${last.text ? ` · ${last.text}` : ''}`}`;
          return (
            <View key={c.id}>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/messages/[id]', params: { id: c.id } })}
                onLongPress={() => setMenu(menu === c.id ? null : c.id)}
                style={styles.row}>
                <View>
                  {c.group ? (
                    <GroupAvatar id={c.id} name={c.group.name} uri={c.group.avatar} size={48} />
                  ) : (
                    <Avatar uri={c.other?.avatar} name={c.other?.pseudo ?? '?'} color={c.other ? avatarColor(c.other.id) : Colors.border} size={48} />
                  )}
                  {c.presence?.online && <View accessibilityLabel="En ligne" style={styles.online} />}
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={styles.rowTop}>
                    <AppText variant="label" numberOfLines={1} style={{ flex: 1 }}>
                      {c.pinned ? '📌 ' : ''}
                      {c.group?.name ?? c.other?.pseudo ?? 'Conversation'}
                    </AppText>
                    {last && (
                      <AppText variant="caption" muted>
                        {timeAgo(last.createdAt)}
                      </AppText>
                    )}
                  </View>
                  <View style={styles.rowTop}>
                    <AppText muted numberOfLines={1} style={[{ flex: 1 }, c.unread > 0 && { color: Colors.text, fontWeight: '700' }]}>
                      {preview}
                    </AppText>
                    {c.unread > 0 && (
                      <View accessibilityLabel={`${c.unread} non lus`} style={styles.badge}>
                        <AppText variant="caption" color={Colors.onAccent}>
                          {c.unread}
                        </AppText>
                      </View>
                    )}
                  </View>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel="Options" hitSlop={10} onPress={() => setMenu(menu === c.id ? null : c.id)}>
                  <Ionicons name="ellipsis-vertical" size={18} color={Colors.textMuted} />
                </Pressable>
              </Pressable>
              {menu === c.id && (
                <View style={styles.menu}>
                  <Button
                    label={c.pinned ? 'Désépingler' : 'Épingler'}
                    variant="outline"
                    color={Colors.text}
                    onPress={() => {
                      setMenu(null);
                      act(c.pinned ? 'DELETE' : 'PUT', `/api/messages/${c.id}/pin`);
                    }}
                    style={{ flex: 1 }}
                  />
                  {c.kind === 'direct' ? (
                    <Button
                      label="Supprimer"
                      variant="outline"
                      color={Colors.wrong}
                      onPress={() => {
                        setMenu(null);
                        act('DELETE', `/api/messages/${c.id}`);
                      }}
                      style={{ flex: 1 }}
                    />
                  ) : (
                    <Button
                      label="Infos du groupe"
                      variant="outline"
                      color={Colors.text}
                      onPress={() => {
                        setMenu(null);
                        router.push({ pathname: '/messages/group/[id]', params: { id: c.id } });
                      }}
                      style={{ flex: 1 }}
                    />
                  )}
                </View>
              )}
            </View>
          );
        })}
      </View>
      {menu && (
        <AppText variant="caption" muted>
          « Supprimer » retire la conversation de ta boîte seulement : l’autre personne la garde.
        </AppText>
      )}

      {outgoing.length > 0 && (
        <>
          <SectionHeader title="Demandes envoyées" />
          {outgoing.map((r) => (
            <AppText key={r.id} muted>
              En attente de {r.to.pseudo} · {timeAgo(r.createdAt)}
            </AppText>
          ))}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  requestHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm + 4 },
  list: { borderRadius: Radius.md, overflow: 'hidden', backgroundColor: Colors.surface },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm + 4, padding: Spacing.sm + 4, borderBottomWidth: 1, borderBottomColor: Colors.border },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  online: { position: 'absolute', right: 0, bottom: 0, width: 14, height: 14, borderRadius: 7, backgroundColor: Colors.correct, borderWidth: 2, borderColor: Colors.surface },
  badge: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  menu: { flexDirection: 'row', gap: Spacing.sm, padding: Spacing.sm, backgroundColor: Colors.surfaceRaised },
});
