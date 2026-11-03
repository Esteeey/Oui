import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { getCategory, getTheme, type PostView } from '@qu1z/shared';

import { Photo } from '@/components/attachments';
import { ReportSheet } from '@/components/report-sheet';
import { RichText } from '@/components/rich-text';
import { Sticker } from '@/components/sticker';
import { AppText, Avatar } from '@/components/ui';
import { Colors, Radius, Shadow, Spacing } from '@/constants/theme';
import { api } from '@/net/api';
import { useGameServer } from '@/state/game-server';
import { avatarColor } from '@/utils/avatar';
import { timeAgo } from '@/utils/time';

/** Publication réelle (servie par l'API, déjà filtrée par les blocages et la confidentialité). */
export function PostCard({
  post,
  showTheme = true,
  linkToDetail = true,
}: {
  post: PostView;
  showTheme?: boolean;
  /** Le bouton commentaires ouvre la page de la publication (désactivé sur cette page). */
  linkToDetail?: boolean;
}) {
  // Affichage immédiat du « Bravo », confirmé par le serveur.
  const [liked, setLiked] = useState<boolean | null>(null);
  const [reporting, setReporting] = useState(false);
  const { playerId } = useGameServer();
  const isLiked = liked ?? post.likedByMe;
  const likes = post.likes + (liked === null ? 0 : (liked ? 1 : 0) - (post.likedByMe ? 1 : 0));
  const theme = post.target.kind === 'theme' ? getTheme(post.target.themeId) : undefined;
  const category = theme ? getCategory(theme.categoryId) : undefined;
  const openAuthor = () => router.push({ pathname: '/player/[id]', params: { id: post.author.id } });

  const toggleLike = () => {
    const next = !isLiked;
    setLiked(next);
    api(next ? 'PUT' : 'DELETE', `/api/posts/${post.id}/like`).catch(() => setLiked(null));
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Profil de ${post.author.pseudo}`} onPress={openAuthor}>
          <Avatar name={post.author.pseudo} color={avatarColor(post.author.id)} uri={post.author.avatar} size={52} borderColor={Colors.accent} />
        </Pressable>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="heading" onPress={openAuthor}>
            {post.author.pseudo}
            {post.author.title ? (
              <AppText variant="caption" color={Colors.gold}>
                {'  '}
                {post.author.title}
              </AppText>
            ) : null}
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
              {timeAgo(post.createdAt)}
            </AppText>
          </View>
        </View>
      </View>

      {post.text ? <RichText text={post.text} mentions={post.mentions} style={{ lineHeight: 23 }} /> : null}
      {post.media && <Photo media={post.media} maxWidth={560} maxHeight={420} />}
      {post.sticker && <Sticker id={post.sticker} size={140} />}

      <View style={styles.actions}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Bravo, ${likes}`} accessibilityState={{ selected: isLiked }} onPress={toggleLike} style={styles.action}>
          <Ionicons name={isLiked ? 'heart' : 'heart-outline'} size={26} color={isLiked ? Colors.accent : Colors.text} />
          <AppText variant="label">{likes}</AppText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${post.comments} commentaires`}
          disabled={!linkToDetail}
          onPress={() => router.push({ pathname: '/post/[id]', params: { id: post.id } })}
          style={styles.action}>
          <Ionicons name="chatbubble-outline" size={24} color={Colors.text} />
          <AppText variant="label">{post.comments}</AppText>
        </Pressable>
        {post.author.id !== playerId && (
          <Pressable accessibilityRole="button" accessibilityLabel="Signaler la publication" onPress={() => setReporting(true)} style={[styles.action, { marginLeft: 'auto' }]}>
            <Ionicons name="flag-outline" size={22} color={Colors.text} />
          </Pressable>
        )}
      </View>
      <ReportSheet target={reporting ? { type: 'post', id: post.id, label: 'cette publication' } : null} onClose={() => setReporting(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: Spacing.sm + 4,
    ...Shadow,
  },
  header: { flexDirection: 'row', gap: Spacing.sm + 4, alignItems: 'center' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  themeChip: { borderWidth: 1, borderRadius: Radius.pill, paddingHorizontal: 8, paddingVertical: 1 },
  actions: { flexDirection: 'row', gap: Spacing.xl, paddingTop: Spacing.xs },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32 },
});
