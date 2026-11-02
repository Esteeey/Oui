import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { BackButton } from '@/components/back-button';
import { PostCard } from '@/components/post-card';
import { SectionHeader } from '@/components/social';
import { AppText, Avatar, Button, Screen } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { getPlayer } from '@/demo/data';
import { useProgress } from '@/state/progress';
import { MAX_COMMENT_LENGTH, commentsOf, useSocial } from '@/state/social';
import { timeAgo } from '@/utils/time';

/** Une publication et ses commentaires. */
export default function PostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { posts, comments, addComment } = useSocial();
  const { playerName } = useProgress();
  const [text, setText] = useState('');
  const post = posts.find((p) => p.id === id);
  if (!post) return <Redirect href="/" />;
  const thread = commentsOf(comments, post.id);

  const send = () => {
    if (addComment(post.id, text)) setText('');
  };

  return (
    <Screen>
      <BackButton />
      <PostCard post={post} linkToDetail={false} />

      <SectionHeader title={`Commentaires · ${thread.length}`} />
      {thread.map((c) => {
        const author = c.authorId ? getPlayer(c.authorId) : undefined;
        const name = author?.name ?? playerName;
        return (
          <View key={c.id} style={styles.comment}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Profil de ${name}`}
              onPress={() =>
                author ? router.push({ pathname: '/player/[id]', params: { id: author.id } }) : router.push('/profile')
              }>
              <Avatar name={name} color={author?.color ?? Colors.player} size={32} />
            </Pressable>
            <View style={styles.bubble}>
              <AppText variant="caption">
                {author ? name : `${name} (toi)`}{' '}
                <AppText variant="caption" muted>
                  · {timeAgo(c.at)}
                </AppText>
              </AppText>
              <AppText>{c.text}</AppText>
            </View>
          </View>
        );
      })}
      {thread.length === 0 && <AppText muted>Sois le premier à commenter.</AppText>}

      <View style={styles.input}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Écrire un commentaire…"
          placeholderTextColor={Colors.textMuted}
          maxLength={MAX_COMMENT_LENGTH}
          multiline
          accessibilityLabel="Écrire un commentaire"
          style={styles.field}
        />
        <Button label="Envoyer" onPress={send} disabled={!text.trim()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  comment: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start' },
  bubble: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm + 4,
    paddingVertical: Spacing.sm,
    gap: 2,
  },
  input: {
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.sm + 4,
  },
  field: { color: Colors.text, fontSize: 16, minHeight: 44, textAlignVertical: 'top' },
});
