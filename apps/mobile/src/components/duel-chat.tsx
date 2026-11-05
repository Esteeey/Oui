import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { DUEL_CHAT_MAX_LENGTH, QUICK_CHAT } from '@qu1z/shared';

import { Tap } from '@/components/tap';
import { AppText } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useGameServer } from '@/state/game-server';

const C = { bg: '#1F1F23', border: '#3F3F46', text: '#F4F4F5', muted: '#A1A1AA', mine: '#E11D48', theirs: '#3F3F46' };

/**
 * Mini chat de fin de match avec l'adversaire (joueur réel uniquement) : réponses rapides et message libre de
 * 140 caractères au plus. Les messages passent par le serveur du duel et ne sont pas gardés après.
 */
export function DuelChat({ duelId, opponentName }: { duelId: string; opponentName: string }) {
  const game = useGameServer();
  const [text, setText] = useState('');
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

  return (
    <View style={styles.box}>
      <AppText variant="label" color={C.muted}>
        Message à {opponentName}
      </AppText>
      {messages.length > 0 && (
        <View style={styles.list}>
          {messages.slice(-6).map((m) => {
            const mine = m.from === game.playerId;
            return (
              <View key={`${m.at}:${m.from}:${m.text}`} style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
                <AppText color={C.text}>{m.text}</AppText>
              </View>
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
      <View style={styles.inputRow}>
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
}

const styles = StyleSheet.create({
  box: { gap: Spacing.sm, padding: Spacing.md, borderRadius: 12, backgroundColor: C.bg, borderWidth: 1, borderColor: C.border },
  list: { gap: 6 },
  bubble: { maxWidth: '80%', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14 },
  mine: { alignSelf: 'flex-end', backgroundColor: C.mine },
  theirs: { alignSelf: 'flex-start', backgroundColor: C.theirs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, borderWidth: 1, borderColor: C.border, minHeight: 36, justifyContent: 'center' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  input: { flex: 1, minHeight: 44, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: C.border, color: C.text },
  sendButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
