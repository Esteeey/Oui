import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TextInput, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

import { DUEL_CHAT_MAX_LENGTH, QUICK_CHAT, STICKERS, type CustomStickerId, type StickerId } from '@qu1z/shared';

import { AttachmentTray } from '@/components/attachments';
import { Sticker } from '@/components/sticker';
import { uploadSticker } from '@/components/sticker-picker';
import { Tap } from '@/components/tap';
import { AppText } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useApi } from '@/net/api';
import { useGameServer } from '@/state/game-server';

const C = { bg: '#111116', cell: '#1E1E27', border: '#2A2A33', text: '#F4F4F5', muted: '#A1A1AA', mine: '#FF007A', theirs: '#3F3F46', dot: '#444' };
const PER_PAGE = 10;

/**
 * Bloc message de fin de partie, replié au départ (on touche l'en-tête pour l'ouvrir).
 * Ouvert : derniers messages, pages de stickers à faire glisser (pack Qu1z puis les stickers du joueur),
 * réponses rapides, GIF et texte libre de 140 caractères au plus. Adversaire réel uniquement, défis compris ;
 * entre amis les messages sont gardés, entre inconnus non.
 */
export function DuelChat({ duelId, opponentName }: { duelId: string; opponentName: string }) {
  const game = useGameServer();
  const mine = useApi<{ stickers: CustomStickerId[] }>('/api/me/stickers');
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [trayOpen, setTrayOpen] = useState(false);
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const importOne = async () => {
    setBusy(true);
    try {
      if (await uploadSticker()) mine.refresh();
    } catch {
      // échec d'import : rien à envoyer
    } finally {
      setBusy(false);
    }
  };
  const messages = game.duelChat[duelId] ?? [];

  useEffect(() => {
    game.loadDuelChat(duelId);
    // Historique demandé une fois par duel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duelId]);

  const send = (value: string) => {
    const clean = value.trim();
    if (!clean) return;
    game.sendDuelChat(duelId, clean);
    setText('');
  };
  const sticker = (stickerId: StickerId) => game.sendDuelChat(duelId, '', { stickerId });

  const pack: StickerId[] = STICKERS.map((s) => s.id);
  const pages: { label: string; ids: (StickerId | 'add')[] }[] = [];
  for (let i = 0; i < pack.length; i += PER_PAGE) pages.push({ label: 'Stickers Qu1z', ids: pack.slice(i, i + PER_PAGE) });
  const custom = mine.data?.stickers ?? [];
  const withAdd: (StickerId | 'add')[] = ['add', ...custom];
  for (let i = 0; i < withAdd.length; i += PER_PAGE) pages.push({ label: 'Mes stickers', ids: withAdd.slice(i, i + PER_PAGE) });
  const cell = width ? (width - 4 * 8) / 5 : 0;
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width) setPage(Math.round(e.nativeEvent.contentOffset.x / width));
  };

  return (
    <View style={styles.box}>
      <Tap
        accessibilityRole="button"
        accessibilityLabel={`Message à ${opponentName}`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((o) => !o)}
        style={styles.head}>
        <Ionicons name="chatbubble-ellipses-outline" size={22} color={C.text} />
        <AppText style={styles.title} numberOfLines={1}>
          Message à {opponentName}
        </AppText>
        {!open && messages.some((m) => m.from !== game.playerId) && <View style={styles.unread} />}
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={C.text} />
      </Tap>
      {open && (
        <View style={styles.body}>
          {messages.length > 0 && (
            <View style={styles.list}>
              {messages.slice(-6).map((m) => {
                const me = m.from === game.playerId;
                return m.stickerId ? (
                  <View key={`${m.at}:${m.from}:${m.stickerId}`} style={me ? styles.mineMedia : styles.theirsMedia}>
                    <Sticker id={m.stickerId} size={72} />
                  </View>
                ) : m.gif ? (
                  <View key={`${m.at}:${m.from}:${m.gif.id}`} style={me ? styles.mineMedia : styles.theirsMedia}>
                    <Image source={{ uri: m.gif.url }} style={{ width: 140, height: Math.round((140 * m.gif.height) / Math.max(1, m.gif.width)), borderRadius: 10 }} contentFit="cover" />
                  </View>
                ) : (
                  <View key={`${m.at}:${m.from}:${m.text}`} style={[styles.bubble, me ? styles.mine : styles.theirs]}>
                    <AppText color={C.text}>{m.text}</AppText>
                  </View>
                );
              })}
            </View>
          )}
          <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
            {width > 0 && (
              <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onScroll={onScroll} scrollEventThrottle={64}>
                {pages.map((p, i) => (
                  <View key={i} style={[styles.page, { width }]}>
                    {p.ids.map((id) => id === 'add' ? (
                      <Tap key="add" accessibilityRole="button" accessibilityLabel="Importer un sticker" disabled={busy} onPress={() => void importOne()} style={[styles.cell, styles.add, { width: cell, height: cell }]}>
                        {busy ? <ActivityIndicator color={C.mine} /> : <Ionicons name="add" size={cell * 0.4} color={C.mine} />}
                      </Tap>
                    ) : (
                      <Tap key={id} accessibilityRole="button" accessibilityLabel="Envoyer ce sticker" onPress={() => sticker(id)} style={[styles.cell, { width: cell, height: cell }]}>
                        <Sticker id={id} size={cell * 0.8} />
                      </Tap>
                    ))}
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
          {pages.length > 1 && (
            <View style={styles.dots}>
              {pages.map((_, i) => (
                <View key={i} style={[styles.dot, i === page && { backgroundColor: C.mine }]} />
              ))}
            </View>
          )}
          <AppText variant="caption" color={C.muted} style={{ textAlign: 'center' }}>
            {pages[page]?.label}
          </AppText>
          <View style={styles.chips}>
            {QUICK_CHAT.map((q) => (
              <Tap key={q} accessibilityRole="button" onPress={() => send(q)} style={styles.chip}>
                <AppText variant="caption" color={C.text}>
                  {q}
                </AppText>
              </Tap>
            ))}
          </View>
          {trayOpen && (
            <AttachmentTray
              onSticker={(stickerId) => {
                sticker(stickerId);
                setTrayOpen(false);
              }}
              onGif={(g) => {
                game.sendDuelChat(duelId, '', { gif: { id: g.id, url: g.url, width: g.width, height: g.height } });
                setTrayOpen(false);
              }}
            />
          )}
          <View style={styles.inputRow}>
            <Tap accessibilityRole="button" accessibilityLabel="GIF ou importer un sticker" accessibilityState={{ expanded: trayOpen }} onPress={() => setTrayOpen((o) => !o)} style={styles.iconButton}>
              <Ionicons name="happy-outline" size={24} color={trayOpen ? C.mine : C.text} />
            </Tap>
            <TextInput
              value={text}
              onChangeText={setText}
              maxLength={DUEL_CHAT_MAX_LENGTH}
              placeholder="Écrire un message…"
              placeholderTextColor={C.muted}
              onSubmitEditing={() => send(text)}
              returnKeyType="send"
              style={styles.input}
              accessibilityLabel={`Message à ${opponentName}`}
            />
            <Tap accessibilityRole="button" accessibilityLabel="Envoyer" disabled={!text.trim()} onPress={() => send(text)} style={styles.send}>
              <Ionicons name="send" size={20} color="#FFFFFF" />
            </Tap>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignSelf: 'stretch', backgroundColor: C.bg, borderRadius: 20, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 50, paddingHorizontal: 14 },
  title: { flex: 1, color: C.text, fontWeight: '700', fontSize: 15 },
  unread: { width: 9, height: 9, borderRadius: 5, backgroundColor: C.mine },
  body: { gap: Spacing.sm, paddingHorizontal: 12, paddingBottom: 12 },
  list: { gap: 6 },
  bubble: { maxWidth: '80%', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14 },
  mine: { alignSelf: 'flex-end', backgroundColor: C.mine },
  theirs: { alignSelf: 'flex-start', backgroundColor: C.theirs },
  mineMedia: { alignSelf: 'flex-end' },
  theirsMedia: { alignSelf: 'flex-start' },
  page: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  add: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.mine },
  cell: { borderRadius: 14, backgroundColor: C.cell, alignItems: 'center', justifyContent: 'center' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.dot },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, borderWidth: 1, borderColor: C.border, minHeight: 36, justifyContent: 'center' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  input: { flex: 1, minHeight: 44, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, borderColor: C.border, color: C.text },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  send: { width: 46, height: 44, borderRadius: 14, backgroundColor: C.mine, alignItems: 'center', justifyContent: 'center' },
});
