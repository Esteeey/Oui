import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { MAX_COMMENT_LENGTH, type CommentView, type PostView } from '@qu1z/shared';

import { MentionSuggestions } from '@/components/mention-suggestions';
import { PostCard } from '@/components/post-card';
import { RichText } from '@/components/rich-text';
import { SectionHeader } from '@/components/social';
import { AppText, Avatar, Button, Screen } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { api, errorMessage, useApi } from '@/net/api';
import { avatarColor } from '@/utils/avatar';
import { timeAgo } from '@/utils/time';
import { Tap } from '@/components/tap';

/** Une publication, ses commentaires et les réponses (un niveau). */
export default function PostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const post = useApi<PostView>(`/api/posts/${id}`);
  const thread = useApi<{ comments: CommentView[] }>(`/api/posts/${id}/comments`);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<CommentView | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (post.error) {
    return (
      <Screen back title="Publication">
        <AppText muted>Cette publication n’est pas disponible.</AppText>
      </Screen>
    );
  }

  const comments = thread.data?.comments ?? [];
  const roots = comments.filter((c) => !c.parentId);
  const repliesOf = (rootId: string) => comments.filter((c) => c.parentId === rootId);

  const send = async () => {
    if (!text.trim()) return;
    setError(null);
    try {
      await api('POST', `/api/posts/${id}/comments`, { text, ...(replyTo ? { parentId: replyTo.id } : {}) });
      setText('');
      setReplyTo(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const renderComment = (c: CommentView, isReply: boolean) => (
    <View key={c.id} style={[styles.comment, isReply && { marginLeft: 40 }]}>
      <Tap
        accessibilityRole="button"
        accessibilityLabel={`Profil de ${c.author.pseudo}`}
        onPress={() => router.push({ pathname: '/player/[id]', params: { id: c.author.id } })}>
        <Avatar name={c.author.pseudo} color={avatarColor(c.author.id)} uri={c.author.avatar} size={32} />
      </Tap>
      <View style={{ flex: 1, gap: 4 }}>
        <View style={styles.bubble}>
          <AppText variant="caption">
            {c.author.pseudo}{' '}
            <AppText variant="caption" muted>
              · {timeAgo(c.createdAt)}
            </AppText>
          </AppText>
          <RichText text={c.text} mentions={c.mentions} />
        </View>
        <Tap accessibilityRole="button" onPress={() => setReplyTo(c)} style={{ alignSelf: 'flex-start', padding: 4 }}>
          <AppText variant="caption" muted>
            Répondre
          </AppText>
        </Tap>
      </View>
    </View>
  );

  return (
    <Screen back title="Publication">
      {post.data && <PostCard post={post.data} linkToDetail={false} />}

      <SectionHeader title={`Commentaires · ${comments.length}`} />
      {roots.map((c) => (
        <View key={c.id} style={{ gap: Spacing.sm }}>
          {renderComment(c, false)}
          {repliesOf(c.id).map((r) => renderComment(r, true))}
        </View>
      ))}
      {thread.data && comments.length === 0 && <AppText muted>Sois le premier à commenter.</AppText>}

      <View style={styles.input}>
        {replyTo && (
          <Tap accessibilityRole="button" onPress={() => setReplyTo(null)}>
            <AppText variant="caption" color={Colors.opponent}>
              Réponse à {replyTo.author.pseudo} · annuler
            </AppText>
          </Tap>
        )}
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={replyTo ? `Répondre à ${replyTo.author.pseudo}…` : 'Écrire un commentaire…'}
          placeholderTextColor={Colors.textMuted}
          maxLength={MAX_COMMENT_LENGTH}
          multiline
          accessibilityLabel="Écrire un commentaire"
          style={styles.field}
        />
        <MentionSuggestions text={text} onChange={setText} />
        {error && <AppText variant="caption" color={Colors.wrong}>{error}</AppText>}
        <Button label="Envoyer" onPress={send} disabled={!text.trim()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  comment: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start' },
  bubble: { backgroundColor: Colors.surface, borderRadius: Radius.md, paddingHorizontal: Spacing.sm + 4, paddingVertical: Spacing.sm, gap: 2 },
  input: { gap: Spacing.sm, backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, padding: Spacing.sm + 4 },
  field: { color: Colors.text, fontSize: 16, minHeight: 44, textAlignVertical: 'top' },
});
