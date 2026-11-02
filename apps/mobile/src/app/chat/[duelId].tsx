import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { BackButton } from '@/components/back-button';
import { AppText, Button, Screen } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useGameServer } from '@/state/game-server';
import { timeAgo } from '@/utils/time';

/** Discussion avec l'adversaire d'un duel (duels entre joueurs réels uniquement). */
export default function DuelChatScreen() {
  const { duelId } = useLocalSearchParams<{ duelId: string }>();
  const game = useGameServer();
  const [text, setText] = useState('');
  const chat = game.chats[duelId];
  const opponentName = game.duel?.duelId === duelId ? game.duel.opponent.name : 'ton adversaire';

  useEffect(() => {
    if (game.status === 'online') game.loadChat(duelId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duelId, game.status]);

  const send = () => {
    if (!text.trim()) return;
    game.sendChat(duelId, text);
    setText('');
  };

  return (
    <Screen>
      <BackButton />
      <AppText variant="title">Discussion avec {opponentName}</AppText>
      {!chat && <AppText muted>Chargement…</AppText>}
      {chat && !chat.canChat && (
        <AppText muted>La discussion est disponible dans les duels contre de vrais joueurs, pas contre le bot.</AppText>
      )}
      {chat?.messages.map((m) => {
        const mine = m.fromId === game.playerId;
        return (
          <View key={m.id} style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
            <AppText>{m.text}</AppText>
            <AppText variant="caption" muted>
              {mine ? 'Toi' : opponentName} · {timeAgo(m.at)}
            </AppText>
          </View>
        );
      })}
      {chat?.canChat && (
        <View style={styles.input}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Écrire un message…"
            placeholderTextColor={Colors.textMuted}
            maxLength={200}
            accessibilityLabel="Écrire un message"
            style={styles.field}
          />
          <Button label="Envoyer" onPress={send} disabled={!text.trim() || game.status !== 'online'} />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  bubble: { maxWidth: '80%', borderRadius: Radius.md, padding: Spacing.sm + 4, gap: 2 },
  mine: { alignSelf: 'flex-end', backgroundColor: '#3A1F17' },
  theirs: { alignSelf: 'flex-start', backgroundColor: Colors.surface },
  input: { gap: Spacing.sm, backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.sm + 4 },
  field: { color: Colors.text, fontSize: 16, minHeight: 44 },
});
