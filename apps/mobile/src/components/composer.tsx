import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { MAX_POST_LENGTH, type MediaView, type PostTarget } from '@qu1z/shared';

import { MentionSuggestions } from '@/components/mention-suggestions';
import { AppText, Avatar, Button } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { api, errorMessage } from '@/net/api';
import { pickImage, uploadImage, type PickedImage } from '@/net/media';
import { useGameServer } from '@/state/game-server';
import { avatarColor } from '@/utils/avatar';

/** Rédaction d'une publication (mur ou fil de thème), envoyée au serveur. Mentionne avec @pseudo. */
export function Composer({
  target,
  placeholder,
  onPublished,
  autoFocus,
}: {
  target: PostTarget;
  placeholder: string;
  onPublished?: () => void;
  autoFocus?: boolean;
}) {
  const { profile, playerId } = useGameServer();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photo, setPhoto] = useState<PickedImage | null>(null);
  const remaining = MAX_POST_LENGTH - text.length;

  const submit = async () => {
    if (sending || (!text.trim() && !photo)) return;
    setSending(true);
    setError(null);
    try {
      const media = photo ? await uploadImage<MediaView>(photo, '/api/media?purpose=post') : null;
      const where = target.kind === 'theme' ? { target: 'theme', themeId: target.themeId } : { target: 'profile' };
      await api('POST', '/api/posts', { ...where, text, ...(media ? { mediaId: media.id } : {}) });
      setText('');
      setPhoto(null);
      onPublished?.();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSending(false);
    }
  };

  const choose = async (source: 'library' | 'camera') => {
    setError(null);
    try {
      const picked = await pickImage(source);
      if (picked) setPhoto(picked);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <View style={styles.box}>
      <View style={styles.row}>
        <Avatar name={profile?.name ?? '?'} color={playerId ? avatarColor(playerId) : Colors.accent} size={36} uri={profile?.avatar} />
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={placeholder}
          placeholderTextColor={Colors.textMuted}
          multiline
          maxLength={MAX_POST_LENGTH}
          autoFocus={autoFocus}
          accessibilityLabel={placeholder}
          style={styles.input}
        />
      </View>
      <MentionSuggestions text={text} onChange={setText} />
      {photo && (
        <View>
          <Image source={{ uri: photo.uri }} style={[styles.preview, { aspectRatio: photo.width / photo.height || 1 }]} contentFit="cover" accessibilityLabel="Photo jointe" />
          <Pressable accessibilityRole="button" accessibilityLabel="Retirer la photo" onPress={() => setPhoto(null)} style={styles.remove}>
            <Ionicons name="close" size={18} color="#fff" />
          </Pressable>
        </View>
      )}
      {error && <AppText variant="caption" color={Colors.wrong}>{error}</AppText>}
      <View style={styles.footer}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Ajouter une photo" onPress={() => choose('library')} style={styles.icon}>
            <Ionicons name="image-outline" size={22} color={Colors.text} />
          </Pressable>
          {Platform.OS !== 'web' && (
            <Pressable accessibilityRole="button" accessibilityLabel="Prendre une photo" onPress={() => choose('camera')} style={styles.icon}>
              <Ionicons name="camera-outline" size={22} color={Colors.text} />
            </Pressable>
          )}
          <AppText variant="caption" color={remaining < 20 ? Colors.gold : Colors.textMuted} style={{ flexShrink: 1 }}>
            {remaining} · @pseudo pour mentionner
          </AppText>
        </View>
        <Button label={sending ? 'Envoi…' : 'Publier'} onPress={submit} disabled={(!text.trim() && !photo) || sending} style={{ minWidth: 120 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.sm },
  row: { flexDirection: 'row', gap: Spacing.sm + 4, alignItems: 'flex-start' },
  input: { flex: 1, color: Colors.text, fontSize: 16, minHeight: 60, paddingTop: 8, textAlignVertical: 'top' },
  preview: { width: '100%', maxHeight: 320, borderRadius: Radius.sm },
  remove: { position: 'absolute', top: 8, right: 8, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  icon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.sm },
});
