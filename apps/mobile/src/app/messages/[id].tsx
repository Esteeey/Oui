import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Image } from 'expo-image';

import {
  attachmentLabel,
  groupRights,
  MAX_MESSAGE_LENGTH,
  QUICK_REACTIONS,
  type ConversationDetail,
  type GifView,
  type MediaView,
  type MessageView,
  type StickerId,
} from '@qu1z/shared';

import { AttachmentTray, AttachmentView } from '@/components/attachments';
import { GroupAvatar } from '@/components/group';
import { ReportSheet, type ReportTarget } from '@/components/report-sheet';
import { AppText, Avatar } from '@/components/ui';
import { Colors, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { api, errorMessage, useApi } from '@/net/api';
import { pickImage, uploadImage, type PickedImage } from '@/net/media';
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
  const [tray, setTray] = useState(false);
  const [showPinned, setShowPinned] = useState(false);
  const [reporting, setReporting] = useState<ReportTarget | null>(null);
  const [photo, setPhoto] = useState<PickedImage | null>(null);
  const [sending, setSending] = useState(false);
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
  const group = c?.group ?? null;
  const canPin = group ? groupRights(group.myRole).pin : false;
  const pinned = detail.data?.pinned ?? [];
  const pinnedIds = new Set(pinned.map((p) => p.messageId));
  const togglePin = (m: MessageView) => {
    setSelected(null);
    api(pinnedIds.has(m.id) ? 'DELETE' : 'PUT', `/api/groups/pins/${m.id}`).catch((e) => setError(errorMessage(e)));
  };
  const lastMine = [...messages].reverse().find((m) => m.senderId === playerId);

  /** Envoie un message : texte, photo (avec légende facultative), sticker ou GIF. */
  const post = async (content: Record<string, unknown>) => {
    setError(null);
    setSending(true);
    try {
      await api('POST', `/api/messages/${id}`, { ...content, ...(replyTo ? { replyToId: replyTo.id } : {}) });
      setReplyTo(null);
      setTray(false);
      setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 300);
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    } finally {
      setSending(false);
    }
  };

  const send = async () => {
    if (photo) {
      setSending(true);
      try {
        const media = await uploadImage<MediaView>(photo, '/api/media?purpose=message');
        if (await post({ mediaId: media.id, ...(text.trim() ? { text } : {}) })) {
          setPhoto(null);
          setText('');
        }
      } catch (e) {
        setError(errorMessage(e));
        setSending(false);
      }
      return;
    }
    if (!text.trim()) return;
    if (await post({ text })) setText('');
  };

  const choosePhoto = async (source: 'library' | 'camera') => {
    setError(null);
    try {
      const picked = await pickImage(source);
      if (picked) {
        setPhoto(picked);
        setTray(false);
      }
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const sendSticker = (stickerId: StickerId) => void post({ stickerId });
  const sendGif = (g: GifView) => void post({ gif: { id: g.id, url: g.url, width: g.width, height: g.height } });
  const canSend = !sending && (!!photo || !!text.trim());

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
      <ReportSheet target={reporting} onClose={() => setReporting(null)} />
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Retour" onPress={() => (router.canGoBack() ? router.back() : router.replace('/messages'))} style={{ padding: Spacing.sm }}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </Pressable>
        {group && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Infos du groupe"
            onPress={() => router.push({ pathname: '/messages/group/[id]', params: { id } })}
            style={styles.who}>
            <GroupAvatar id={id} name={group.name} uri={group.avatar} size={38} />
            <View style={{ flex: 1 }}>
              <AppText variant="label" numberOfLines={1}>
                {group.name}
              </AppText>
              <AppText variant="caption" muted>
                {group.memberCount} membre{group.memberCount > 1 ? 's' : ''} · infos du groupe
              </AppText>
            </View>
          </Pressable>
        )}
        {other && (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/player/[id]', params: { id: other.id } })}
            style={styles.who}>
            <Avatar name={other.pseudo} color={avatarColor(other.id)} uri={other.avatar} size={38} />
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

      {pinned.length > 0 && (
        <View style={styles.pinnedZone}>
          <Pressable accessibilityRole="button" onPress={() => setShowPinned(!showPinned)} style={styles.pinnedHead}>
            <Ionicons name="pin" size={16} color={Colors.gold} />
            <AppText variant="label" style={{ flex: 1 }} numberOfLines={1}>
              {pinned.length === 1 ? '1 message épinglé' : `${pinned.length} messages épinglés`}
            </AppText>
            <Ionicons name={showPinned ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textMuted} />
          </Pressable>
          {(showPinned ? pinned : pinned.slice(0, 1)).map((p) => (
            <Pressable
              key={p.messageId}
              accessibilityRole="button"
              accessibilityLabel="Aller au message épinglé"
              onPress={() => goTo(p.messageId)}
              style={styles.pinnedItem}>
              <AppText variant="caption" color={Colors.opponent}>
                {p.senderId === playerId ? 'Toi' : (p.senderPseudo ?? '')}
              </AppText>
              <AppText variant="caption" muted numberOfLines={1} style={{ flex: 1 }}>
                {p.text ?? attachmentLabel(p.kind)}
              </AppText>
            </Pressable>
          ))}
        </View>
      )}

      <ScrollView
        ref={scroll}
        contentContainerStyle={styles.messages}
        onContentSizeChange={() => !replyTo && scroll.current?.scrollToEnd({ animated: false })}>
        {messages.map((m, i) => {
          const mine = m.senderId === playerId;
          if (m.kind === 'system') {
            return (
              <View key={m.id} onLayout={(e) => positions.current.set(m.id, e.nativeEvent.layout.y)} style={styles.systemLine}>
                <AppText variant="caption" muted style={{ textAlign: 'center' }}>
                  {m.text}
                </AppText>
              </View>
            );
          }
          // Dans un groupe : pseudo et photo de l'auteur au début de chaque série de messages.
          const firstOfRun = group && !mine && m.sender && messages[i - 1]?.senderId !== m.senderId;
          return (
            <View
              key={m.id}
              onLayout={(e) => positions.current.set(m.id, e.nativeEvent.layout.y)}
              style={[styles.line, mine ? { alignItems: 'flex-end' } : { alignItems: 'flex-start' }, group && !mine && { paddingLeft: 36 }]}>
              {firstOfRun && m.sender && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Profil de ${m.sender.pseudo}`}
                  onPress={() => router.push({ pathname: '/player/[id]', params: { id: m.sender!.id } })}
                  style={styles.senderRow}>
                  <Avatar name={m.sender.pseudo} color={avatarColor(m.sender.id)} uri={m.sender.avatar} size={28} />
                  <AppText variant="caption" color={avatarColor(m.sender.id)}>
                    {m.sender.pseudo}
                  </AppText>
                </Pressable>
              )}
              {pinnedIds.has(m.id) && (
                <AppText variant="caption" color={Colors.gold}>
                  📌 Épinglé
                </AppText>
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityHint="Répondre ou réagir"
                onPress={() => setSelected(selected === m.id ? null : m.id)}
                onLongPress={() => setSelected(m.id)}
                style={[
                  styles.bubble,
                  mine ? styles.mine : styles.theirs,
                  (m.kind === 'sticker' || m.kind === 'gif') && !m.replyTo && styles.bare,
                  m.kind === 'image' && styles.photoBubble,
                  highlight === m.id && styles.highlight,
                ]}>
                {m.replyTo && (
                  <Pressable accessibilityRole="button" accessibilityLabel="Voir le message d’origine" onPress={() => goTo(m.replyTo!.id)} style={styles.quote}>
                    <AppText variant="caption" color={Colors.opponent}>
                      {m.replyTo.senderId === playerId ? 'Toi' : (m.replyTo.senderPseudo ?? '')}
                    </AppText>
                    <AppText variant="caption" muted numberOfLines={2}>
                      {m.replyTo.text ?? (attachmentLabel(m.replyTo.kind) || 'Message retiré')}
                    </AppText>
                  </Pressable>
                )}
                {m.attachment && <AttachmentView attachment={m.attachment} />}
                {m.text ? <AppText>{m.text}</AppText> : null}
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
                  {!mine && (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        setSelected(null);
                        setReporting({
                          type: m.attachment ? 'media' : 'message',
                          id: m.id,
                          label: m.attachment?.kind === 'image' ? 'cette photo' : m.attachment?.kind === 'gif' ? 'ce GIF' : m.attachment ? 'ce sticker' : 'ce message',
                        });
                      }}
                      style={styles.replyButton}>
                      <Ionicons name="flag-outline" size={16} color={Colors.wrong} />
                      <AppText variant="caption">Signaler</AppText>
                    </Pressable>
                  )}
                  {canPin && (
                    <Pressable accessibilityRole="button" onPress={() => togglePin(m)} style={styles.replyButton}>
                      <Ionicons name="pin" size={16} color={Colors.gold} />
                      <AppText variant="caption">{pinnedIds.has(m.id) ? 'Désépingler' : 'Épingler'}</AppText>
                    </Pressable>
                  )}
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
                Réponse à {replyTo.senderId === playerId ? 'toi' : other?.pseudo} : {replyTo.text ?? attachmentLabel(replyTo.kind)}
              </AppText>
              <Ionicons name="close" size={16} color={Colors.textMuted} />
            </Pressable>
          )}
          {error && <AppText variant="caption" color={Colors.wrong}>{error}</AppText>}
          {photo && (
            <View style={styles.pending}>
              <Image source={{ uri: photo.uri }} style={styles.pendingImage} contentFit="cover" accessibilityLabel="Photo à envoyer" />
              <AppText variant="caption" muted style={{ flex: 1 }}>
                Photo prête. Ajoute une légende si tu veux.
              </AppText>
              <Pressable accessibilityRole="button" accessibilityLabel="Retirer la photo" onPress={() => setPhoto(null)} style={{ padding: 6 }}>
                <Ionicons name="close" size={18} color={Colors.textMuted} />
              </Pressable>
            </View>
          )}
          {tray && !photo && <AttachmentTray onPhoto={choosePhoto} onSticker={sendSticker} onGif={sendGif} />}
          <View style={styles.inputRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={tray ? 'Fermer les pièces jointes' : 'Photo, sticker ou GIF'}
              onPress={() => setTray(!tray)}
              style={styles.plus}>
              <Ionicons name={tray ? 'close' : 'add'} size={24} color={Colors.text} />
            </Pressable>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={photo ? 'Légende…' : 'Message…'}
              placeholderTextColor={Colors.textMuted}
              maxLength={MAX_MESSAGE_LENGTH}
              multiline
              accessibilityLabel="Écrire un message"
              style={styles.input}
            />
            <Pressable accessibilityRole="button" accessibilityLabel="Envoyer" disabled={!canSend} onPress={send} style={[styles.send, !canSend && { opacity: 0.4 }]}>
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
  systemLine: { alignSelf: 'center', backgroundColor: Colors.surface, borderRadius: Radius.pill, paddingHorizontal: Spacing.sm + 4, paddingVertical: 4, maxWidth: '90%' },
  senderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: -36 },
  pinnedZone: { borderBottomWidth: 1, borderBottomColor: Colors.border, paddingHorizontal: Spacing.md, paddingVertical: 6, gap: 2, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  pinnedHead: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 28 },
  pinnedItem: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 22, minHeight: 26 },
  bubble: { maxWidth: '82%', borderRadius: Radius.md, paddingHorizontal: Spacing.sm + 4, paddingVertical: Spacing.sm, gap: 4 },
  mine: { backgroundColor: '#3A1F17', borderBottomRightRadius: 6 },
  theirs: { backgroundColor: Colors.surface, borderBottomLeftRadius: 6 },
  highlight: { borderWidth: 2, borderColor: Colors.gold },
  bare: { backgroundColor: 'transparent', paddingHorizontal: 0, paddingVertical: 0 },
  photoBubble: { padding: 4 },
  plus: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  pending: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.surface, borderRadius: Radius.sm, padding: 6 },
  pendingImage: { width: 56, height: 56, borderRadius: Radius.sm },
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
