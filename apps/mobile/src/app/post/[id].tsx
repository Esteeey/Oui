import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { MAX_COMMENT_LENGTH, type CommentView, type MediaView, type PostView, type UserSummary } from '@qu1z/shared';

import { AppNavBar, useKeyboardVisible, useNavBarHeight } from '@/components/app-nav-bar';
import { Photo } from '@/components/attachments';
import { GradientHeader, HeaderBack } from '@/components/header';
import { MentionSuggestions } from '@/components/mention-suggestions';
import { MoreMenu, type MoreMenuItem } from '@/components/more-menu';
import { PostCard, PostMenu } from '@/components/post-card';
import { RankBadge, rankLabel } from '@/components/rank';
import { ReportSheet, type ReportTarget } from '@/components/report-sheet';
import { RichText } from '@/components/rich-text';
import { AppText, Avatar, Button, Screen } from '@/components/ui';
import { Colors, Fonts, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { api, errorMessage, useApi } from '@/net/api';
import { pickImage, uploadImage, type PickedImage } from '@/net/media';
import { useGameServer } from '@/state/game-server';
import { avatarColor } from '@/utils/avatar';
import { timeAgo } from '@/utils/time';
import { Tap } from '@/components/tap';

/** Une ligne de commentaire : séparée de la suivante par un filet, sans carte individuelle. */
function CommentRow({ comment: c, isReply, onReply, onReport }: { comment: CommentView; isReply: boolean; onReply: () => void; onReport: () => void }) {
  const { playerId } = useGameServer();
  const [liked, setLiked] = useState<boolean | null>(null);
  const isLiked = liked ?? c.likedByMe;
  const likes = c.likes + (liked === null ? 0 : (liked ? 1 : 0) - (c.likedByMe ? 1 : 0));
  const openAuthor = () => router.push({ pathname: '/player/[id]', params: { id: c.author.id } });
  const toggleLike = () => {
    const next = !isLiked;
    setLiked(next);
    api(next ? 'PUT' : 'DELETE', `/api/comments/${c.id}/like`).catch(() => setLiked(null));
  };
  const items: MoreMenuItem[] = [{ label: 'Voir le profil', icon: 'person-outline', onPress: openAuthor }];
  if (c.author.id !== playerId) items.push({ label: 'Signaler', icon: 'flag-outline', destructive: true, onPress: onReport });

  return (
    <View style={[styles.comment, isReply && styles.reply]}>
      <Tap accessibilityRole="button" accessibilityLabel={`Profil de ${c.author.pseudo}`} onPress={openAuthor}>
        <Avatar name={c.author.pseudo} color={avatarColor(c.author.id)} uri={c.author.avatar} size={isReply ? 30 : 36} />
      </Tap>
      <View style={{ flex: 1, gap: 3 }}>
        <View style={styles.commentHead}>
          <AppText variant="label" style={styles.commentName} numberOfLines={1} onPress={openAuthor}>
            {c.author.pseudo}
          </AppText>
          <RankBadge small label={rankLabel(c.author.title, c.author.level)} />
          <AppText variant="caption" muted style={styles.commentTime} numberOfLines={1}>
            {timeAgo(c.createdAt)}
          </AppText>
          <MoreMenu items={items} />
        </View>
        {c.text ? <RichText text={c.text} mentions={c.mentions} style={styles.commentText} /> : null}
        {c.media && <Photo media={c.media} maxWidth={200} maxHeight={220} />}
        <View style={styles.commentActions}>
          <Tap accessibilityRole="button" accessibilityLabel={`J’aime, ${likes}`} accessibilityState={{ selected: isLiked }} hitSlop={8} onPress={toggleLike} style={styles.commentLike}>
            <Ionicons name={isLiked ? 'heart' : 'heart-outline'} size={15} color={isLiked ? Colors.accent : Colors.textMuted} />
            <AppText variant="caption" muted>
              {likes}
            </AppText>
          </Tap>
          <Tap accessibilityRole="button" hitSlop={8} onPress={onReply}>
            <AppText variant="caption" muted style={{ fontWeight: '600' }}>
              Répondre
            </AppText>
          </Tap>
        </View>
      </View>
    </View>
  );
}

/** Une publication, ses commentaires et les réponses (un niveau). */
export default function PostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const post = useApi<PostView>(`/api/posts/${id}`);
  const thread = useApi<{ comments: CommentView[] }>(`/api/posts/${id}/comments`);
  const likers = useApi<{ likers: UserSummary[] }>(`/api/posts/${id}/likers`);
  const { playerId, profile } = useGameServer();
  const navBarHeight = useNavBarHeight();
  const keyboard = useKeyboardVisible();
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<PickedImage | null>(null);
  const [replyTo, setReplyTo] = useState<CommentView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [order, setOrder] = useState<'best' | 'recent'>('best');
  const [reporting, setReporting] = useState<ReportTarget | null>(null);

  if (post.error) {
    return (
      <Screen back title="Publication">
        <AppText muted>Cette publication n’est pas disponible.</AppText>
      </Screen>
    );
  }

  const p = post.data;
  // Un serveur pas encore mis à jour n'envoie pas le nombre de j'aime des commentaires.
  const comments = (thread.data?.comments ?? []).map((c) => ({ ...c, likes: c.likes ?? 0 }));
  const roots = comments
    .filter((c) => !c.parentId)
    .sort((a, b) => (order === 'best' && b.likes !== a.likes ? b.likes - a.likes : b.createdAt - a.createdAt));
  const repliesOf = (rootId: string) => comments.filter((c) => c.parentId === rootId);
  const canSend = (!!text.trim() || !!photo) && !sending;

  const choosePhoto = async () => {
    setError(null);
    try {
      const picked = await pickImage('library');
      if (picked) setPhoto(picked);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const send = async () => {
    if (!canSend) return;
    setError(null);
    setSending(true);
    try {
      const media = photo ? await uploadImage<MediaView>(photo, '/api/media?purpose=post') : null;
      await api('POST', `/api/posts/${id}/comments`, { text, ...(replyTo ? { parentId: replyTo.id } : {}), ...(media ? { mediaId: media.id } : {}) });
      setText('');
      setPhoto(null);
      setReplyTo(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSending(false);
    }
  };

  const report = (c: CommentView) => setReporting({ type: 'comment', id: c.id, label: 'ce commentaire' });
  const playTheme = p?.target.kind === 'theme' ? p.target.themeId : null;
  const likerList = likers.data?.likers ?? [];
  const summary = p && (
    <View style={styles.summary}>
      {likerList.length > 0 && (
        <View style={styles.likers} accessibilityLabel="Personnes ayant aimé">
          {likerList.map((u, i) => (
            <View key={u.id} style={i > 0 && { marginLeft: -8 }}>
              <Avatar name={u.pseudo} color={avatarColor(u.id)} uri={u.avatar} size={26} />
            </View>
          ))}
        </View>
      )}
      <AppText variant="caption" muted style={{ flex: 1 }} numberOfLines={1}>
        {p.likes} j’aime · {p.comments} commentaire{p.comments > 1 ? 's' : ''}
      </AppText>
      {playTheme && <Button small label="Jouer" onPress={() => router.push({ pathname: '/theme/[id]', params: { id: playTheme } })} />}
    </View>
  );

  return (
    <View style={styles.screen}>
      <ReportSheet target={reporting} onClose={() => setReporting(null)} />
      <GradientHeader left={<HeaderBack />} title="Publication" right={p ? <PostMenu post={p} /> : undefined} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={styles.column}>
            {p && <PostCard post={p} linkToDetail={false} detail={summary} />}

            <View style={styles.titleRow}>
              <AppText variant="heading" style={{ fontSize: 16 }}>
                Commentaires
              </AppText>
              <AppText variant="caption" muted>
                {comments.length}
              </AppText>
            </View>
            <View style={styles.tabs} accessibilityRole="tablist">
              {(
                [
                  ['best', 'Meilleurs'],
                  ['recent', 'Plus récents'],
                ] as const
              ).map(([value, label]) => {
                const selected = order === value;
                return (
                  <Tap key={value} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => setOrder(value)} style={[styles.tab, selected && styles.tabActive]}>
                    <AppText variant="caption" color={selected ? Colors.onAccent : Colors.text} style={{ fontWeight: '600' }}>
                      {label}
                    </AppText>
                  </Tap>
                );
              })}
            </View>

            {roots.length > 0 && (
              <View style={styles.list}>
                {roots.map((c, i) => (
                  <View key={c.id} style={i > 0 && styles.separator}>
                    <CommentRow comment={c} isReply={false} onReply={() => setReplyTo(c)} onReport={() => report(c)} />
                    {repliesOf(c.id).map((r) => (
                      <CommentRow key={r.id} comment={r} isReply onReply={() => setReplyTo(r)} onReport={() => report(r)} />
                    ))}
                  </View>
                ))}
              </View>
            )}
            {thread.data && comments.length === 0 && <AppText muted>Sois le premier à commenter.</AppText>}
          </View>
        </ScrollView>

        <View style={[styles.inputBar, { marginBottom: keyboard ? 0 : navBarHeight }]}>
          <View style={styles.inputColumn}>
            {replyTo && (
              <Tap accessibilityRole="button" onPress={() => setReplyTo(null)}>
                <AppText variant="caption" color={Colors.accentInk}>
                  Réponse à {replyTo.author.pseudo} · annuler
                </AppText>
              </Tap>
            )}
            <MentionSuggestions text={text} onChange={setText} />
            {error && (
              <AppText variant="caption" color={Colors.wrong}>
                {error}
              </AppText>
            )}
            {photo && (
              <View style={styles.preview}>
                <Image source={{ uri: photo.uri }} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel="Photo jointe" />
                <Tap accessibilityRole="button" accessibilityLabel="Retirer la photo" onPress={() => setPhoto(null)} style={styles.previewClose}>
                  <Ionicons name="close" size={14} color={Colors.onAccent} />
                </Tap>
              </View>
            )}
            <View style={styles.inputRow}>
              <Avatar name={profile?.name ?? '?'} color={playerId ? avatarColor(playerId) : Colors.accent} uri={profile?.avatar} size={36} />
              <View style={styles.field}>
                <TextInput
                  value={text}
                  onChangeText={setText}
                  placeholder={replyTo ? `Répondre à ${replyTo.author.pseudo}…` : 'Écrire un commentaire…'}
                  placeholderTextColor={Colors.textMuted}
                  maxLength={MAX_COMMENT_LENGTH}
                  multiline
                  accessibilityLabel="Écrire un commentaire"
                  style={styles.fieldInput}
                />
                <Tap accessibilityRole="button" accessibilityLabel="Ajouter une image" hitSlop={8} onPress={choosePhoto}>
                  <Ionicons name="image-outline" size={22} color={Colors.accent} />
                </Tap>
              </View>
              {canSend && (
                <Tap accessibilityRole="button" accessibilityLabel="Envoyer le commentaire" hitSlop={6} onPress={send} style={styles.send}>
                  <Ionicons name="paper-plane" size={18} color={Colors.onAccent} />
                </Tap>
              )}
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
      <AppNavBar />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  scroll: { alignItems: 'center', paddingTop: Spacing.sm, paddingBottom: Spacing.md },
  column: { width: '100%', maxWidth: MaxContentWidth, paddingHorizontal: Spacing.md, gap: Spacing.sm + 4 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  likers: { flexDirection: 'row' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.xs },
  tabs: { flexDirection: 'row', gap: Spacing.sm },
  tab: { paddingHorizontal: Spacing.md, height: 32, justifyContent: 'center', borderRadius: Radius.xs, backgroundColor: Colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.border },
  tabActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  list: { backgroundColor: Colors.surface, borderRadius: Radius.md, paddingHorizontal: Spacing.sm + 4, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.border },
  separator: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
  comment: { flexDirection: 'row', gap: Spacing.sm + 2, alignItems: 'flex-start', paddingVertical: Spacing.sm + 2 },
  reply: { marginLeft: 46, paddingTop: 0 },
  commentHead: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 24 },
  commentName: { fontSize: 13, lineHeight: 18, flexShrink: 1 },
  commentTime: { marginLeft: 'auto', fontSize: 11, lineHeight: 15, flexShrink: 0 },
  commentText: { fontSize: 14, lineHeight: 20 },
  commentActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginTop: 2 },
  commentLike: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  inputBar: { alignItems: 'center', paddingVertical: Spacing.sm },
  inputColumn: { width: '100%', maxWidth: MaxContentWidth, paddingHorizontal: Spacing.md, gap: Spacing.xs + 2 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  field: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.surface, borderRadius: Radius.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.border, paddingHorizontal: Spacing.sm + 4, minHeight: 42 },
  fieldInput: { flex: 1, color: Colors.text, fontSize: 14, fontFamily: Fonts.regular, paddingVertical: 8, maxHeight: 96 },
  send: { width: 40, height: 40, borderRadius: Radius.sm, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  preview: { width: 64, height: 64, borderRadius: Radius.xs, overflow: 'hidden' },
  previewClose: { position: 'absolute', top: 3, right: 3, width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(14, 15, 43, 0.6)', alignItems: 'center', justifyContent: 'center' },
});
