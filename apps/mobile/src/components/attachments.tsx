import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { STICKERS, type Attachment, type GifView, type MediaView, type StickerId } from '@qu1z/shared';

import { Sticker } from '@/components/sticker';
import { AppText } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { api, errorMessage } from '@/net/api';
import { mediaUri } from '@/net/media';

/** Taille d'affichage d'une image dans une bulle ou une carte, en gardant ses proportions. */
function fit(width: number, height: number, maxWidth: number, maxHeight: number) {
  const ratio = Math.min(maxWidth / width, maxHeight / height, 1);
  return { width: Math.round(width * ratio), height: Math.round(height * ratio) };
}

/** Photo touchable qui s'ouvre en plein écran. */
export function Photo({ media, maxWidth = 240, maxHeight = 300 }: { media: Pick<MediaView, 'url' | 'width' | 'height'>; maxWidth?: number; maxHeight?: number }) {
  const [open, setOpen] = useState(false);
  const size = fit(media.width, media.height, maxWidth, maxHeight);
  const uri = mediaUri(media.url)!;
  return (
    <>
      <Pressable accessibilityRole="imagebutton" accessibilityLabel="Agrandir la photo" onPress={() => setOpen(true)}>
        <Image source={{ uri }} style={[size, { borderRadius: Radius.sm, backgroundColor: Colors.surfaceRaised }]} contentFit="cover" />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable accessibilityRole="button" accessibilityLabel="Fermer" onPress={() => setOpen(false)} style={styles.viewer}>
          <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="contain" />
          <View style={styles.viewerClose}>
            <Ionicons name="close" size={26} color="#fff" />
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

/** Contenu visuel d'un message : photo, GIF ou sticker. */
export function AttachmentView({ attachment }: { attachment: Attachment }) {
  switch (attachment.kind) {
    case 'image':
      return <Photo media={attachment.media} />;
    case 'gif': {
      const size = fit(attachment.gif.width, attachment.gif.height, 220, 220);
      return <Image source={{ uri: attachment.gif.url }} style={[size, { borderRadius: Radius.sm }]} contentFit="cover" accessibilityLabel="GIF" autoplay />;
    }
    case 'sticker':
      return <Sticker id={attachment.stickerId} size={130} />;
  }
}

type Tab = 'stickers' | 'gifs';

/**
 * Plateau de pièces jointes de la messagerie : photo (galerie, appareil photo), stickers originaux, GIF.
 * Les GIF n'apparaissent que si le serveur a une clé GIPHY ou Tenor.
 */
export function AttachmentTray({
  onPhoto,
  onSticker,
  onGif,
}: {
  onPhoto: (source: 'library' | 'camera') => void;
  onSticker: (id: StickerId) => void;
  onGif: (gif: GifView) => void;
}) {
  const [tab, setTab] = useState<Tab>('stickers');
  const [query, setQuery] = useState('');
  const [gifs, setGifs] = useState<{ available: boolean; provider?: string; gifs: GifView[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (tab !== 'gifs') return;
    const t = setTimeout(() => {
      api<{ available: boolean; provider?: string; gifs: GifView[] }>('GET', `/api/gifs?q=${encodeURIComponent(query.trim())}`)
        .then((r) => {
          setGifs(r);
          setError(null);
        })
        .catch((e) => setError(errorMessage(e)));
    }, 350);
    return () => clearTimeout(t);
  }, [tab, query]);

  return (
    <View style={styles.tray}>
      <View style={styles.trayRow}>
        <TrayButton icon="images" label="Galerie" onPress={() => onPhoto('library')} />
        {Platform.OS !== 'web' && <TrayButton icon="camera" label="Appareil photo" onPress={() => onPhoto('camera')} />}
        <TrayButton icon="happy" label="Stickers" active={tab === 'stickers'} onPress={() => setTab('stickers')} />
        <TrayButton icon="film" label="GIF" active={tab === 'gifs'} onPress={() => setTab('gifs')} />
      </View>

      {tab === 'stickers' ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.xs }}>
          {STICKERS.map((s) => (
            <Pressable key={s.id} accessibilityRole="button" accessibilityLabel={`Envoyer le sticker ${s.label}`} onPress={() => onSticker(s.id)} style={styles.stickerCell}>
              <Sticker id={s.id} size={84} />
            </Pressable>
          ))}
        </ScrollView>
      ) : gifs && !gifs.available ? (
        <AppText muted style={{ textAlign: 'center', padding: Spacing.md }}>
          Les GIF arrivent bientôt.
        </AppText>
      ) : (
        <View style={{ gap: Spacing.xs }}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Rechercher un GIF"
            placeholderTextColor={Colors.textMuted}
            accessibilityLabel="Rechercher un GIF"
            style={styles.search}
          />
          {error && <AppText variant="caption" color={Colors.wrong}>{error}</AppText>}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.xs }}>
            {(gifs?.gifs ?? []).map((g) => (
              <Pressable key={g.id} accessibilityRole="button" accessibilityLabel={`Envoyer le GIF ${g.title}`} onPress={() => onGif(g)}>
                <Image source={{ uri: g.previewUrl }} style={{ height: 96, width: Math.round((96 * g.width) / g.height), borderRadius: Radius.sm }} contentFit="cover" />
              </Pressable>
            ))}
          </ScrollView>
          {gifs?.provider && (
            <AppText variant="caption" muted style={{ textAlign: 'right', fontSize: 10 }}>
              Propulsé par {gifs.provider === 'giphy' ? 'GIPHY' : 'Tenor'}
            </AppText>
          )}
        </View>
      )}
    </View>
  );
}

function TrayButton({ icon, label, onPress, active }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; active?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={[styles.trayButton, active && { backgroundColor: Colors.surfaceRaised }]}>
      <Ionicons name={icon} size={20} color={active ? Colors.player : Colors.text} />
      <AppText variant="caption">{label}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.94)', padding: Spacing.md },
  viewerClose: { position: 'absolute', top: 48, right: 20, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  tray: { gap: Spacing.sm, backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.sm },
  trayRow: { flexDirection: 'row', gap: Spacing.xs, flexWrap: 'wrap' },
  trayButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, minHeight: 36, borderRadius: Radius.pill },
  stickerCell: { padding: 2, borderRadius: Radius.sm },
  search: { color: Colors.text, fontSize: 15, backgroundColor: Colors.background, borderRadius: Radius.sm, paddingHorizontal: Spacing.sm, paddingVertical: 8 },
});
