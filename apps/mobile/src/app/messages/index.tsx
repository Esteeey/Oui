import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { attachmentLabel, type ConversationSummary, type GroupInvitationView, type MessageRequestView } from '@qu1z/shared';

import { GroupAvatar } from '@/components/group';
import { M } from '@/components/messages-theme';
import { Tap } from '@/components/tap';
import { AppText, Avatar, LoadingState } from '@/components/ui';
import { MaxContentWidth } from '@/constants/theme';
import { api, errorMessage, useApi } from '@/net/api';
import { useGameServer } from '@/state/game-server';
import { avatarColor } from '@/utils/avatar';
import { timeAgo } from '@/utils/time';

/** Messagerie : amis en ligne, accès aux demandes, puis conversations (épinglées d'abord). */
export default function InboxScreen() {
  const insets = useSafeAreaInsets();
  const { playerId } = useGameServer();
  const inbox = useApi<{ conversations: ConversationSummary[] }>('/api/messages');
  const requests = useApi<{ requests: MessageRequestView[] }>('/api/messages/requests');
  const groupInvites = useApi<{ invitations: GroupInvitationView[] }>('/api/groups/invitations');
  const [menu, setMenu] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const waiting = (requests.data?.requests ?? []).filter((r) => r.incoming).length + (groupInvites.data?.invitations.length ?? 0);
  const all = inbox.data?.conversations ?? [];
  const q = query.trim().toLowerCase();
  const conversations = q ? all.filter((c) => (c.group?.name ?? c.other?.pseudo ?? '').toLowerCase().includes(q)) : all;
  const online = all.filter((c) => c.other && c.presence?.online);

  const act = (method: string, path: string) => {
    setError(null);
    api(method, path)
      .then(() => inbox.refresh())
      .catch((e) => setError(errorMessage(e)));
  };
  const refresh = () => {
    inbox.refresh();
    requests.refresh();
    groupInvites.refresh();
  };
  const open = (id: string) => router.push({ pathname: '/messages/[id]', params: { id } });

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Tap accessibilityRole="button" accessibilityLabel="Retour" onPress={() => router.back()} style={styles.back}>
          <Ionicons name="chevron-back" size={26} color={M.text} />
        </Tap>
        <AppText style={styles.title}>Messages</AppText>
        <Tap accessibilityRole="button" accessibilityLabel="Nouveau groupe" onPress={() => router.push('/messages/new-group')} style={[styles.round, { backgroundColor: M.raised }]}>
          <Ionicons name="people-outline" size={22} color={M.text} />
        </Tap>
        <Tap accessibilityRole="button" accessibilityLabel="Nouveau message" onPress={() => router.push('/messages/new')} style={[styles.round, { backgroundColor: M.accent }]}>
          <Ionicons name="add" size={26} color="#FFFFFF" />
        </Tap>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} tintColor={M.muted} />}
        keyboardShouldPersistTaps="handled">
        <View style={styles.search}>
          <Ionicons name="search" size={18} color={M.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Chercher un joueur ou un groupe"
            placeholderTextColor={M.muted}
            accessibilityLabel="Chercher une conversation"
            style={styles.searchInput}
          />
        </View>

        {online.length > 0 && !q && (
          <View style={{ gap: 8 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.onlineRow}>
              {online.map((c) => (
                <Tap key={c.id} accessibilityRole="button" accessibilityLabel={`${c.other!.pseudo}, en ligne`} onPress={() => open(c.id)} style={styles.onlineItem}>
                  <View style={styles.onlineRing}>
                    <Avatar uri={c.other!.avatar} name={c.other!.pseudo} color={avatarColor(c.other!.id)} size={52} />
                  </View>
                  <AppText numberOfLines={1} style={styles.onlineName}>
                    {c.other!.pseudo}
                  </AppText>
                </Tap>
              ))}
            </ScrollView>
            <AppText style={styles.caption}>En ligne maintenant · abonnés réciproques</AppText>
          </View>
        )}

        <Tap accessibilityRole="button" onPress={() => router.push('/messages/requests')} style={styles.requests}>
          <Ionicons name="chatbox-ellipses-outline" size={22} color={M.gold} />
          <AppText style={styles.requestsLabel}>Demandes</AppText>
          {waiting > 0 && (
            <View style={[styles.badge, { backgroundColor: M.gold }]}>
              <AppText style={[styles.badgeText, { color: M.bg }]}>{waiting}</AppText>
            </View>
          )}
          <Ionicons name="chevron-forward" size={18} color={M.muted} />
        </Tap>

        {error && <AppText style={{ color: M.danger, marginHorizontal: 16 }}>{error}</AppText>}
        <LoadingState visible={inbox.loading && !inbox.data} label="Chargement des conversations" />
        {inbox.data && conversations.length === 0 && (
          <AppText style={[styles.caption, { textAlign: 'center', paddingVertical: 24 }]}>
            {q ? 'Aucune conversation trouvée.' : 'Aucune conversation. Écris à un joueur que tu suis, ou après un duel.'}
          </AppText>
        )}

        <View>
          {conversations.map((c) => {
            const last = c.lastMessage;
            const preview = !last
              ? 'Conversation ouverte'
              : last.kind === 'system'
                ? (last.text ?? '')
                : `${last.senderId === playerId ? 'Toi : ' : ''}${last.kind === 'text' ? (last.text ?? '') : `${attachmentLabel(last.kind)}${last.text ? ` · ${last.text}` : ''}`}`;
            const unread = c.unread > 0;
            return (
              <View key={c.id}>
                <Tap
                  accessibilityRole="button"
                  onPress={() => open(c.id)}
                  onLongPress={() => setMenu(menu === c.id ? null : c.id)}
                  style={[styles.row, unread && { backgroundColor: M.bar }]}>
                  <View>
                    {c.group ? (
                      <GroupAvatar id={c.id} name={c.group.name} uri={c.group.avatar} size={52} />
                    ) : (
                      <Avatar uri={c.other?.avatar} name={c.other?.pseudo ?? '?'} color={c.other ? avatarColor(c.other.id) : M.border} size={52} />
                    )}
                    {c.presence?.online && <View accessibilityLabel="En ligne" style={styles.dot} />}
                  </View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <View style={styles.rowTop}>
                      <AppText numberOfLines={1} style={styles.name}>
                        {c.pinned ? '📌 ' : ''}
                        {c.group?.name ?? c.other?.pseudo ?? 'Conversation'}
                      </AppText>
                      {last && <AppText style={[styles.time, unread && { color: M.accentText, fontWeight: '700' }]}>{timeAgo(last.createdAt)}</AppText>}
                    </View>
                    <View style={styles.rowTop}>
                      <AppText numberOfLines={1} style={[styles.preview, unread && { color: M.text, fontWeight: '600' }]}>
                        {preview}
                      </AppText>
                      {unread && (
                        <View accessibilityLabel={`${c.unread} non lus`} style={styles.badge}>
                          <AppText style={styles.badgeText}>{c.unread}</AppText>
                        </View>
                      )}
                    </View>
                  </View>
                </Tap>
                {menu === c.id && (
                  <View style={styles.menu}>
                    <MenuButton
                      icon="pin-outline"
                      label={c.pinned ? 'Désépingler' : 'Épingler'}
                      onPress={() => {
                        setMenu(null);
                        act(c.pinned ? 'DELETE' : 'PUT', `/api/messages/${c.id}/pin`);
                      }}
                    />
                    {c.kind === 'direct' ? (
                      <MenuButton
                        icon="trash-outline"
                        label="Supprimer"
                        danger
                        onPress={() => {
                          setMenu(null);
                          act('DELETE', `/api/messages/${c.id}`);
                        }}
                      />
                    ) : (
                      <MenuButton
                        icon="information-circle-outline"
                        label="Infos du groupe"
                        onPress={() => {
                          setMenu(null);
                          router.push({ pathname: '/messages/group/[id]', params: { id: c.id } });
                        }}
                      />
                    )}
                  </View>
                )}
              </View>
            );
          })}
        </View>
        {menu && <AppText style={styles.caption}>« Supprimer » retire la conversation de ta boîte seulement : l’autre personne la garde.</AppText>}
      </ScrollView>
    </View>
  );
}

function MenuButton({ icon, label, danger, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; danger?: boolean; onPress: () => void }) {
  return (
    <Tap accessibilityRole="button" onPress={onPress} style={styles.menuButton}>
      <Ionicons name={icon} size={18} color={danger ? M.danger : M.text} />
      <AppText style={{ color: danger ? M.danger : M.text, fontWeight: '600' }}>{label}</AppText>
    </Tap>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: M.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  back: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, color: M.text, fontSize: 28, lineHeight: 36, fontWeight: '800', letterSpacing: -0.5, paddingVertical: 2 },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  content: { gap: 14, paddingTop: 4, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  search: { marginHorizontal: 16, height: 44, borderRadius: 14, backgroundColor: M.field, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 },
  searchInput: { flex: 1, color: M.text, fontSize: 15, paddingVertical: 0 },
  onlineRow: { gap: 14, paddingHorizontal: 16 },
  onlineItem: { width: 64, alignItems: 'center', gap: 6 },
  onlineRing: { padding: 2, borderRadius: 32, borderWidth: 3, borderColor: M.online },
  onlineName: { color: M.soft, fontSize: 12, maxWidth: 64 },
  caption: { color: M.muted, fontSize: 12, marginHorizontal: 16 },
  requests: { marginHorizontal: 16, minHeight: 52, borderRadius: 16, backgroundColor: M.raised, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14 },
  requestsLabel: { flex: 1, color: M.text, fontWeight: '600', fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flex: 1, color: M.text, fontWeight: '700', fontSize: 16 },
  time: { color: M.muted, fontSize: 12 },
  preview: { flex: 1, color: M.muted, fontSize: 14 },
  dot: { position: 'absolute', right: 0, bottom: 0, width: 14, height: 14, borderRadius: 7, backgroundColor: M.online, borderWidth: 2, borderColor: M.bg },
  badge: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: M.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  badgeText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  menu: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 10 },
  menuButton: { flex: 1, minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: M.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
});
