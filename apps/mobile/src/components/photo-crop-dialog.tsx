import { Image } from 'expo-image';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Modal, PanResponder, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { PickedImage } from '@/net/media';
import { AppText, Button } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { Tap } from '@/components/tap';

/** Recadrage commun des avatars, couvertures de profil et images de thème. */
export function PhotoCropDialog({
  visible,
  image,
  subtitle,
  aspect = [1, 1],
  busy = false,
  onCancel,
  onConfirm,
  renderPreview,
}: {
  visible: boolean;
  image: PickedImage | null;
  subtitle: string;
  aspect?: [number, number];
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (image: PickedImage) => void;
  renderPreview?: (image: PickedImage) => ReactNode;
}) {
  const { width, height } = useWindowDimensions();
  const [sliderWidth, setSliderWidth] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [cropping, setCropping] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [preparedImage, setPreparedImage] = useState<PickedImage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const panStart = useRef({ x: 0, y: 0 });
  const sliderStartX = useRef(0);
  const ratio = aspect[0] / aspect[1];
  const frameWidth = Math.max(150, Math.min(width - 48, 380, (height - 350) * ratio));
  const frameHeight = frameWidth / ratio;
  const baseScale = image ? Math.max(frameWidth / image.width, frameHeight / image.height) : 1;
  const scale = baseScale * zoom;
  const maxX = image ? Math.max(0, (image.width * scale - frameWidth) / 2) : 0;
  const maxY = image ? Math.max(0, (image.height * scale - frameHeight) / 2) : 0;
  const offsetX = Math.max(-maxX, Math.min(maxX, offset.x));
  const offsetY = Math.max(-maxY, Math.min(maxY, offset.y));

  const sliderPanResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (event) => {
      sliderStartX.current = event.nativeEvent.pageX - event.nativeEvent.locationX;
      setZoom(1 + Math.max(0, Math.min(1, event.nativeEvent.locationX / sliderWidth)) * 2);
    },
    onPanResponderMove: (event) => {
      const position = (event.nativeEvent.pageX - sliderStartX.current) / sliderWidth;
      setZoom(1 + Math.max(0, Math.min(1, position)) * 2);
    },
  }), [sliderWidth]);
  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) + Math.abs(gesture.dy) > 3,
    onPanResponderGrant: () => { panStart.current = { x: offsetX, y: offsetY }; },
    onPanResponderMove: (_, gesture) => setOffset({
      x: Math.max(-maxX, Math.min(maxX, panStart.current.x + gesture.dx)),
      y: Math.max(-maxY, Math.min(maxY, panStart.current.y + gesture.dy)),
    }),
  }), [maxX, maxY, offsetX, offsetY]);

  useEffect(() => {
    if (!visible) return;
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setShowPreview(false);
    setPreparedImage(null);
    setError(null);
  }, [visible, image?.uri, aspect[0], aspect[1]]);

  const prepareCrop = async () => {
    if (!image || cropping) return;
    setCropping(true);
    setError(null);
    try {
      const cropWidth = frameWidth / scale;
      const cropHeight = frameHeight / scale;
      const originX = Math.max(0, Math.min(image.width - cropWidth, (image.width - cropWidth) / 2 - offsetX / scale));
      const originY = Math.max(0, Math.min(image.height - cropHeight, (image.height - cropHeight) / 2 - offsetY / scale));
      const x = Math.floor(originX);
      const y = Math.floor(originY);
      const result = await manipulateAsync(image.uri, [{ crop: {
        originX: x,
        originY: y,
        width: Math.max(1, Math.min(image.width - x, Math.floor(cropWidth))),
        height: Math.max(1, Math.min(image.height - y, Math.floor(cropHeight))),
      } }], { compress: 0.9, format: SaveFormat.JPEG });
      setPreparedImage({ uri: result.uri, width: result.width, height: result.height, mimeType: 'image/jpeg' });
      setShowPreview(true);
    } catch {
      setError('Impossible de préparer cette image. Essaie-en une autre.');
    } finally {
      setCropping(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false} statusBarTranslucent onRequestClose={onCancel}>
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <View style={styles.dialog}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <AppText variant="heading" color={Colors.onAccent}>{showPreview ? 'Aperçu avant validation' : 'Ajuster la photo'}</AppText>
              <AppText variant="caption" color="#B6C0D7">{subtitle}</AppText>
            </View>
            <Tap accessibilityRole="button" accessibilityLabel="Fermer le recadrage" onPress={onCancel} style={styles.close}>
              <AppText variant="heading" color={Colors.onAccent}>×</AppText>
            </Tap>
          </View>

          {showPreview && preparedImage ? (
            <View style={styles.preview}>
              {renderPreview ? renderPreview(preparedImage) : (
                <Image source={{ uri: preparedImage.uri }} contentFit="contain" style={{ width: '100%', aspectRatio: ratio, borderRadius: Radius.md }} />
              )}
              <AppText variant="caption" muted style={{ color: '#B6C0D7', textAlign: 'center' }}>La photo sera enregistrée uniquement après validation.</AppText>
            </View>
          ) : (
            <>
              <View style={styles.hint}><AppText variant="caption" color={Colors.onAccent}>Déplace la photo dans le cadre · pince pour zoomer</AppText></View>
              {image && (
                <View style={[styles.frame, { width: frameWidth, height: frameHeight }]} {...panResponder.panHandlers}>
                  <Image source={{ uri: image.uri }} contentFit="fill" style={{
                    position: 'absolute', width: image.width * scale, height: image.height * scale,
                    left: (frameWidth - image.width * scale) / 2 + offsetX,
                    top: (frameHeight - image.height * scale) / 2 + offsetY,
                  }} />
                  <View pointerEvents="none" style={styles.grid}>
                    <View style={[styles.gridVertical, { left: '33.333%' }]} />
                    <View style={[styles.gridVertical, { left: '66.666%' }]} />
                    <View style={[styles.gridHorizontal, { top: '33.333%' }]} />
                    <View style={[styles.gridHorizontal, { top: '66.666%' }]} />
                  </View>
                  <View pointerEvents="none" style={styles.outline} />
                </View>
              )}
              <View style={styles.zoomSection}>
                <View style={styles.zoomHeading}>
                  <AppText variant="label" color={Colors.onAccent}>Ajuster le zoom</AppText>
                  <AppText variant="label" color={Colors.onAccent}>{Math.round(zoom * 100)} %</AppText>
                </View>
                <View style={styles.zoomRow}>
                  <Tap accessibilityRole="button" accessibilityLabel="Dézoomer" disabled={zoom <= 1} onPress={() => setZoom((z) => Math.max(1, z - 0.1))} style={styles.zoomButton}>
                    <AppText variant="heading" color={Colors.onAccent}>−</AppText>
                  </Tap>
                  <View style={styles.sliderHit} onLayout={(event) => setSliderWidth(Math.max(1, event.nativeEvent.layout.width))} {...sliderPanResponder.panHandlers}>
                    <View style={styles.sliderTrack}>
                      <View style={[styles.sliderFill, { width: `${((zoom - 1) / 2) * 100}%` }]} />
                      <View style={[styles.sliderThumb, { left: `${((zoom - 1) / 2) * 100}%` }]} />
                    </View>
                  </View>
                  <Tap accessibilityRole="button" accessibilityLabel="Zoomer" disabled={zoom >= 3} onPress={() => setZoom((z) => Math.min(3, z + 0.1))} style={styles.zoomButton}>
                    <AppText variant="heading" color={Colors.onAccent}>+</AppText>
                  </Tap>
                </View>
                <View style={styles.zoomFooter}>
                  <AppText variant="caption" color="#B6C0D7">Glisse pour déplacer, utilise le curseur pour zoomer</AppText>
                  <Tap accessibilityRole="button" accessibilityLabel="Réinitialiser le cadrage" onPress={() => { setZoom(1); setOffset({ x: 0, y: 0 }); }}>
                    <AppText variant="caption" color={Colors.onAccent}>Réinitialiser</AppText>
                  </Tap>
                </View>
              </View>
            </>
          )}
          {error && <AppText variant="caption" color={Colors.wrong}>{error}</AppText>}
          <View style={styles.actions}>
            <Button small label={showPreview ? 'Modifier' : 'Annuler'} variant="outline" color={Colors.onAccent} disabled={busy || cropping} onPress={() => showPreview ? setShowPreview(false) : onCancel()} style={{ flex: 0.8 }} />
            <Button small label={showPreview ? busy ? 'Enregistrement…' : 'Valider' : cropping ? 'Préparation…' : 'Voir l’aperçu'} color={Colors.accent} disabled={busy || cropping || (!showPreview && !image)} onPress={() => showPreview && preparedImage ? onConfirm(preparedImage) : void prepareCrop()} style={{ flex: 1.3 }} />
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0D1426' },
  dialog: { flex: 1, width: '100%', maxWidth: 520, alignSelf: 'center', justifyContent: 'space-between', gap: Spacing.md, paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: Spacing.md },
  header: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  close: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#26314A', alignItems: 'center', justifyContent: 'center' },
  hint: { width: '100%', paddingVertical: Spacing.sm, borderRadius: Radius.pill, backgroundColor: '#171F34', alignItems: 'center' },
  frame: { alignSelf: 'center', overflow: 'hidden', borderRadius: Radius.md, backgroundColor: '#171F34' },
  grid: { ...StyleSheet.absoluteFill, overflow: 'hidden' },
  gridVertical: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(255,255,255,0.32)' },
  gridHorizontal: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.32)' },
  outline: { ...StyleSheet.absoluteFill, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.86)', borderRadius: Radius.md },
  zoomSection: { width: '100%', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.md, backgroundColor: '#171F34' },
  zoomHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  zoomRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  zoomButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: '#27334D' },
  sliderHit: { flex: 1, height: 42, justifyContent: 'center' },
  sliderTrack: { height: 6, borderRadius: 3, backgroundColor: '#3A465E', justifyContent: 'center' },
  sliderFill: { height: 6, borderRadius: 3, backgroundColor: Colors.accent },
  sliderThumb: { position: 'absolute', width: 20, height: 20, marginLeft: -10, borderWidth: 3, borderColor: Colors.surface, borderRadius: 10, backgroundColor: Colors.accent },
  zoomFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  preview: { flex: 1, width: '100%', justifyContent: 'center', gap: Spacing.md },
  actions: { flexDirection: 'row', gap: Spacing.sm },
});
