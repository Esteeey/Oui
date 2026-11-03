import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { getCategory, getTheme, type ActivityView } from '@qu1z/shared';

import { AppText, Avatar } from '@/components/ui';
import { Colors, Gradients, Radius, Shadow, Spacing } from '@/constants/theme';
import { avatarColor } from '@/utils/avatar';
import { timeAgo } from '@/utils/time';

function describe(event: ActivityView['event']): { text: string; emoji: string; banner: string; pill?: string } {
  switch (event.kind) {
    case 'win':
      return { text: `a battu ${event.opponent}`, emoji: '🏆', banner: 'Victoire !', pill: `Score : ${event.score} – ${event.opponentScore}` };
    case 'level':
      return { text: `a atteint le niveau ${event.level}`, emoji: '🚀', banner: `Niveau ${event.level} !` };
    case 'perfect':
      return { text: 'a fait un sans-faute', emoji: '⭐', banner: 'Sans-faute !', pill: 'Score : 7 / 7' };
  }
}

/** Activité de jeu (réelle) d'un joueur suivi ou du joueur lui-même. */
export function ActivityCard({ activity }: { activity: ActivityView }) {
  const theme = getTheme(activity.themeId);
  const category = theme ? getCategory(theme.categoryId) : undefined;
  const { text, emoji, banner, pill } = describe(activity.event);
  const openPlayer = () => router.push({ pathname: '/player/[id]', params: { id: activity.user.id } });
  const openTheme = () => theme && router.push({ pathname: '/theme/[id]', params: { id: theme.id } });

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Profil de ${activity.user.pseudo}`} onPress={openPlayer}>
          <Avatar name={activity.user.pseudo} color={avatarColor(activity.user.id)} uri={activity.user.avatar} size={52} borderColor={Colors.accent} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <AppText variant="heading" onPress={openPlayer} numberOfLines={1}>
            {activity.user.pseudo}
          </AppText>
          <AppText variant="caption" muted numberOfLines={2}>
            {text} · {timeAgo(activity.createdAt)}
          </AppText>
        </View>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={theme ? `Jouer : ${theme.name}` : banner} onPress={openTheme}>
        <LinearGradient colors={Gradients.banner} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.banner}>
          <AppText style={{ fontSize: 38 }}>{emoji}</AppText>
          <View style={styles.divider} />
          <View style={{ flex: 1, gap: 6 }}>
            <AppText variant="heading" color={Colors.onAccent} numberOfLines={1}>
              {banner}
            </AppText>
            {pill ? (
              <View style={styles.pill}>
                <AppText variant="label" color={Colors.onAccent} style={{ fontSize: 14 }}>
                  {pill}
                </AppText>
              </View>
            ) : (
              <AppText variant="caption" color="rgba(255,255,255,0.8)">
                {category?.icon} {theme?.name}
              </AppText>
            )}
          </View>
          {theme && (
            <View style={styles.play}>
              <Ionicons name="play" size={22} color={Colors.accent} />
            </View>
          )}
        </LinearGradient>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.md, gap: Spacing.sm + 4, ...Shadow },
  header: { flexDirection: 'row', gap: Spacing.sm + 4, alignItems: 'center' },
  banner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderRadius: Radius.md, paddingVertical: Spacing.md, paddingHorizontal: Spacing.md + 4 },
  divider: { width: 2, alignSelf: 'stretch', marginVertical: 4, backgroundColor: 'rgba(255,255,255,0.35)', borderRadius: 1 },
  pill: { alignSelf: 'flex-start', backgroundColor: Colors.accent, borderRadius: Radius.pill, paddingHorizontal: 14, paddingVertical: 4 },
  play: { width: 48, height: 42, borderRadius: Radius.sm, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
});
