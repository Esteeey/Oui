import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Image } from 'expo-image';

import {
  attachmentLabel,
  groupRights,
  MAX_MESSAGE_LENGTH,
  QUICK_CHAT,
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
import { M } from '@/components/messages-theme';
import { AppText, Avatar, LoadingState } from '@/components/ui';
import { Colors, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { api, errorMessage, useApi } from '@/net/api';
import { pickImage, uploadImage, type PickedImage } from '@/net/media';
import { useGameServer } from '@/state/game-server';
import { avatarColor } from '@/utils/avatar';
import { timeAgo } from '@/utils/time';
import { Tap } from '@/components/tap';

function presenceText(p: ConversationDetail['conversation']['presence']): string | null {
  if (!p) return null;
  if (p.online) return 'En ligne';
  return p.lastSeenAt ? `Vu ${timeAgo(p.lastSeenAt) === "à l'instant" ? "à l'instant" : `il y a ${timeAgo(p.lastSeenAt)}`}` : null;
}

/** Une conversation privée : messages, réponses, réactions, statut Envoyé / Lu. */
export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { playerId } = useGameServer();
  const insets = useSafeAreaInsets();
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
        <Tap onPress={() => router.back()} style={{ padding: Spacing.md }}>
          <AppText color={M.muted}>← Retour</AppText>
        </Tap>
        <AppText color={M.muted} style={{ padding: Spacing.md }}>
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
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ReportSheet target={reporting} onClose={() => setReporting(null)} />
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <Tap accessibilityRole="button" accessibilityLabel="Retour" onPress={() => router.back()} style={styles.back}>
          <Ionicons name="chevron-back" size={26} color={M.text} />
        </Tap>
        {group && (
          <Tap
            accessibilityRole="button"
            accessibilityLabel="Infos du groupe"
            onPress={() => router.push({ pathname: '/messages/group/[id]', params: { id } })}
            style={styles.who}>
            <GroupAvatar id={id} name={group.name} uri={group.avatar} size={42} />
            <View style={{ flex: 1 }}>
              <AppText numberOfLines={1} style={styles.whoName}>
                {group.name}
              </AppText>
              <AppText style={styles.whoSub}>
                {group.memberCount} membre{group.memberCount > 1 ? 's' : ''} · infos du groupe
              </AppText>
            </View>
          </Tap>
        )}
        {other && (
          <>
            <Tap accessibilityRole="button" onPress={() => router.push({ pathname: '/player/[id]', params: { id: other.id } })} style={styles.who}>
              <View>
                <Avatar name={other.pseudo} color={avatarColor(other.id)} uri={other.avatar} size={42} />
                {c?.presence?.online && <View style={styles.dot} />}
              </View>
              <View style={{ flex: 1 }}>
                <AppText numberOfLines={1} style={styles.whoName}>
                  {other.pseudo}
                </AppText>
                {presenceText(c?.presence ?? null) && (
                  <AppText style={[styles.whoSub, c?.presence?.online && { color: M.online }]}>{presenceText(c?.presence ?? null)}</AppText>
                )}
              </View>
            </Tap>
            <Tap
              accessibilityRole="button"
              accessibilityLabel={`Défier ${other.pseudo}`}
              onPress={() => router.push({ pathname: '/player/[id]', params: { id: other.id } })}
              style={styles.challenge}>
              <Ionicons name="flash" size={16} color="#FFFFFF" />
              <AppText style={styles.challengeText}>Défier</AppText>
            </Tap>
          </>
        )}
      </View>

      {pinned.length > 0 && (
        <View style={styles.pinnedZone}>
          <Tap accessibilityRole="button" onPress={() => setShowPinned(!showPinned)} style={styles.pinnedHead}>
            <Ionicons name="pin" size={16} color={Colors.gold} />
            <AppText variant="label" color={M.text} style={{ flex: 1 }} numberOfLines={1}>
              {pinned.length === 1 ? '1 message épinglé' : `${pinned.length} messages épinglés`}
            </AppText>
            <Ionicons name={showPinned ? 'chevron-up' : 'chevron-down'} size={16} color={M.muted} />
          </Tap>
          {(showPinned ? pinned : pinned.slice(0, 1)).map((p) => (
            <Tap
              key={p.messageId}
              accessibilityRole="button"
              accessibilityLabel="Aller au message épinglé"
              onPress={() => goTo(p.messageId)}
              style={styles.pinnedItem}>
              <AppText variant="caption" color={M.gold}>
                {p.senderId === playerId ? 'Toi' : (p.senderPseudo ?? '')}
              </AppText>
              <AppText variant="caption" color={M.muted} numberOfLines={1} style={{ flex: 1 }}>
                {p.text ?? attachmentLabel(p.kind)}
              </AppText>
            </Tap>
          ))}
        </View>
      )}

      <ScrollView
        ref={scroll}
        contentContainerStyle={styles.messages}
        onContentSizeChange={() => !replyTo && scroll.current?.scrollToEnd({ animated: false })}>
        <LoadingState visible={detail.loading && !detail.data} label="Chargement des messages" />
        {messages.map((m, i) => {
          const mine = m.senderId === playerId;
          if (m.kind === 'system') {
            return (
              <View key={m.id} onLayout={(e) => positions.current.set(m.id, e.nativeEvent.layout.y)} style={styles.systemLine}>
                <AppText variant="caption" style={{ textAlign: 'center', color: M.muted }}>
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
                <Tap
                  accessibilityRole="button"
                  accessibilityLabel={`Profil de ${m.sender.pseudo}`}
                  onPress={() => router.push({ pathname: '/player/[id]', params: { id: m.sender!.id } })}
                  style={styles.senderRow}>
                  <Avatar name={m.sender.pseudo} color={avatarColor(m.sender.id)} uri={m.sender.avatar} size={28} />
                  <AppText variant="caption" color={avatarColor(m.sender.id)}>
                    {m.sender.pseudo}
                  </AppText>
                </Tap>
              )}
              {pinnedIds.has(m.id) && (
                <AppText variant="caption" color={Colors.goldInk}>
                  📌 Épinglé
                </AppText>
              )}
              <Tap
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
                  <Tap accessibilityRole="button" accessibilityLabel="Voir le message d’origine" onPress={() => goTo(m.replyTo!.id)} style={styles.quote}>
                    <AppText variant="caption" color={M.gold}>
                      {m.replyTo.senderId === playerId ? 'Toi' : (m.replyTo.senderPseudo ?? '')}
                    </AppText>
                    <AppText variant="caption" color={M.muted} numberOfLines={2}>
                      {m.replyTo.text ?? (attachmentLabel(m.replyTo.kind) || 'Message retiré')}
                    </AppText>
                  </Tap>
                )}
                {m.attachment && <AttachmentView attachment={m.attachment} />}
                {m.text ? <AppText style={{ color: mine && m.kind !== 'sticker' && m.kind !== 'gif' ? M.onAccent : M.text, fontSize: 15, lineHeight: 21 }}>{m.text}</AppText> : null}
                <AppText variant="caption" style={{ alignSelf: 'flex-end', fontSize: 11, color: mine ? 'rgba(255,255,255,0.8)' : M.muted }}>
                  {new Date(m.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                </AppText>
              </Tap>
              {m.reactions.length > 0 && (
                <View style={styles.reactions}>
                  {m.reactions.map((r) => (
                    <View key={r.emoji} style={styles.reaction}>
                      <AppText variant="caption" color={M.text}>
                        {r.emoji} {r.userIds.length > 1 ? r.userIds.length : ''}
                      </AppText>
                    </View>
                  ))}
                </View>
              )}
              {selected === m.id && (
                <View style={styles.actions}>
                  {QUICK_REACTIONS.map((e) => (
                    <Tap key={e} accessibilityRole="button" accessibilityLabel={`Réagir ${e}`} onPress={() => react(m, e)} style={styles.emoji}>
                      <AppText style={{ fontSize: 20 }}>{e}</AppText>
                    </Tap>
                  ))}
                  <Tap
                    accessibilityRole="button"
                    onPress={() => {
                      setReplyTo(m);
                      setSelected(null);
                    }}
                    style={styles.replyButton}>
                    <Ionicons name="arrow-undo" size={16} color={M.text} />
                    <AppText variant="caption" color={M.text}>Répondre</AppText>
                  </Tap>
                  {!mine && (
                    <Tap
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
                      <AppText variant="caption" color={M.text}>Signaler</AppText>
                    </Tap>
                  )}
                  {canPin && (
                    <Tap accessibilityRole="button" onPress={() => togglePin(m)} style={styles.replyButton}>
                      <Ionicons name="pin" size={16} color={Colors.gold} />
                      <AppText variant="caption" color={M.text}>{pinnedIds.has(m.id) ? 'Désépingler' : 'Épingler'}</AppText>
                    </Tap>
                  )}
                </View>
              )}
              {lastMine?.id === m.id && m.status && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <AppText variant="caption" style={{ color: M.muted }}>{m.status === 'read' ? 'Lu' : 'Envoyé'}</AppText>
                  <Ionicons name={m.status === 'read' ? 'checkmark-done' : 'checkmark'} size={15} color={m.status === 'read' ? M.online : M.muted} />
                </View>
              )}
            </View>
          );
        })}
        {detail.data && messages.length === 0 && (
          <AppText style={{ textAlign: 'center', color: M.muted }}>
            Aucun message pour l’instant.
          </AppText>
        )}
      </ScrollView>

      {detail.data?.canSend === false ? (
        <AppText style={{ textAlign: 'center', padding: Spacing.md, color: M.muted }}>
          Tu ne peux plus écrire dans cette conversation.
        </AppText>
      ) : (
        <View style={styles.composer}>
          {replyTo && (
            <Tap accessibilityRole="button" onPress={() => setReplyTo(null)} style={styles.replyBanner}>
              <AppText variant="caption" color={M.gold} style={{ flex: 1 }} numberOfLines={1}>
                Réponse à {replyTo.senderId === playerId ? 'toi' : other?.pseudo} : {replyTo.text ?? attachmentLabel(replyTo.kind)}
              </AppText>
              <Ionicons name="close" size={16} color={M.muted} />
            </Tap>
          )}
          {error && <AppText variant="caption" color={Colors.wrong}>{error}</AppText>}
          {photo && (
            <View style={styles.pending}>
              <Image source={{ uri: photo.uri }} style={styles.pendingImage} contentFit="cover" accessibilityLabel="Photo à envoyer" />
              <AppText variant="caption" color={M.muted} style={{ flex: 1 }}>
                Photo prête. Ajoute une légende si tu veux.
              </AppText>
              <Tap accessibilityRole="button" accessibilityLabel="Retirer la photo" onPress={() => setPhoto(null)} style={{ padding: 6 }}>
                <Ionicons name="close" size={18} color={M.muted} />
              </Tap>
            </View>
          )}
          {!group && !text && !photo && !tray && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8 }}>
              {QUICK_CHAT.map((q) => (
                <Tap key={q} accessibilityRole="button" onPress={() => void post({ text: q })} style={styles.chip}>
                  <AppText style={{ color: M.text, fontSize: 13 }}>{q}</AppText>
                </Tap>
              ))}
            </ScrollView>
          )}
          {tray && !photo && <AttachmentTray onPhoto={choosePhoto} onSticker={sendSticker} onGif={sendGif} />}
          <View style={styles.inputRow}>
            <Tap
              accessibilityRole="button"
              accessibilityLabel={tray ? 'Fermer les pièces jointes' : 'Photo, sticker ou GIF'}
              onPress={() => setTray(!tray)}
              style={styles.plus}>
              <Ionicons name={tray ? 'close' : 'add'} size={24} color={M.text} />
            </Tap>
            <View style={styles.field}>
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder={photo ? 'Légende…' : 'Message…'}
                placeholderTextColor={M.muted}
                maxLength={MAX_MESSAGE_LENGTH}
                multiline
                accessibilityLabel="Écrire un message"
                style={styles.input}
              />
              <Tap accessibilityRole="button" accessibilityLabel="Stickers et GIF" onPress={() => setTray(!tray)} style={styles.smiley}>
                <Ionicons name="happy-outline" size={22} color={M.gold} />
              </Tap>
            </View>
            <Tap accessibilityRole="button" accessibilityLabel="Envoyer" disabled={!canSend} onPress={send} style={[styles.send, !canSend && { opacity: 0.4 }]}>
              <Ionicons name="send" size={20} color="#FFFFFF" />
            </Tap>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: M.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingBottom: 10, backgroundColor: M.bar },
  back: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  who: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  whoName: { color: M.text, fontWeight: '700', fontSize: 16 },
  whoSub: { color: M.muted, fontSize: 12 },
  dot: { position: 'absolute', right: -1, bottom: -1, width: 13, height: 13, borderRadius: 7, backgroundColor: M.online, borderWidth: 2, borderColor: M.bar },
  challenge: { height: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: M.accent, flexDirection: 'row', alignItems: 'center', gap: 6 },
  challengeText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  messages: { padding: Spacing.md, gap: Spacing.sm, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  line: { gap: 4 },
  systemLine: { alignSelf: 'center', backgroundColor: M.field, borderRadius: Radius.pill, paddingHorizontal: Spacing.sm + 4, paddingVertical: 4, maxWidth: '90%' },
  senderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: -36 },
  pinnedZone: { borderBottomWidth: 1, borderBottomColor: M.border, backgroundColor: M.bar, paddingHorizontal: Spacing.md, paddingVertical: 6, gap: 2, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  pinnedHead: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 28 },
  pinnedItem: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 22, minHeight: 26 },
  bubble: { maxWidth: '80%', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9, gap: 4 },
  mine: { backgroundColor: M.accent, borderBottomRightRadius: 6 },
  theirs: { backgroundColor: M.theirs, borderBottomLeftRadius: 6 },
  highlight: { borderWidth: 2, borderColor: M.gold },
  bare: { backgroundColor: 'transparent', paddingHorizontal: 0, paddingVertical: 0 },
  photoBubble: { padding: 4 },
  plus: { width: 44, height: 44, borderRadius: 22, backgroundColor: M.raised, alignItems: 'center', justifyContent: 'center' },
  pending: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: M.raised, borderRadius: Radius.sm, padding: 6 },
  pendingImage: { width: 56, height: 56, borderRadius: Radius.sm },
  quote: { borderLeftWidth: 3, borderLeftColor: M.gold, paddingLeft: Spacing.sm, paddingVertical: 2 },
  reactions: { flexDirection: 'row', gap: 4 },
  reaction: { backgroundColor: M.raised, borderRadius: Radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4, backgroundColor: M.raised, borderRadius: Radius.pill, padding: 4 },
  emoji: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  replyButton: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, minHeight: 36 },
  composer: { backgroundColor: M.bar, paddingHorizontal: 10, paddingVertical: 8, gap: 8, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  chip: { height: 34, paddingHorizontal: 12, borderRadius: 17, borderWidth: 1, borderColor: M.border, justifyContent: 'center' },
  replyBanner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: M.raised, borderRadius: Radius.sm, padding: Spacing.sm },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  field: { flex: 1, minHeight: 44, borderRadius: 22, backgroundColor: M.raised, flexDirection: 'row', alignItems: 'flex-end', paddingLeft: 16, paddingRight: 4 },
  input: { flex: 1, color: M.text, fontSize: 16, paddingVertical: 11, maxHeight: 120 },
  smiley: { width: 36, height: 44, alignItems: 'center', justifyContent: 'center' },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: M.accent, alignItems: 'center', justifyContent: 'center' },
});
