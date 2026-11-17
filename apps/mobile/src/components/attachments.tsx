import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Modal, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { type Attachment, type GifView, type MediaView, type StickerId } from '@qu1z/shared';

import { Sticker } from '@/components/sticker';
import { StickerPicker, uploadSticker } from '@/components/sticker-picker';
import { AppText } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { api, errorMessage } from '@/net/api';
import { mediaUri } from '@/net/media';
import { Tap } from '@/components/tap';

/** Taille d'affichage d'une image dans une bulle ou une carte, en gardant ses proportions. */
function fit(width: number, height: number, maxWidth: number, maxHeight: number) {
  const ratio = Math.min(maxWidth / width, maxHeight / height, 1);
  return { width: Math.round(width * ratio), height: Math.round(height * ratio) };
}

/** Photo touchable qui s'ouvre en plein écran. */
export function Photo({ media, maxWidth = 240, maxHeight = 300, zoomable = true }: { media: Pick<MediaView, 'url' | 'width' | 'height'>; maxWidth?: number; maxHeight?: number; zoomable?: boolean }) {
  const [open, setOpen] = useState(false);
  const size = fit(media.width, media.height, maxWidth, maxHeight);
  const uri = mediaUri(media.url)!;
  if (!zoomable) return <Image source={{ uri }} style={[size, { borderRadius: Radius.sm, backgroundColor: Colors.surfaceRaised }]} contentFit="cover" />;
  return (
    <>
      <Tap accessibilityRole="imagebutton" accessibilityLabel="Agrandir la photo" onPress={() => setOpen(true)}>
        <Image source={{ uri }} style={[size, { borderRadius: Radius.sm, backgroundColor: Colors.surfaceRaised }]} contentFit="cover" />
      </Tap>
      <Modal visible={open} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setOpen(false)}>
        <PhotoViewer uri={uri} onClose={() => setOpen(false)} />
      </Modal>
    </>
  );
}

/** Visionneuse plein écran : proportions d'origine, pincer ou toucher deux fois pour zoomer, glisser une fois zoomé. */
export function PhotoViewer({ uri, onClose }: { uri: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const scale = useSharedValue(1);
  const saved = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const sx = useSharedValue(0);
  const sy = useSharedValue(0);
  const reset = () => {
    'worklet';
    scale.value = withTiming(1);
    saved.value = 1;
    x.value = withTiming(0);
    y.value = withTiming(0);
    sx.value = 0;
    sy.value = 0;
  };
  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.min(5, Math.max(1, saved.value * e.scale));
    })
    .onEnd(() => {
      if (scale.value <= 1.02) reset();
      else saved.value = scale.value;
    });
  const pan = Gesture.Pan()
    .averageTouches(true)
    .onUpdate((e) => {
      if (scale.value <= 1) return;
      x.value = sx.value + e.translationX;
      y.value = sy.value + e.translationY;
    })
    .onEnd(() => {
      sx.value = x.value;
      sy.value = y.value;
    });
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1) reset();
      else {
        scale.value = withTiming(2.5);
        saved.value = 2.5;
      }
    });
  const zoomStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }] }));
  return (
    <GestureHandlerRootView style={styles.viewer}>
      <GestureDetector gesture={Gesture.Simultaneous(pinch, pan, doubleTap)}>
        <Animated.View style={[StyleSheet.absoluteFill, zoomStyle]}>
          <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="contain" accessibilityIgnoresInvertColors />
        </Animated.View>
      </GestureDetector>
      <Tap accessibilityRole="button" accessibilityLabel="Fermer la photo" onPress={onClose} hitSlop={12} style={[styles.viewerClose, { top: insets.top + 12 }]}>
        <Ionicons name="close" size={26} color="#fff" />
      </Tap>
    </GestureHandlerRootView>
  );
}

/** Contenu visuel d'un message : photo, GIF ou sticker. */
export function AttachmentView({ attachment, zoomable = true }: { attachment: Attachment; zoomable?: boolean }) {
  switch (attachment.kind) {
    case 'image':
      return <Photo media={attachment.media} zoomable={zoomable} />;
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
  /** Sans `onPhoto` (fin de match), seuls les stickers et les GIF sont proposés. */
  onPhoto?: (source: 'library' | 'camera') => void;
  onSticker: (id: StickerId) => void;
  onGif: (gif: GifView) => void;
}) {
  const [tab, setTab] = useState<Tab>('stickers');
  const [query, setQuery] = useState('');
  const [gifs, setGifs] = useState<{ available: boolean; provider?: string; gifs: GifView[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pickerKey, setPickerKey] = useState(0);
  // Créer un sticker : on choisit une image, elle rejoint « Mes stickers » et part tout de suite.
  const create = async () => {
    setError(null);
    try {
      const id = await uploadSticker();
      if (!id) return;
      setPickerKey((k) => k + 1);
      onSticker(id);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

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
        {onPhoto && <TrayButton icon="images" label="Galerie" onPress={() => onPhoto('library')} />}
        {onPhoto && Platform.OS !== 'web' && <TrayButton icon="camera" label="Appareil photo" onPress={() => onPhoto('camera')} />}
        <TrayButton icon="happy" label="Stickers" active={tab === 'stickers'} onPress={() => setTab('stickers')} />
        <TrayButton icon="add-circle" label="Créer un sticker" onPress={() => void create()} />
        <TrayButton icon="film" label="GIF" active={tab === 'gifs'} onPress={() => setTab('gifs')} />
      </View>

      {tab === 'stickers' ? (
        <View style={{ gap: Spacing.xs }}>
          {error && <AppText variant="caption" color={Colors.wrong}>{error}</AppText>}
          <StickerPicker key={pickerKey} size={84} onPick={onSticker} />
        </View>
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
              <Tap key={g.id} accessibilityRole="button" accessibilityLabel={`Envoyer le GIF ${g.title}`} onPress={() => onGif(g)}>
                <Image source={{ uri: g.previewUrl }} style={{ height: 96, width: Math.round((96 * g.width) / g.height), borderRadius: Radius.sm }} contentFit="cover" />
              </Tap>
            ))}
          </ScrollView>
          {gifs?.provider && (
            <AppText variant="caption" muted style={{ textAlign: 'right', fontSize: 11 }}>
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
    <Tap accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={[styles.trayButton, active && { backgroundColor: Colors.surfaceRaised }]}>
      <Ionicons name={icon} size={20} color={active ? Colors.accent : Colors.text} />
      <AppText variant="caption">{label}</AppText>
    </Tap>
  );
}

const styles = StyleSheet.create({
  viewer: { flex: 1, backgroundColor: '#000000' },
  viewerClose: { position: 'absolute', top: 48, right: 20, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  tray: { gap: Spacing.sm, backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.sm },
  trayRow: { flexDirection: 'row', gap: Spacing.xs, flexWrap: 'wrap' },
  trayButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, minHeight: 44, borderRadius: Radius.pill },
  stickerCell: { padding: 2, borderRadius: Radius.sm },
  search: { color: Colors.text, fontSize: 15, backgroundColor: Colors.background, borderRadius: Radius.sm, paddingHorizontal: Spacing.sm, paddingVertical: 8 },
});
