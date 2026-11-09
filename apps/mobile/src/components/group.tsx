import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';

import type { GroupRole, UserSummary } from '@qu1z/shared';

import { AppText, Avatar } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { api, useApi } from '@/net/api';
import { mediaUri } from '@/net/media';
import { useGameServer } from '@/state/game-server';
import { avatarColor } from '@/utils/avatar';
import { Tap } from '@/components/tap';

/** Photo d'un groupe, ou pictogramme « groupe » sur fond coloré. */
export function GroupAvatar({ id, name, uri, size = 48 }: { id: string; name: string; uri?: string | null; size?: number }) {
  const source = mediaUri(uri);
  return (
    <View
      accessibilityLabel={`Photo du groupe ${name}`}
      style={[styles.groupAvatar, { width: size, height: size, borderRadius: size * 0.32, backgroundColor: avatarColor(id) }]}>
      {source ? (
        <Image source={{ uri: source }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
      ) : (
        <Ionicons name="people" size={size * 0.5} color={Colors.onAccent} />
      )}
    </View>
  );
}

export const ROLE_LABEL: Record<GroupRole, string> = { creator: 'Créateur', admin: 'Admin', member: 'Membre' };

export function RoleBadge({ role }: { role: GroupRole }) {
  if (role === 'member') return null;
  const color = role === 'creator' ? Colors.goldInk : Colors.infoInk;
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <AppText variant="caption" color={color} style={{ fontSize: 11 }}>
        {ROLE_LABEL[role]}
      </AppText>
    </View>
  );
}

/**
 * Choix de joueurs à inviter : recherche par pseudo, ou mes abonnements quand le champ est vide.
 * `exclude` : joueurs déjà membres ou déjà invités.
 */
export function PlayerPicker({
  selected,
  onChange,
  exclude = [],
}: {
  selected: UserSummary[];
  onChange: (users: UserSummary[]) => void;
  exclude?: string[];
}) {
  const { playerId } = useGameServer();
  const following = useApi<{ users: UserSummary[] }>(playerId ? `/api/users/${playerId}/following` : null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserSummary[] | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (!q) return setResults(null);
    const t = setTimeout(() => {
      api<{ players: UserSummary[] }>('GET', `/api/search?q=${encodeURIComponent(q)}`)
        .then((r) => setResults(r.players))
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const list = (results ?? following.data?.users ?? []).filter((u) => u.id !== playerId && !exclude.includes(u.id));
  const isSelected = (id: string) => selected.some((u) => u.id === id);
  const toggle = (u: UserSummary) => onChange(isSelected(u.id) ? selected.filter((x) => x.id !== u.id) : [...selected, u]);

  return (
    <View style={{ gap: Spacing.sm }}>
      {selected.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.xs }}>
          {selected.map((u) => (
            <Tap key={u.id} accessibilityRole="button" accessibilityLabel={`Retirer ${u.pseudo}`} onPress={() => toggle(u)} style={styles.chip}>
              <Avatar name={u.pseudo} color={avatarColor(u.id)} uri={u.avatar} size={22} />
              <AppText variant="caption">{u.pseudo}</AppText>
              <Ionicons name="close" size={14} color={Colors.textMuted} />
            </Tap>
          ))}
        </ScrollView>
      )}
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Rechercher un joueur"
        placeholderTextColor={Colors.textMuted}
        autoCapitalize="none"
        accessibilityLabel="Rechercher un joueur à inviter"
        style={styles.search}
      />
      <AppText variant="caption" muted>
        {results ? 'Résultats' : 'Tes abonnements'}
      </AppText>
      {list.length === 0 && (
        <AppText muted variant="caption">
          {results ? 'Aucun joueur trouvé.' : 'Cherche un joueur par son pseudo.'}
        </AppText>
      )}
      {list.map((u) => (
        <Tap
          key={u.id}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: isSelected(u.id) }}
          accessibilityLabel={`Choisir ${u.pseudo}`}
          onPress={() => toggle(u)}
          style={styles.row}>
          <Avatar name={u.pseudo} color={avatarColor(u.id)} uri={u.avatar} size={40} />
          <View style={{ flex: 1 }}>
            <AppText variant="label">{u.pseudo}</AppText>
            {u.title && (
              <AppText variant="caption" color={Colors.goldInk}>
                {u.title}
              </AppText>
            )}
          </View>
          <Ionicons name={isSelected(u.id) ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={isSelected(u.id) ? Colors.correct : Colors.textMuted} />
        </Tap>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  groupAvatar: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 2, borderColor: Colors.surfaceRaised },
  badge: { borderWidth: 1, borderRadius: Radius.pill, paddingHorizontal: 8, paddingVertical: 1 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.surface, borderRadius: Radius.pill, paddingHorizontal: 8, paddingVertical: 4 },
  search: { color: Colors.text, fontSize: 16, backgroundColor: Colors.surface, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 6 },
});
