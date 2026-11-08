import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Share, StyleSheet, useWindowDimensions, View } from 'react-native';

import { getTheme, type PostView } from '@qu1z/shared';

import { Photo } from '@/components/attachments';
import { ChallengeBanner, FeedCardHeader, feedCard } from '@/components/feed-parts';
import { MoreMenu, type MoreMenuItem } from '@/components/more-menu';
import { ReportSheet } from '@/components/report-sheet';
import { RichText } from '@/components/rich-text';
import { Sticker } from '@/components/sticker';
import { AppText } from '@/components/ui';
import { Colors, MaxContentWidth, Spacing } from '@/constants/theme';
import { api } from '@/net/api';
import { useGameServer } from '@/state/game-server';
import { Tap } from '@/components/tap';

function sharePost(post: PostView): void {
  Share.share({ message: `${post.author.pseudo} sur QuizX${post.text ? ` : « ${post.text} »` : ''}` }).catch(() => {});
}

/** Menu « trois points » d'une publication : partage, et signalement si elle n'est pas de moi. */
export function PostMenu({ post }: { post: PostView }) {
  const { playerId } = useGameServer();
  const [reporting, setReporting] = useState(false);
  const items: MoreMenuItem[] = [{ label: 'Partager', icon: 'arrow-redo-outline', onPress: () => sharePost(post) }];
  if (post.author.id !== playerId) items.push({ label: 'Signaler', icon: 'flag-outline', destructive: true, onPress: () => setReporting(true) });
  return (
    <>
      <MoreMenu items={items} />
      <ReportSheet target={reporting ? { type: 'post', id: post.id, label: 'cette publication' } : null} onClose={() => setReporting(false)} />
    </>
  );
}

/** Publication réelle (servie par l'API, déjà filtrée par les blocages et la confidentialité). */
export function PostCard({
  post,
  showTheme = true,
  linkToDetail = true,
  detail,
  screenMargin = Spacing.md,
}: {
  post: PostView;
  showTheme?: boolean;
  /** Le bouton commentaires ouvre la page de la publication (désactivé sur cette page). */
  linkToDetail?: boolean;
  /** Contenu ajouté sur la page de la publication, dont le menu passe dans l'en-tête. */
  detail?: ReactNode;
  /** Marge entre la carte et le bord de l'écran, pour dimensionner les photos. */
  screenMargin?: number;
}) {
  // Affichage immédiat du « J'aime », confirmé par le serveur.
  const [liked, setLiked] = useState<boolean | null>(null);
  const { width } = useWindowDimensions();
  const isLiked = liked ?? post.likedByMe;
  const likes = post.likes + (liked === null ? 0 : (liked ? 1 : 0) - (post.likedByMe ? 1 : 0));
  const theme = post.target.kind === 'theme' ? getTheme(post.target.themeId) : undefined;
  const openPost = () => router.push({ pathname: '/post/[id]', params: { id: post.id } });

  const toggleLike = () => {
    const next = !isLiked;
    setLiked(next);
    api(next ? 'PUT' : 'DELETE', `/api/posts/${post.id}/like`).catch(() => setLiked(null));
  };

  return (
    <View style={styles.card}>
      <FeedCardHeader user={post.author} createdAt={post.createdAt} right={!detail ? <PostMenu post={post} /> : undefined} />

      {post.text ? <RichText text={post.text} mentions={post.mentions} style={styles.text} /> : null}
      {post.media && <Photo media={post.media} maxWidth={Math.min(width, MaxContentWidth) - 2 * screenMargin - 20} maxHeight={320} />}
      {post.sticker && <Sticker id={post.sticker} size={96} />}
      {showTheme && theme && !detail && <ChallengeBanner theme={theme} />}

      {detail}

      <View style={styles.actions}>
        <View style={styles.actionSlot}>
          <Tap accessibilityRole="button" accessibilityLabel={`J’aime, ${likes}`} accessibilityState={{ selected: isLiked }} onPress={toggleLike} style={styles.action}>
            <Ionicons name={isLiked ? 'heart' : 'heart-outline'} size={21} color="#FF2E93" />
            <AppText color={Colors.ink} style={styles.count}>
              {likes}
            </AppText>
          </Tap>
        </View>
        <View style={[styles.actionSlot, { alignItems: 'center' }]}>
          <Tap accessibilityRole="button" accessibilityLabel={`Commenter, ${post.comments}`} disabled={!linkToDetail} onPress={openPost} style={styles.action}>
            <Ionicons name="chatbubble-outline" size={20} color={Colors.ink} />
            <AppText color={Colors.ink} style={styles.count}>
              {post.comments}
            </AppText>
          </Tap>
        </View>
        <View style={[styles.actionSlot, { alignItems: 'flex-end' }]}>
          <Tap accessibilityRole="button" accessibilityLabel="Partager" onPress={() => sharePost(post)} style={styles.action}>
            <Ionicons name="arrow-redo-outline" size={21} color={Colors.ink} />
          </Tap>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: feedCard,
  text: { fontSize: 14, lineHeight: 18, paddingHorizontal: 7 },
  actions: { flexDirection: 'row', paddingHorizontal: 7 },
  actionSlot: { flex: 1, alignItems: 'flex-start' },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36 },
  count: { fontSize: 14, lineHeight: 19, fontWeight: '600' },
});
