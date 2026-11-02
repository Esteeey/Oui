import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';

import type { UserSummary } from '@qu1z/shared';

import { AppText, Avatar } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { api } from '@/net/api';
import { avatarColor } from '@/utils/avatar';

const MENTION_AT_END = /(^|\s)@([\p{L}\p{N}_.-]{1,20})$/u;

/**
 * Suggestions pendant la saisie d'une mention : si le texte se termine par « @deb… »,
 * propose les pseudos correspondants (jamais un joueur bloqué) ; le choix complète la mention.
 */
export function MentionSuggestions({ text, onChange }: { text: string; onChange: (text: string) => void }) {
  const match = text.match(MENTION_AT_END);
  const query = match?.[2] ?? '';
  const [users, setUsers] = useState<UserSummary[]>([]);

  useEffect(() => {
    if (!query) {
      setUsers([]);
      return;
    }
    const id = setTimeout(() => {
      api<{ users: UserSummary[] }>('GET', `/api/search/mentions?q=${encodeURIComponent(query)}`)
        .then((r) => setUsers(r.users))
        .catch(() => setUsers([]));
    }, 200);
    return () => clearTimeout(id);
  }, [query]);

  if (!query || users.length === 0) return null;
  return (
    <ScrollView horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.sm }}>
      {users.map((u) => (
        <Pressable
          key={u.id}
          accessibilityRole="button"
          accessibilityLabel={`Mentionner ${u.pseudo}`}
          onPress={() => onChange(`${text.slice(0, text.length - query.length - 1)}@${u.pseudo} `)}
          style={styles.chip}>
          <Avatar name={u.pseudo} color={avatarColor(u.id)} uri={u.avatar} size={24} />
          <AppText variant="caption">@{u.pseudo}</AppText>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Radius.pill,
    paddingVertical: 4,
    paddingLeft: 4,
    paddingRight: 10,
    minHeight: 36,
  },
});
