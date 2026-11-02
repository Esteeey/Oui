import type { ReactNode } from 'react';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { OnlineDot } from '@/components/social';
import { AppText, Avatar } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import type { DemoPlayer } from '@/demo/data';

export function PlayerRow({ player, subtitle, right }: { player: DemoPlayer; subtitle: string; right?: ReactNode }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/player/[id]', params: { id: player.id } })}
      style={styles.row}>
      <View>
        <Avatar name={player.name} color={player.color} size={44} />
        <View style={styles.dot}>
          <OnlineDot online={player.online} />
        </View>
      </View>
      <View style={{ flex: 1 }}>
        <AppText variant="label">
          {player.country} {player.name}
        </AppText>
        <AppText variant="caption" muted numberOfLines={1}>
          {subtitle}
        </AppText>
      </View>
      {right}
    </Pressable>
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
  dot: { position: 'absolute', right: -1, bottom: -1 },
});
