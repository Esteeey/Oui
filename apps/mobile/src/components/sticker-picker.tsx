import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as DocumentPicker from 'expo-document-picker';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { STICKERS, type CustomStickerId, type StickerId } from '@qu1z/shared';

import { Sticker } from '@/components/sticker';
import { Tap } from '@/components/tap';
import { AppText } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { api, apiBase, ApiError, errorMessage, TOKEN_KEY, useApi } from '@/net/api';

/** Envoie une image (PNG, GIF, WebP, JPEG) telle quelle : la transparence et l'animation sont gardées par le serveur. */
async function uploadSticker(): Promise<CustomStickerId | null> {
  const picked = await DocumentPicker.getDocumentAsync({ type: ['image/png', 'image/gif', 'image/webp', 'image/jpeg'], copyToCacheDirectory: true, multiple: false });
  if (picked.canceled || !picked.assets[0]) return null;
  const file = picked.assets[0];
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  if (!token) throw new ApiError(401, 'not_connected');
  const body = file.file ?? (await (await fetch(file.uri)).blob());
  const response = await fetch(apiBase() + '/api/me/stickers', {
    method: 'PUT',
    headers: { authorization: 'Bearer ' + token, 'content-type': file.mimeType ?? 'application/octet-stream' },
    body,
  });
  const data = (await response.json().catch(() => ({}))) as { id?: CustomStickerId; error?: string };
  if (!response.ok || !data.id) throw new ApiError(response.status, data.error ?? 'error');
  return data.id;
}

/**
 * Rangée de stickers commune (messages, commentaires, publications, fin de partie) :
 * bouton « Importer », puis les stickers du joueur, puis le pack Qu1z.
 * Un appui long sur un de ses stickers le retire de sa collection.
 */
export function StickerPicker({ size = 64, onPick }: { size?: number; onPick: (id: StickerId) => void }) {
  const mine = useApi<{ stickers: CustomStickerId[] }>('/api/me/stickers');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const importOne = async () => {
    setError(null);
    setBusy(true);
    try {
      const id = await uploadSticker();
      if (id) mine.refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const remove = async (id: CustomStickerId) => {
    await api('DELETE', `/api/me/stickers/${id}`).catch(() => {});
    mine.refresh();
  };

  return (
    <View style={{ gap: 4 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ flexGrow: 0 }} contentContainerStyle={styles.row}>
        <Tap accessibilityRole="button" accessibilityLabel="Importer un sticker" onPress={() => void importOne()} disabled={busy} style={[styles.add, { width: size, height: size }]}>
          {busy ? <ActivityIndicator color={Colors.accent} /> : <Ionicons name="add" size={size * 0.4} color={Colors.accent} />}
          <AppText variant="caption" color={Colors.accent} style={styles.addText}>
            Importer
          </AppText>
        </Tap>
        {(mine.data?.stickers ?? []).map((id) => (
          <Tap key={id} accessibilityRole="button" accessibilityLabel="Envoyer ce sticker" accessibilityHint="Appui long pour le retirer de ta collection" onPress={() => onPick(id)} onLongPress={() => void remove(id)} style={styles.cell}>
            <Sticker id={id} size={size} />
          </Tap>
        ))}
        {STICKERS.map((s) => (
          <Tap key={s.id} accessibilityRole="button" accessibilityLabel={`Envoyer le sticker ${s.label}`} onPress={() => onPick(s.id)} style={styles.cell}>
            <Sticker id={s.id} size={size} />
          </Tap>
        ))}
      </ScrollView>
      {error && (
        <AppText variant="caption" color={Colors.wrong}>
          {error}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: Spacing.xs, alignItems: 'center' },
  cell: { padding: 2, borderRadius: Radius.sm },
  add: { borderRadius: Radius.md, borderWidth: 1.5, borderStyle: 'dashed', borderColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  addText: { fontSize: 10, fontWeight: '700' },
});
