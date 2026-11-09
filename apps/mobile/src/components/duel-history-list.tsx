import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { getTheme, type DuelRecord } from '@qu1z/shared';

import { Tap } from '@/components/tap';
import { AppText } from '@/components/ui';
import { Colors, Radius, Shadow, Spacing } from '@/constants/theme';

const OUTCOME = {
  win: { label: 'Victoire', color: Colors.correct },
  loss: { label: 'Défaite', color: Colors.wrong },
  draw: { label: 'Égalité', color: Colors.opponent },
} as const;

/** Liste des duels joués : résultat, adversaire, thème et score. */
export function DuelHistoryList({ duels }: { duels: DuelRecord[] }) {
  if (duels.length === 0) {
    return (
      <AppText muted style={styles.empty}>
        Joue ton premier duel pour commencer ta progression.
      </AppText>
    );
  }
  return duels.map((d) => {
    const mine = d.player.reduce((t, a) => t + a.points, 0);
    const theirs = d.opponent.reduce((t, a) => t + a.points, 0);
    const outcome = OUTCOME[d.outcome];
    return (
      <Tap key={d.id} onPress={() => d.opponentId && router.push({ pathname: '/player/[id]', params: { id: d.opponentId } })} style={styles.duel}>
        <View style={[styles.duelOutcome, { backgroundColor: outcome.color }]} />
        <View style={{ flex: 1 }}>
          <AppText variant="label">contre {d.opponentName}</AppText>
          <AppText variant="caption" muted>
            {getTheme(d.themeId)?.name} · {d.ratingDelta >= 0 ? '+' : ''}
            {d.ratingDelta} cote
          </AppText>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <AppText variant="label" color={outcome.color}>
            {outcome.label}
          </AppText>
          <AppText variant="caption" muted>
            {mine} – {theirs}
          </AppText>
        </View>
      </Tap>
    );
  });
}

const styles = StyleSheet.create({
  empty: { textAlign: 'center', paddingVertical: Spacing.lg },
  duel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm + 4,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.sm + 4,
    ...Shadow,
  },
  duelOutcome: { width: 6, alignSelf: 'stretch', borderRadius: 3 },
});
