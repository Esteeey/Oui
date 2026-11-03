import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { getCategory, type UserSummary } from '@qu1z/shared';

import { UserRow } from '@/components/player-row';
import { SectionHeader } from '@/components/social';
import { AppText, Button, Screen } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { api } from '@/net/api';

interface Results {
  players: UserSummary[];
  themes: { id: string; name: string; categoryId: string }[];
}

/** Recherche globale : joueurs (par pseudo) et thèmes (par nom). */
export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Results | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults(null);
      return;
    }
    const id = setTimeout(() => {
      api<Results>('GET', `/api/search?q=${encodeURIComponent(q)}`)
        .then(setResults)
        .catch(() => setResults({ players: [], themes: [] }));
    }, 250);
    return () => clearTimeout(id);
  }, [query]);

  return (
    <Screen back title="Recherche">
      <View style={styles.search}>
        <Ionicons name="search" size={18} color={Colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Un joueur, un thème…"
          placeholderTextColor={Colors.textMuted}
          autoFocus
          autoCapitalize="none"
          accessibilityLabel="Rechercher un joueur ou un thème"
          style={styles.input}
        />
      </View>

      {!results && (
        <View style={{ gap: Spacing.sm }}>
          <AppText muted>Cherche un joueur par son pseudo, ou un thème par son nom.</AppText>
          <Button label="Découvrir des joueurs" variant="outline" color={Colors.text} onPress={() => router.push('/discover')} />
        </View>
      )}

      {results && (
        <>
          <SectionHeader title="Joueurs" />
          {results.players.length === 0 && <AppText muted>Aucun joueur trouvé.</AppText>}
          {results.players.map((u) => (
            <UserRow key={u.id} user={u} />
          ))}
          <SectionHeader title="Thèmes" />
          {results.themes.length === 0 && <AppText muted>Aucun thème trouvé.</AppText>}
          {results.themes.map((t) => {
            const category = getCategory(t.categoryId);
            return (
              <Pressable
                key={t.id}
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/theme/[id]', params: { id: t.id } })}
                style={[styles.theme, { borderLeftColor: category?.color ?? Colors.border }]}>
                <AppText style={{ fontSize: 22 }}>{category?.icon}</AppText>
                <View style={{ flex: 1 }}>
                  <AppText variant="label">{t.name}</AppText>
                  <AppText variant="caption" muted>
                    {category?.name}
                  </AppText>
                </View>
              </Pressable>
            );
          })}
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
  theme: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderLeftWidth: 6,
    padding: Spacing.md,
    minHeight: 56,
  },
});
