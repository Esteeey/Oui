import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { getCategory, getTheme } from '@qu1z/shared';

import { AppText, Avatar } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { getPlayer, type Post } from '@/demo/data';
import { useProgress } from '@/state/progress';
import { useSocial } from '@/state/social';
import { timeAgo } from '@/utils/time';

/**
 * Publication écrite. `showTheme` affiche le thème d'une publication de thème
 * (inutile dans le fil du thème lui-même).
 */
export function PostCard({ post, showTheme = true }: { post: Post; showTheme?: boolean }) {
  const { playerName } = useProgress();
  const { liked, toggleLike } = useSocial();
  const author = post.authorId ? getPlayer(post.authorId) : undefined;
  const name = author?.name ?? playerName;
  const color = author?.color ?? Colors.player;
  const theme = post.target.kind === 'theme' ? getTheme(post.target.themeId) : undefined;
  const category = theme ? getCategory(theme.categoryId) : undefined;
  const isLiked = liked.has(post.id);

  const openAuthor = () =>
    author ? router.push({ pathname: '/player/[id]', params: { id: author.id } }) : router.push('/profile');

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Profil de ${name}`} onPress={openAuthor}>
          <Avatar name={name} color={color} size={42} />
        </Pressable>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="label" onPress={openAuthor}>
            {post.authorId ? name : `${name} (toi)`}
          </AppText>
          <View style={styles.meta}>
            {showTheme && theme && category && (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/theme/[id]', params: { id: theme.id } })}
                style={[styles.themeChip, { borderColor: category.color }]}>
                <AppText variant="caption" color={category.color}>
                  {category.icon} {theme.name}
                </AppText>
              </Pressable>
            )}
            <AppText variant="caption" muted>
              {showTheme && post.target.kind === 'profile' ? 'Sur son mur · ' : showTheme && theme ? '· ' : ''}
              {timeAgo(post.at)}
            </AppText>
          </View>
        </View>
      </View>

      <AppText style={{ lineHeight: 23 }}>{post.text}</AppText>

      <Pressable accessibilityRole="button" onPress={() => toggleLike(post.id)} style={styles.like}>
        <Ionicons name={isLiked ? 'heart' : 'heart-outline'} size={20} color={isLiked ? Colors.player : Colors.textMuted} />
        <AppText variant="caption" muted>
          Bravo · {post.likes + (isLiked ? 1 : 0)}
        </AppText>
      </Pressable>
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
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  themeChip: { borderWidth: 1, borderRadius: Radius.pill, paddingHorizontal: 8, paddingVertical: 1 },
  like: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
});
