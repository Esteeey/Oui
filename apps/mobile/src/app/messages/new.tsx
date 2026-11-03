import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { MAX_FIRST_MESSAGE_LENGTH, type PublicProfile, type UserSummary } from '@qu1z/shared';

import { UserRow } from '@/components/player-row';
import { AppText, Button, Card, Screen } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { api, errorMessage, useApi } from '@/net/api';

/**
 * Nouveau message : s'il existe déjà une conversation, on l'ouvre ;
 * sinon on envoie une demande avec un premier message facultatif.
 */
export default function NewMessageScreen() {
  const params = useLocalSearchParams<{ userId?: string }>();
  const [userId, setUserId] = useState<string | null>(params.userId ?? null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserSummary[]>([]);
  const [text, setText] = useState('');
  const [state, setState] = useState<{ ok: boolean; text: string } | null>(null);
  const target = useApi<PublicProfile>(userId ? `/api/users/${userId}` : null);

  // Conversation existante : on y va directement.
  useEffect(() => {
    if (!userId) return;
    api<{ conversationId: string | null }>('GET', `/api/messages/with/${userId}`)
      .then((r) => r.conversationId && router.replace({ pathname: '/messages/[id]', params: { id: r.conversationId } }))
      .catch(() => {});
  }, [userId]);

  useEffect(() => {
    const q = query.trim();
    if (!q) return setResults([]);
    const id = setTimeout(() => {
      api<{ players: UserSummary[] }>('GET', `/api/search?q=${encodeURIComponent(q)}`)
        .then((r) => setResults(r.players))
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(id);
  }, [query]);

  const send = async () => {
    if (!userId) return;
    setState(null);
    try {
      const r = await api<{ status: string; conversationId?: string }>('POST', '/api/messages/requests', { userId, text: text.trim() || undefined });
      if (r.conversationId) router.replace({ pathname: '/messages/[id]', params: { id: r.conversationId } });
      else setState({ ok: true, text: 'Demande envoyée. La conversation s’ouvrira quand elle sera acceptée.' });
    } catch (e) {
      setState({ ok: false, text: errorMessage(e) });
    }
  };

  return (
    <Screen title="Nouveau message" back="close">

      {!userId ? (
        <>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="À qui veux-tu écrire ?"
            placeholderTextColor={Colors.textMuted}
            autoFocus
            autoCapitalize="none"
            accessibilityLabel="Chercher un joueur"
            style={styles.input}
          />
          {results.map((u) => (
            <UserRow key={u.id} user={u} right={<Button label="Choisir" variant="outline" color={Colors.text} onPress={() => setUserId(u.id)} />} />
          ))}
        </>
      ) : (
        <>
          {target.data && <AppText variant="label">À : {target.data.pseudo}</AppText>}
          {target.error && <AppText muted>Ce joueur n’est pas joignable.</AppText>}
          <Card>
            <AppText variant="caption" muted>
              Ta demande et ce premier message seront visibles par {target.data?.pseudo ?? 'ce joueur'}. Vous pourrez discuter dès qu’il
              aura accepté.
            </AppText>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Premier message (facultatif)"
              placeholderTextColor={Colors.textMuted}
              maxLength={MAX_FIRST_MESSAGE_LENGTH}
              multiline
              accessibilityLabel="Premier message"
              style={[styles.input, { minHeight: 80 }]}
            />
            <Button label="Envoyer la demande" onPress={send} disabled={!target.data || state?.ok === true} />
          </Card>
          {state && <AppText color={state.ok ? Colors.correct : Colors.wrong}>{state.text}</AppText>}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: {
    color: Colors.text,
    fontSize: 16,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    textAlignVertical: 'top',
  },
});
