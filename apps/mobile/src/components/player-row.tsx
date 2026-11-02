import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { UserSummary } from '@qu1z/shared';

import { AppText, Avatar } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { avatarColor } from '@/utils/avatar';

/** Ligne de joueur : avatar, pseudo, titre équipé (et niveau si demandé). Toute la ligne ouvre le profil. */
export function UserRow({ user, showLevel = false, right, subtitle }: { user: UserSummary; showLevel?: boolean; right?: ReactNode; subtitle?: string }) {
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Profil de ${user.pseudo}`}
        onPress={() => router.push({ pathname: '/player/[id]', params: { id: user.id } })}
        style={styles.main}>
        <Avatar name={user.pseudo} color={avatarColor(user.id)} size={44} />
        <View style={{ flex: 1 }}>
          <AppText variant="label" numberOfLines={1}>
            {user.pseudo}
          </AppText>
          <AppText variant="caption" muted numberOfLines={1}>
            {subtitle ?? [user.title, showLevel ? `Niveau ${user.level}` : null].filter(Boolean).join(' · ')}
          </AppText>
        </View>
      </Pressable>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.sm + 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm + 4 },
});
