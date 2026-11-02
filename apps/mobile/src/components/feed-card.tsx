import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { getCategory, getTheme, type ActivityView } from '@qu1z/shared';

import { AppText, Avatar } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { avatarColor } from '@/utils/avatar';
import { timeAgo } from '@/utils/time';

function describe(event: ActivityView['event']): { text: string; icon: React.ComponentProps<typeof Ionicons>['name']; color: string } {
  switch (event.kind) {
    case 'win':
      return { text: `a battu ${event.opponent} ${event.score} à ${event.opponentScore}`, icon: 'trophy', color: Colors.gold };
    case 'level':
      return { text: `a atteint le niveau ${event.level}`, icon: 'arrow-up-circle', color: Colors.opponent };
    case 'perfect':
      return { text: 'a fait un sans-faute : 7 sur 7 !', icon: 'star', color: Colors.gold };
  }
}

/** Activité de jeu (réelle) d'un joueur suivi ou du joueur lui-même. */
export function ActivityCard({ activity }: { activity: ActivityView }) {
  const theme = getTheme(activity.themeId);
  const category = theme ? getCategory(theme.categoryId) : undefined;
  const { text, icon, color } = describe(activity.event);
  const openPlayer = () => router.push({ pathname: '/player/[id]', params: { id: activity.user.id } });

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Profil de ${activity.user.pseudo}`} onPress={openPlayer}>
          <Avatar name={activity.user.pseudo} color={avatarColor(activity.user.id)} size={42} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <AppText>
            <AppText variant="label" onPress={openPlayer}>
              {activity.user.pseudo}
            </AppText>{' '}
            {text}
          </AppText>
          <AppText variant="caption" muted>
            {timeAgo(activity.createdAt)}
          </AppText>
        </View>
        <Ionicons name={icon} size={26} color={color} />
      </View>
      {theme && category && (
        <Pressable
          accessibilityRole="button"
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
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.md, gap: Spacing.sm + 4, borderWidth: 1, borderColor: Colors.border },
  header: { flexDirection: 'row', gap: Spacing.sm + 4, alignItems: 'center' },
  theme: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderWidth: 1, borderRadius: Radius.sm, paddingHorizontal: Spacing.sm + 4, paddingVertical: Spacing.sm },
});
