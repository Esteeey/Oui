import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MAX_MESSAGE_LENGTH, QUICK_REACTIONS, type ConversationDetail, type MessageView } from '@qu1z/shared';

import { AppText, Avatar } from '@/components/ui';
import { Colors, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { api, errorMessage, useApi } from '@/net/api';
import { useGameServer } from '@/state/game-server';
import { avatarColor } from '@/utils/avatar';
import { timeAgo } from '@/utils/time';

function presenceText(p: ConversationDetail['conversation']['presence']): string | null {
  if (!p) return null;
  if (p.online) return 'En ligne';
  return p.lastSeenAt ? `Vu ${timeAgo(p.lastSeenAt) === "à l'instant" ? "à l'instant" : `il y a ${timeAgo(p.lastSeenAt)}`}` : null;
}

/** Une conversation privée : messages, réponses, réactions, statut Envoyé / Lu. */
export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { playerId } = useGameServer();
  const detail = useApi<ConversationDetail>(`/api/messages/${id}`);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<MessageView | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const positions = useRef(new Map<string, number>());
  const messages = detail.data?.messages ?? [];
  const lastSeq = messages.at(-1)?.seq ?? 0;

  // Lecture : la conversation est marquée comme lue à l'ouverture et à chaque nouveau message.
  useEffect(() => {
    if (lastSeq) api('POST', `/api/messages/${id}/read`).catch(() => {});
  }, [id, lastSeq]);

  if (detail.error) {
    return (
      <SafeAreaView style={styles.screen}>
        <Pressable onPress={() => router.back()} style={{ padding: Spacing.md }}>
          <AppText muted>← Retour</AppText>
        </Pressable>
        <AppText muted style={{ padding: Spacing.md }}>
          Cette conversation n’est plus disponible.
        </AppText>
      </SafeAreaView>
    );
  }

  const c = detail.data?.conversation;
  const other = c?.other;
  const lastMine = [...messages].reverse().find((m) => m.senderId === playerId);

  const send = async () => {
    if (!text.trim()) return;
    setError(null);
    try {
      await api('POST', `/api/messages/${id}`, { text, ...(replyTo ? { replyToId: replyTo.id } : {}) });
      setText('');
      setReplyTo(null);
      setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 300);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const react = (m: MessageView, emoji: string) => {
    const mine = m.reactions.find((r) => r.userIds.includes(playerId ?? ''))?.emoji;
    setSelected(null);
    api(mine === emoji ? 'DELETE' : 'PUT', `/api/messages/reactions/${m.id}`, mine === emoji ? undefined : { emoji }).catch((e) => setError(errorMessage(e)));
  };

  const goTo = (messageId: string) => {
    const y = positions.current.get(messageId);
    if (y !== undefined) scroll.current?.scrollTo({ y: Math.max(0, y - 80), animated: true });
    setHighlight(messageId);
    setTimeout(() => setHighlight(null), 1500);
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Retour" onPress={() => (router.canGoBack() ? router.back() : router.replace('/messages'))} style={{ padding: Spacing.sm }}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </Pressable>
        {other && (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/player/[id]', params: { id: other.id } })}
            style={styles.who}>
            <Avatar name={other.pseudo} color={avatarColor(other.id)} size={38} />
            <View>
              <AppText variant="label">{other.pseudo}</AppText>
              {presenceText(c?.presence ?? null) && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  {c?.presence?.online && <View style={styles.dot} />}
                  <AppText variant="caption" color={c?.presence?.online ? Colors.correct : Colors.textMuted}>
                    {presenceText(c?.presence ?? null)}
                  </AppText>
                </View>
              )}
            </View>
          </Pressable>
        )}
      </View>

      <ScrollView
        ref={scroll}
        contentContainerStyle={styles.messages}
        onContentSizeChange={() => !replyTo && scroll.current?.scrollToEnd({ animated: false })}>
        {messages.map((m) => {
          const mine = m.senderId === playerId;
          return (
            <View
              key={m.id}
              onLayout={(e) => positions.current.set(m.id, e.nativeEvent.layout.y)}
              style={[styles.line, mine ? { alignItems: 'flex-end' } : { alignItems: 'flex-start' }]}>
              <Pressable
                accessibilityRole="button"
                accessibilityHint="Répondre ou réagir"
                onPress={() => setSelected(selected === m.id ? null : m.id)}
                onLongPress={() => setSelected(m.id)}
                style={[styles.bubble, mine ? styles.mine : styles.theirs, highlight === m.id && styles.highlight]}>
                {m.replyTo && (
                  <Pressable accessibilityRole="button" accessibilityLabel="Voir le message d’origine" onPress={() => goTo(m.replyTo!.id)} style={styles.quote}>
                    <AppText variant="caption" color={Colors.opponent}>
                      {m.replyTo.senderId === playerId ? 'Toi' : (m.replyTo.senderPseudo ?? '')}
                    </AppText>
                    <AppText variant="caption" muted numberOfLines={2}>
                      {m.replyTo.text ?? 'Message retiré'}
                    </AppText>
                  </Pressable>
                )}
                <AppText>{m.text}</AppText>
                <AppText variant="caption" muted style={{ alignSelf: 'flex-end', fontSize: 11 }}>
                  {new Date(m.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                </AppText>
              </Pressable>
              {m.reactions.length > 0 && (
                <View style={styles.reactions}>
                  {m.reactions.map((r) => (
                    <View key={r.emoji} style={styles.reaction}>
                      <AppText variant="caption">
                        {r.emoji} {r.userIds.length > 1 ? r.userIds.length : ''}
                      </AppText>
                    </View>
                  ))}
                </View>
              )}
              {selected === m.id && (
                <View style={styles.actions}>
                  {QUICK_REACTIONS.map((e) => (
                    <Pressable key={e} accessibilityRole="button" accessibilityLabel={`Réagir ${e}`} onPress={() => react(m, e)} style={styles.emoji}>
                      <AppText style={{ fontSize: 20 }}>{e}</AppText>
                    </Pressable>
                  ))}
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      setReplyTo(m);
                      setSelected(null);
                    }}
                    style={styles.replyButton}>
                    <Ionicons name="arrow-undo" size={16} color={Colors.text} />
                    <AppText variant="caption">Répondre</AppText>
                  </Pressable>
                </View>
              )}
              {lastMine?.id === m.id && m.status && (
                <AppText variant="caption" color={m.status === 'read' ? Colors.opponent : Colors.textMuted}>
                  {m.status === 'read' ? 'Lu' : 'Envoyé'}
                </AppText>
              )}
            </View>
          );
        })}
        {detail.data && messages.length === 0 && (
          <AppText muted style={{ textAlign: 'center' }}>
            Aucun message pour l’instant.
          </AppText>
        )}
      </ScrollView>

      {detail.data?.canSend === false ? (
        <AppText muted style={{ textAlign: 'center', padding: Spacing.md }}>
          Tu ne peux plus écrire dans cette conversation.
        </AppText>
      ) : (
        <View style={styles.composer}>
          {replyTo && (
            <Pressable accessibilityRole="button" onPress={() => setReplyTo(null)} style={styles.replyBanner}>
              <AppText variant="caption" color={Colors.opponent} style={{ flex: 1 }} numberOfLines={1}>
                Réponse à {replyTo.senderId === playerId ? 'toi' : other?.pseudo} : {replyTo.text}
              </AppText>
              <Ionicons name="close" size={16} color={Colors.textMuted} />
            </Pressable>
          )}
          {error && <AppText variant="caption" color={Colors.wrong}>{error}</AppText>}
          <View style={styles.inputRow}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Message…"
              placeholderTextColor={Colors.textMuted}
              maxLength={MAX_MESSAGE_LENGTH}
              multiline
              accessibilityLabel="Écrire un message"
              style={styles.input}
            />
            <Pressable accessibilityRole="button" accessibilityLabel="Envoyer" disabled={!text.trim()} onPress={send} style={[styles.send, !text.trim() && { opacity: 0.4 }]}>
              <Ionicons name="send" size={20} color={Colors.background} />
            </Pressable>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, paddingHorizontal: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border, minHeight: 56 },
  who: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.correct },
  messages: { padding: Spacing.md, gap: Spacing.sm, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  line: { gap: 4 },
  bubble: { maxWidth: '82%', borderRadius: Radius.md, paddingHorizontal: Spacing.sm + 4, paddingVertical: Spacing.sm, gap: 4 },
  mine: { backgroundColor: '#3A1F17', borderBottomRightRadius: 6 },
  theirs: { backgroundColor: Colors.surface, borderBottomLeftRadius: 6 },
  highlight: { borderWidth: 2, borderColor: Colors.gold },
  quote: { borderLeftWidth: 3, borderLeftColor: Colors.opponent, paddingLeft: Spacing.sm, paddingVertical: 2 },
  reactions: { flexDirection: 'row', gap: 4 },
  reaction: { backgroundColor: Colors.surfaceRaised, borderRadius: Radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4, backgroundColor: Colors.surfaceRaised, borderRadius: Radius.pill, padding: 4 },
  emoji: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  replyButton: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, minHeight: 36 },
  composer: { borderTopWidth: 1, borderTopColor: Colors.border, padding: Spacing.sm, gap: 6, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  replyBanner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.surface, borderRadius: Radius.sm, padding: Spacing.sm },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm },
  input: { flex: 1, color: Colors.text, fontSize: 16, backgroundColor: Colors.surface, borderRadius: Radius.md, paddingHorizontal: Spacing.sm + 4, paddingVertical: 10, maxHeight: 120 },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.player, alignItems: 'center', justifyContent: 'center' },
});
