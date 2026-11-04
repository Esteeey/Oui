import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { MAX_POST_LENGTH, STICKERS, type MediaView, type PostTarget, type StickerId } from '@qu1z/shared';

import { MentionSuggestions } from '@/components/mention-suggestions';
import { Sticker } from '@/components/sticker';
import { AppText, Avatar, Button } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { api, errorMessage } from '@/net/api';
import { pickImage, uploadImage, type PickedImage } from '@/net/media';
import { useGameServer } from '@/state/game-server';
import { avatarColor } from '@/utils/avatar';
import { Tap } from '@/components/tap';

/**
 * Rédaction d'une publication (mur ou fil de thème), envoyée au serveur. Mentionne avec @pseudo.
 * Joint au choix une photo ou un sticker du pack Qu1z.
 */
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
  const [sticker, setSticker] = useState<StickerId | null>(null);
  const [stickersOpen, setStickersOpen] = useState(false);
  const remaining = MAX_POST_LENGTH - text.length;
  const empty = !text.trim() && !photo && !sticker;

  const submit = async () => {
    if (sending || empty) return;
    setSending(true);
    setError(null);
    try {
      const media = photo ? await uploadImage<MediaView>(photo, '/api/media?purpose=post') : null;
      const where = target.kind === 'theme' ? { target: 'theme', themeId: target.themeId } : { target: 'profile' };
      await api('POST', '/api/posts', { ...where, text, ...(media ? { mediaId: media.id } : {}), ...(sticker ? { stickerId: sticker } : {}) });
      setText('');
      setPhoto(null);
      setSticker(null);
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
      if (picked) {
        setPhoto(picked);
        setSticker(null);
        setStickersOpen(false);
      }
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
          <Tap accessibilityRole="button" accessibilityLabel="Retirer la photo" onPress={() => setPhoto(null)} style={styles.remove}>
            <Ionicons name="close" size={18} color="#fff" />
          </Tap>
        </View>
      )}
      {sticker && (
        <View style={styles.stickerPreview}>
          <Sticker id={sticker} size={110} />
          <Tap accessibilityRole="button" accessibilityLabel="Retirer le sticker" onPress={() => setSticker(null)} style={styles.remove}>
            <Ionicons name="close" size={18} color="#fff" />
          </Tap>
        </View>
      )}
      {stickersOpen && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.xs }}>
          {STICKERS.map((s) => (
            <Tap
              key={s.id}
              accessibilityRole="button"
              accessibilityLabel={`Joindre le sticker ${s.label}`}
              onPress={() => {
                setSticker(s.id);
                setPhoto(null);
                setStickersOpen(false);
              }}
              style={styles.stickerCell}>
              <Sticker id={s.id} size={72} />
            </Tap>
          ))}
        </ScrollView>
      )}
      {error && <AppText variant="caption" color={Colors.wrong}>{error}</AppText>}
      <View style={styles.footer}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 }}>
          <Tap accessibilityRole="button" accessibilityLabel="Ajouter une photo" onPress={() => choose('library')} style={styles.icon}>
            <Ionicons name="image-outline" size={22} color={Colors.text} />
          </Tap>
          {Platform.OS !== 'web' && (
            <Tap accessibilityRole="button" accessibilityLabel="Prendre une photo" onPress={() => choose('camera')} style={styles.icon}>
              <Ionicons name="camera-outline" size={22} color={Colors.text} />
            </Tap>
          )}
          <Tap
            accessibilityRole="button"
            accessibilityLabel="Ajouter un sticker"
            accessibilityState={{ expanded: stickersOpen }}
            onPress={() => setStickersOpen((o) => !o)}
            style={styles.icon}>
            <Ionicons name={stickersOpen ? 'happy' : 'happy-outline'} size={22} color={stickersOpen ? Colors.accent : Colors.text} />
          </Tap>
          <AppText variant="caption" color={remaining < 20 ? Colors.gold : Colors.textMuted} style={{ flexShrink: 1 }}>
            {remaining} · @pseudo pour mentionner
          </AppText>
        </View>
        <Button label={sending ? 'Envoi…' : 'Publier'} onPress={submit} disabled={empty || sending} style={{ minWidth: 120 }} />
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
  stickerPreview: { alignSelf: 'flex-start' },
  stickerCell: { padding: 4, borderRadius: Radius.sm, backgroundColor: Colors.background },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.sm },
});
