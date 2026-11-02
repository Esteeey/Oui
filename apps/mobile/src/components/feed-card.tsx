import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { getCategory, getTheme } from '@qu1z/shared';

import { AppText, Avatar } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import type { FeedEvent } from '@/demo/data';
import { timeAgo } from '@/utils/time';

export interface FeedEntry {
  id: string;
  /** `null` pour le joueur lui-même. */
  playerId: string | null;
  name: string;
  color: string;
  themeId: string;
  /** Horodatage (ms). */
  at: number;
  likes: number;
  event: FeedEvent;
}

function describe(event: FeedEvent): { text: string; icon: React.ComponentProps<typeof Ionicons>['name']; color: string } {
  switch (event.kind) {
    case 'win':
      return { text: `a battu ${event.opponent} ${event.score} à ${event.opponentScore}`, icon: 'trophy', color: Colors.gold };
    case 'level':
      return { text: `a atteint le niveau ${event.level}`, icon: 'arrow-up-circle', color: Colors.opponent };
    case 'division':
      return { text: `est monté en division ${event.division}`, icon: 'shield', color: '#5FE3D0' };
    case 'perfect':
      return { text: 'a fait un sans-faute : 7 sur 7 !', icon: 'star', color: Colors.gold };
    case 'badge':
      return { text: `a débloqué le badge « ${event.badge} »`, icon: 'ribbon', color: Colors.player };
  }
}

export function FeedCard({
  entry,
  liked,
  onLike,
}: {
  entry: FeedEntry;
  liked: boolean;
  onLike: () => void;
}) {
  const theme = getTheme(entry.themeId);
  const category = theme ? getCategory(theme.categoryId) : undefined;
  const { text, icon, color } = describe(entry.event);
  const openPlayer = () => entry.playerId && router.push({ pathname: '/player/[id]', params: { id: entry.playerId } });

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Pressable onPress={openPlayer} disabled={!entry.playerId}>
          <Avatar name={entry.name} color={entry.color} size={44} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <AppText>
            <AppText variant="label" onPress={openPlayer}>
              {entry.name}
            </AppText>{' '}
            {text}
          </AppText>
          <AppText variant="caption" muted>
            {timeAgo(entry.at)}
          </AppText>
        </View>
        <Ionicons name={icon} size={26} color={color} />
      </View>

      {theme && category && (
        <Pressable
          onPress={() => router.push({ pathname: '/theme/[id]', params: { id: theme.id } })}
          style={[styles.theme, { borderColor: category.color }]}>
          <AppText>{category.icon}</AppText>
          <AppText variant="caption" color={category.color} style={{ flex: 1 }}>
            {theme.name}
          </AppText>
          <AppText variant="caption" muted>
            Jouer ce thème ›
          </AppText>
        </Pressable>
      )}

      <View style={styles.actions}>
        <Pressable accessibilityRole="button" onPress={onLike} style={styles.action}>
          <Ionicons name={liked ? 'heart' : 'heart-outline'} size={20} color={liked ? Colors.player : Colors.textMuted} />
          <AppText variant="caption" muted>
            Bravo · {entry.likes + (liked ? 1 : 0)}
          </AppText>
        </Pressable>
        {entry.playerId && theme && (
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.push({ pathname: '/duel/[themeId]', params: { themeId: theme.id, opponent: entry.playerId! } })
            }
            style={styles.action}>
            <Ionicons name="flash" size={18} color={Colors.opponent} />
            <AppText variant="caption" color={Colors.opponent}>
              Défier {entry.name}
            </AppText>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: Spacing.sm + 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  header: { flexDirection: 'row', gap: Spacing.sm + 4, alignItems: 'center' },
  theme: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm + 4,
    paddingVertical: Spacing.sm,
  },
  actions: { flexDirection: 'row', gap: Spacing.lg },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
