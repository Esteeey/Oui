import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import type { PublicProfile, UserSummary } from '@qu1z/shared';

import { UserRow } from '@/components/player-row';
import { HeaderButton } from '@/components/header';
import { AppText, Button, Screen } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { api, useApi } from '@/net/api';

/** Liste des abonnés ou des abonnements d'un joueur (photo, pseudo, titre), avec recherche. */
export default function FollowListScreen() {
  const { id, list } = useLocalSearchParams<{ id: string; list: 'followers' | 'following' }>();
  const [query, setQuery] = useState('');
  const which = list === 'following' ? 'following' : 'followers';
  const profile = useApi<PublicProfile>(`/api/users/${id}`);
  const users = useApi<{ users: UserSummary[] }>(
    `/api/users/${id}/${which}${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''}`,
  );
  const isMine = profile.data?.relationship.isMe ?? false;

  return (
    <Screen
      back
      title={which === 'followers' ? 'Abonnés' : 'Abonnements'}
      headerRight={<HeaderButton icon="search" label="Rechercher" onPress={() => router.push('/search')} />}>
      <View style={styles.top}>
        <View style={styles.search}>
          <Ionicons name="search" size={16} color={Colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Rechercher"
            placeholderTextColor={Colors.textMuted}
            accessibilityLabel="Rechercher dans la liste"
            style={styles.input}
          />
        </View>
      </View>
      {profile.data && (
        <AppText variant="heading">
          {which === 'followers' ? 'Abonnés' : 'Abonnements'} de {profile.data.pseudo}
        </AppText>
      )}
      {users.error && (
        <AppText muted>{users.error.code === 'hidden' ? 'Cette liste est masquée par son propriétaire.' : 'Liste indisponible.'}</AppText>
      )}
      {(users.data?.users ?? []).map((u) => (
        <UserRow
          key={u.id}
          user={u}
          right={
            isMine && which === 'followers' ? (
              <Button
                label="Retirer"
                variant="outline"
                color={Colors.textMuted}
                onPress={() => api('DELETE', `/api/me/followers/${u.id}`).catch(() => {})}
              />
            ) : undefined
          }
        />
      ))}
      {users.data && users.data.users.length === 0 && <AppText muted>{query ? 'Aucun résultat.' : 'Personne pour l’instant.'}</AppText>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.md },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    maxWidth: 220,
    backgroundColor: Colors.surface,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.sm + 4,
  },
  input: { flex: 1, color: Colors.text, fontSize: 15, paddingVertical: 8 },
});
