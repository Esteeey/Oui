import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { THEMES, getCategory, type LeaderboardRow } from '@qu1z/shared';

import { Chip, DivisionBadge, Segmented } from '@/components/social';
import { SearchButton } from '@/components/search-button';
import { AppText, Avatar, Screen } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useApi } from '@/net/api';
import { useGameServer } from '@/state/game-server';
import { avatarColor } from '@/utils/avatar';

type Scope = 'world' | 'following';

/** Classement réel par cote (général ou par thème), monde ou joueurs suivis. */
export default function LeaderboardScreen() {
  const { playerId } = useGameServer();
  const [scope, setScope] = useState<Scope>('world');
  const [themeId, setThemeId] = useState<string>('global');
  const board = useApi<{ rows: LeaderboardRow[] }>(
    playerId ? `/api/leaderboard?scope=${scope}${themeId === 'global' ? '' : `&theme=${themeId}`}` : null,
  );
  const rows = board.data?.rows ?? [];

  return (
    <Screen inTabs>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: Spacing.sm }}>
        <AppText variant="title">Classements</AppText>
        <SearchButton />
      </View>
      <Segmented
        value={scope}
        onChange={setScope}
        options={[
          { value: 'world', label: 'Monde' },
          { value: 'following', label: 'Abonnements' },
        ]}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.sm }}>
        <Chip label="Général" active={themeId === 'global'} onPress={() => setThemeId('global')} />
        {THEMES.map((t) => (
          <Chip key={t.id} label={t.name} color={getCategory(t.categoryId)?.color} active={themeId === t.id} onPress={() => setThemeId(t.id)} />
        ))}
      </ScrollView>

      {board.data && !rows.some((r) => r.isMe) && (
        <AppText variant="caption" muted>
          Joue un duel dans ce thème pour apparaître dans le classement.
        </AppText>
      )}
      {board.data && rows.length === 0 && <AppText muted>Personne n’est encore classé ici.</AppText>}

      <View style={{ gap: Spacing.sm }}>
        {rows.map((row) => (
          <Pressable
            key={row.user.id}
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/player/[id]', params: { id: row.user.id } })}
            style={[styles.row, row.isMe && styles.me]}>
            <AppText variant="heading" style={styles.rank} color={row.rank <= 3 ? Colors.gold : Colors.textMuted}>
              {row.rank}
            </AppText>
            <Avatar name={row.user.pseudo} color={avatarColor(row.user.id)} size={40} />
            <View style={{ flex: 1, gap: 4 }}>
              <AppText variant="label" numberOfLines={1}>
                {row.user.pseudo}
                {row.isMe ? ' (toi)' : ''}
              </AppText>
              <DivisionBadge rating={row.rating} compact />
            </View>
            <AppText variant="heading" style={{ fontVariant: ['tabular-nums'] }}>
              {row.rating}
            </AppText>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm + 4,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.sm + 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  me: { borderColor: Colors.player, borderWidth: 2 },
  rank: { width: 32, textAlign: 'center' },
});
