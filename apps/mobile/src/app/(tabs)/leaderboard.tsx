import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { THEMES, getCategory } from '@qu1z/shared';

import { Chip, DemoNote, DivisionBadge, Segmented } from '@/components/social';
import { AppText, Avatar, Screen } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { PLAYERS, demoGlobalRating, demoRating } from '@/demo/data';
import { globalRating, useProgress } from '@/state/progress';
import { useSocial } from '@/state/social';

type Scope = 'world' | 'friends';

interface Row {
  id: string | null;
  name: string;
  color: string;
  country: string;
  rating: number;
}

export default function LeaderboardScreen() {
  const { playerName, stats } = useProgress();
  const { friends } = useSocial();
  const [scope, setScope] = useState<Scope>('world');
  const [themeId, setThemeId] = useState<string>('global');

  const players = scope === 'friends' ? PLAYERS.filter((p) => friends.includes(p.id)) : PLAYERS;
  const myRating = themeId === 'global' ? globalRating(stats) : stats[themeId]?.rating;
  const rows: Row[] = [
    ...players.map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      country: p.country,
      rating: themeId === 'global' ? demoGlobalRating(p.id) : demoRating(p.id, themeId),
    })),
    ...(myRating !== undefined
      ? [{ id: null, name: `${playerName} (toi)`, color: Colors.player, country: '🇫🇷', rating: myRating }]
      : []),
  ].sort((a, b) => b.rating - a.rating);

  return (
    <Screen inTabs>
      <AppText variant="title" style={{ paddingTop: Spacing.sm }}>
        Classements
      </AppText>

      <Segmented
        value={scope}
        onChange={setScope}
        options={[
          { value: 'world', label: 'Monde' },
          { value: 'friends', label: 'Amis' },
        ]}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.sm }}>
        <Chip label="Général" active={themeId === 'global'} onPress={() => setThemeId('global')} />
        {THEMES.map((t) => (
          <Chip
            key={t.id}
            label={t.name}
            color={getCategory(t.categoryId)?.color}
            active={themeId === t.id}
            onPress={() => setThemeId(t.id)}
          />
        ))}
      </ScrollView>

      {myRating === undefined && (
        <AppText variant="caption" muted>
          Joue un duel dans ce thème pour apparaître dans le classement.
        </AppText>
      )}

      <View style={{ gap: Spacing.sm }}>
        {rows.map((row, i) => (
          <Pressable
            key={row.id ?? 'me'}
            disabled={!row.id}
            onPress={() => row.id && router.push({ pathname: '/player/[id]', params: { id: row.id } })}
            style={[styles.row, !row.id && styles.me]}>
            <AppText variant="heading" style={styles.rank} color={i < 3 ? Colors.gold : Colors.textMuted}>
              {i + 1}
            </AppText>
            <Avatar name={row.name} color={row.color} size={40} />
            <View style={{ flex: 1, gap: 4 }}>
              <AppText variant="label" numberOfLines={1}>
                {row.country} {row.name}
              </AppText>
              <DivisionBadge rating={row.rating} compact />
            </View>
            <AppText variant="heading" style={{ fontVariant: ['tabular-nums'] }}>
              {row.rating}
            </AppText>
          </Pressable>
        ))}
      </View>

      <DemoNote>
        Classement par cote (on monte en gagnant, on descend en perdant). Les autres joueurs sont fictifs pour l'instant.
      </DemoNote>
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
  rank: { width: 28, textAlign: 'center' },
});
