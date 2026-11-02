import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { MAX_POST_LENGTH, type PostTarget } from '@qu1z/shared';

import { AppText, Avatar, Button } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { api, errorMessage } from '@/net/api';
import { useGameServer } from '@/state/game-server';
import { avatarColor } from '@/utils/avatar';

/** Rédaction d'une publication (mur ou fil de thème), envoyée au serveur. Mentionne avec @pseudo. */
export function Composer({
  target,
  placeholder,
  onPublished,
  autoFocus,
}: {
  target: PostTarget;
  placeholder: string;
  onPublished?: () => void;
  autoFocus?: boolean;
}) {
  const { profile, playerId } = useGameServer();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remaining = MAX_POST_LENGTH - text.length;

  const submit = async () => {
    if (sending || !text.trim()) return;
    setSending(true);
    setError(null);
    try {
      await api('POST', '/api/posts', target.kind === 'theme' ? { target: 'theme', themeId: target.themeId, text } : { target: 'profile', text });
      setText('');
      onPublished?.();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={styles.box}>
      <View style={styles.row}>
        <Avatar name={profile?.name ?? '?'} color={playerId ? avatarColor(playerId) : Colors.player} size={36} />
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={placeholder}
          placeholderTextColor={Colors.textMuted}
          multiline
          maxLength={MAX_POST_LENGTH}
          autoFocus={autoFocus}
          accessibilityLabel={placeholder}
          style={styles.input}
        />
      </View>
      {error && <AppText variant="caption" color={Colors.wrong}>{error}</AppText>}
      <View style={styles.footer}>
        <AppText variant="caption" color={remaining < 20 ? Colors.gold : Colors.textMuted}>
          {remaining} · @pseudo pour mentionner
        </AppText>
        <Button label={sending ? 'Envoi…' : 'Publier'} onPress={submit} disabled={!text.trim() || sending} style={{ minWidth: 120 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.sm },
  row: { flexDirection: 'row', gap: Spacing.sm + 4, alignItems: 'flex-start' },
  input: { flex: 1, color: Colors.text, fontSize: 16, minHeight: 60, paddingTop: 8, textAlignVertical: 'top' },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.sm },
});
