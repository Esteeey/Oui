import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { AppText, Avatar, Button } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import type { PostTarget } from '@/demo/data';
import { useProgress } from '@/state/progress';
import { MAX_POST_LENGTH, useSocial } from '@/state/social';

/** Zone de rédaction d'une publication, pour un mur ou un fil de thème. */
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
  const { playerName } = useProgress();
  const { publish } = useSocial();
  const [text, setText] = useState('');
  const remaining = MAX_POST_LENGTH - text.length;

  const submit = () => {
    if (publish(target, text)) {
      setText('');
      onPublished?.();
    }
  };

  return (
    <View style={styles.box}>
      <View style={styles.row}>
        <Avatar name={playerName} color={Colors.player} size={36} />
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
      <View style={styles.footer}>
        <AppText variant="caption" color={remaining < 20 ? Colors.gold : Colors.textMuted}>
          {remaining}
        </AppText>
        <Button label="Publier" onPress={submit} disabled={!text.trim()} style={{ minWidth: 120 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  row: { flexDirection: 'row', gap: Spacing.sm + 4, alignItems: 'flex-start' },
  input: { flex: 1, color: Colors.text, fontSize: 16, minHeight: 60, paddingTop: 8, textAlignVertical: 'top' },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
