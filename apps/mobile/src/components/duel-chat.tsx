import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Modal, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DUEL_CHAT_MAX_LENGTH, QUICK_CHAT, type StickerId } from '@qu1z/shared';

import { AttachmentTray } from '@/components/attachments';
import { Sticker } from '@/components/sticker';
import { Tap } from '@/components/tap';
import { AppText } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useGameServer } from '@/state/game-server';

const C = { bg: '#1F1F23', border: '#3F3F46', text: '#F4F4F5', muted: '#A1A1AA', mine: '#E11D48', theirs: '#3F3F46' };

/** Stickers proposés directement dans la barre. */
const QUICK_STICKERS: StickerId[] = ['gg', 'bravo', 'mdr', 'revanche'];

/**
 * Barre de réactions posée en bas de l'écran de fin : 4 stickers en un geste, « Plus » ouvre le panneau complet.
 * Mini chat de fin de match avec l'adversaire (joueur réel uniquement, défis compris) : réponses rapides, message libre de
 * 140 caractères au plus, sticker (pack ou importé) ou GIF. Entre amis les messages sont gardés ; entre inconnus, non.
 */
export function DuelChat({ duelId, opponentName }: { duelId: string; opponentName: string }) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const game = useGameServer();
  const [text, setText] = useState('');
  const [trayOpen, setTrayOpen] = useState(false);
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
  const last = messages.filter((m) => m.from !== game.playerId).slice(-2);

  const panel = (
    <View style={styles.box}>
      <AppText variant="label" color={C.muted}>
        Message à {opponentName}
      </AppText>
      {messages.length > 0 && (
        <View style={styles.list}>
          {messages.slice(-6).map((m) => {
            const mine = m.from === game.playerId;
            return (
              m.stickerId ? (
                <View key={`${m.at}:${m.from}:${m.stickerId}`} style={mine ? styles.mineMedia : styles.theirsMedia}>
                  <Sticker id={m.stickerId} size={96} />
                </View>
              ) : m.gif ? (
                <View key={`${m.at}:${m.from}:${m.gif.id}`} style={mine ? styles.mineMedia : styles.theirsMedia}>
                  <Image source={{ uri: m.gif.url }} style={{ width: 160, height: Math.round((160 * m.gif.height) / Math.max(1, m.gif.width)), borderRadius: 10 }} contentFit="cover" />
                </View>
              ) : (
                <View key={`${m.at}:${m.from}:${m.text}`} style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
                  <AppText color={C.text}>{m.text}</AppText>
                </View>
              )
            );
          })}
        </View>
      )}
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
            game.sendDuelChat(duelId, '', { stickerId });
            setTrayOpen(false);
          }}
          onGif={(g) => {
            game.sendDuelChat(duelId, '', { gif: { id: g.id, url: g.url, width: g.width, height: g.height } });
            setTrayOpen(false);
          }}
        />
      )}
      <View style={styles.inputRow}>
        <Tap accessibilityRole="button" accessibilityLabel="Sticker ou GIF" accessibilityState={{ expanded: trayOpen }} onPress={() => setTrayOpen((o) => !o)} style={styles.sendButton}>
          <Ionicons name="happy-outline" size={24} color={trayOpen ? C.mine : C.text} />
        </Tap>
        <TextInput
          value={text}
          onChangeText={setText}
          maxLength={DUEL_CHAT_MAX_LENGTH}
          placeholder="Écris un message…"
          placeholderTextColor={C.muted}
          onSubmitEditing={() => send(text)}
          returnKeyType="send"
          style={styles.input}
          accessibilityLabel={`Message à ${opponentName}`}
        />
        <Tap accessibilityRole="button" accessibilityLabel="Envoyer" disabled={!text.trim()} onPress={() => send(text)} style={styles.sendButton}>
          <Ionicons name="send" size={20} color={text.trim() ? C.text : C.muted} />
        </Tap>
      </View>
    </View>
  );

  return (
    <>
      <View pointerEvents="box-none" style={[styles.overlay, { bottom: insets.bottom + 10 }]}>
        {last.length > 0 && !open && (
          <View pointerEvents="none" style={styles.peek}>
            {last.map((m) =>
              m.stickerId ? (
                <Sticker key={`${m.at}:${m.stickerId}`} id={m.stickerId} size={56} />
              ) : (
                <View key={`${m.at}:${m.text}`} style={[styles.bubble, styles.theirs]}>
                  <AppText numberOfLines={1} color={C.text} variant="caption">
                    {m.gif ? 'GIF' : m.text}
                  </AppText>
                </View>
              ),
            )}
          </View>
        )}
        <View style={styles.bar}>
          {QUICK_STICKERS.map((id) => (
            <Tap key={id} accessibilityRole="button" accessibilityLabel={`Envoyer le sticker ${id}`} onPress={() => sticker(id)} style={styles.barSticker}>
              <Sticker id={id} size={38} />
            </Tap>
          ))}
          <Tap accessibilityRole="button" accessibilityLabel={`Écrire à ${opponentName}`} onPress={() => setOpen(true)} style={styles.more}>
            <AppText variant="caption" color={C.text} style={{ fontWeight: '700' }}>
              Plus
            </AppText>
          </Tap>
        </View>
      </View>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Tap accessibilityRole="button" accessibilityLabel="Fermer" onPress={() => setOpen(false)} style={styles.scrim} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.md }]}>
          <View style={styles.grab} />
          {panel}
        </View>
      </Modal>
    </>
  );
}
const styles = StyleSheet.create({
  box: { gap: Spacing.sm },
  overlay: { position: 'absolute', left: 12, right: 12, gap: 6 },
  peek: { gap: 4, alignItems: 'flex-start' },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 6, borderRadius: 999, backgroundColor: C.bg, borderWidth: 1, borderColor: C.border },
  barSticker: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  more: { marginLeft: 'auto', minHeight: 40, paddingHorizontal: 14, borderRadius: 999, backgroundColor: C.theirs, justifyContent: 'center' },
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { backgroundColor: C.bg, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: Spacing.md, gap: Spacing.sm },
  grab: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#52525B' },
  list: { gap: 6 },
  bubble: { maxWidth: '80%', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14 },
  mine: { alignSelf: 'flex-end', backgroundColor: C.mine },
  theirs: { alignSelf: 'flex-start', backgroundColor: C.theirs },
  mineMedia: { alignSelf: 'flex-end' },
  theirsMedia: { alignSelf: 'flex-start' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, borderWidth: 1, borderColor: C.border, minHeight: 36, justifyContent: 'center' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  input: { flex: 1, minHeight: 44, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: C.border, color: C.text },
  sendButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
