import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import type { UserSummary } from '@qu1z/shared';

import { UserRow } from '@/components/player-row';
import { SectionHeader } from '@/components/social';
import { AppText, Avatar, Screen } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { api, useApi } from '@/net/api';
import { avatarColor } from '@/utils/avatar';
import { Tap } from '@/components/tap';

/**
 * Découvrir des joueurs : recherche par pseudo, puis suggestions (photo, pseudo, niveau, titre).
 * Pas de bouton « Suivre » ici : on ouvre le profil pour décider.
 */
export default function DiscoverScreen() {
  const suggestions = useApi<{ users: UserSummary[] }>('/api/discover');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserSummary[] | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults(null);
      return;
    }
    const id = setTimeout(() => {
      api<{ players: UserSummary[] }>('GET', `/api/search?q=${encodeURIComponent(q)}`)
        .then((r) => setResults(r.players))
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(id);
  }, [query]);

  const users = suggestions.data?.users ?? [];
  return (
    <Screen title="Découvrir des joueurs" back>
      <View style={styles.search}>
        <Ionicons name="search" size={18} color={Colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Rechercher un pseudo"
          placeholderTextColor={Colors.textMuted}
          autoCapitalize="none"
          accessibilityLabel="Rechercher un pseudo"
          style={styles.input}
        />
      </View>

      {results ? (
        <>
          {results.length === 0 && <AppText muted>Aucun joueur trouvé.</AppText>}
          {results.map((u) => (
            <UserRow key={u.id} user={u} showLevel />
          ))}
        </>
      ) : (
        <>
          <SectionHeader title="Suggestions" />
          {suggestions.data && users.length === 0 && <AppText muted>Pas encore d’autres joueurs à te proposer.</AppText>}
          <View style={styles.grid}>
            {users.map((u) => (
              <View key={u.id} style={styles.cell}>
                <Tap
                  accessibilityRole="button"
                  accessibilityLabel={`Profil de ${u.pseudo}`}
                  onPress={() => router.push({ pathname: '/player/[id]', params: { id: u.id } })}
                  style={styles.card}>
                  <Avatar name={u.pseudo} color={avatarColor(u.id)} uri={u.avatar} size={64} />
                  <AppText variant="label" numberOfLines={1}>
                    {u.pseudo}
                  </AppText>
                  <AppText variant="caption" color={Colors.gold}>
                    Niveau {u.level}
                  </AppText>
                  <AppText variant="caption" muted numberOfLines={1}>
                    {u.title ?? ' '}
                  </AppText>
                </Tap>
              </View>
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
  },
  input: { flex: 1, color: Colors.text, fontSize: 16, paddingVertical: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -Spacing.xs },
  cell: { width: '50%', padding: Spacing.xs },
  card: {
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
  },
});
