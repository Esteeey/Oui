import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import * as DocumentPicker from 'expo-document-picker';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { GAME_SOUNDS, SOUND_FORMATS_LABEL, SOUND_MAX_BYTES, type GameSoundId, type SoundOverride } from '@qu1z/shared';

import { defaultSoundSource, refreshSoundOverrides } from '@/audio/sounds';
import { SectionHeader } from '@/components/social';
import { AppText, Card, Screen } from '@/components/ui';
import { Tap } from '@/components/tap';
import { Colors, Spacing } from '@/constants/theme';
import { api, apiBase, ApiError, errorMessage, invalidateAll, TOKEN_KEY, useApi } from '@/net/api';
import { timeAgo } from '@/utils/time';

const MAX_MB = SOUND_MAX_BYTES / 1024 / 1024;

/** Messages propres aux sons (les messages communs parlent d'images). */
const SOUND_ERRORS: Record<string, string> = {
  unsupported_format: `Format non pris en charge : ${SOUND_FORMATS_LABEL} uniquement.`,
  too_large: `Fichier trop lourd (${MAX_MB} Mo maximum).`,
  empty_file: 'Fichier vide.',
};
const soundError = (e: unknown) => (e instanceof ApiError && SOUND_ERRORS[e.code]) || errorMessage(e);

const size = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} Ko` : `${(bytes / 1024 / 1024).toFixed(1)} Mo`);

/** Un seul lecteur d'écoute pour tout l'écran. */
let preview: AudioPlayer | null = null;

/** Sons du jeu (administrateurs) : écouter, remplacer par un fichier, ou rétablir le son d'origine. */
export default function AdminSoundsScreen() {
  const me = useApi<{ role: string }>('/api/me');
  const admin = me.data?.role === 'admin';
  const list = useApi<{ sounds: SoundOverride[] }>(admin ? '/api/admin/sounds' : null);
  const [busy, setBusy] = useState<GameSoundId | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(
    () => () => {
      try {
        preview?.pause();
      } catch {}
    },
    [],
  );

  if (me.data && !admin) {
    return (
      <Screen back title="Sons du jeu">
        <AppText muted>Accès réservé aux administrateurs.</AppText>
      </Screen>
    );
  }

  const byId = new Map((list.data?.sounds ?? []).map((s) => [s.id, s]));

  const listen = (id: GameSoundId) => {
    const o = byId.get(id);
    const source = o ? { uri: `${apiBase()}${o.url}` } : defaultSoundSource(id);
    try {
      if (preview) preview.replace(source);
      else preview = createAudioPlayer(source);
      preview.seekTo(0).catch(() => {});
      preview.play();
    } catch {
      setMessage({ ok: false, text: 'Lecture impossible sur cet appareil.' });
    }
  };

  const stop = () => {
    try {
      preview?.pause();
    } catch {}
  };

  const done = async (text: string) => {
    setMessage({ ok: true, text });
    invalidateAll();
    list.refresh();
    await refreshSoundOverrides(true);
  };

  const replace = async (id: GameSoundId, label: string) => {
    setMessage(null);
    const picked = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true, multiple: false });
    if (picked.canceled || !picked.assets[0]) return;
    const file = picked.assets[0];
    if (file.size && file.size > SOUND_MAX_BYTES) return setMessage({ ok: false, text: SOUND_ERRORS.too_large });
    setBusy(id);
    try {
      const token = await AsyncStorage.getItem(TOKEN_KEY);
      if (!token) throw new ApiError(401, 'not_connected');
      const body = file.file ?? (await (await fetch(file.uri)).blob());
      const res = await fetch(`${apiBase()}/api/admin/sounds/${id}?name=${encodeURIComponent(file.name)}`, {
        method: 'PUT',
        headers: { authorization: `Bearer ${token}`, 'content-type': file.mimeType ?? 'application/octet-stream' },
        body,
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new ApiError(res.status, data.error ?? 'error');
      await done(`« ${label} » remplacé par ${file.name}. Les joueurs l’entendront à leur prochaine partie.`);
    } catch (e) {
      setMessage({ ok: false, text: soundError(e) });
    } finally {
      setBusy(null);
    }
  };

  const reset = async (id: GameSoundId, label: string) => {
    setMessage(null);
    setBusy(id);
    try {
      await api('DELETE', `/api/admin/sounds/${id}`);
      await done(`« ${label} » : son d’origine rétabli.`);
    } catch (e) {
      setMessage({ ok: false, text: soundError(e) });
    } finally {
      setBusy(null);
    }
  };

  const section = (kind: 'effect' | 'music', title: string) => (
    <View style={styles.section}>
      <SectionHeader title={title} />
      <View style={styles.grid}>
        {GAME_SOUNDS.filter((s) => s.kind === kind).map((s) => {
        const o = byId.get(s.id);
        return (
          <Card key={s.id} style={styles.soundCard}>
            <View style={styles.cardHeading}>
              <View style={[styles.soundIcon, o && styles.soundIconActive]}>
                <Ionicons name={kind === 'music' ? 'musical-notes' : 'volume-high'} size={17} color={o ? Colors.accent : Colors.textMuted} />
              </View>
              <AppText style={styles.soundTitle} numberOfLines={2}>{s.label}</AppText>
            </View>
            <AppText variant="caption" muted numberOfLines={2} style={styles.description}>{s.when}</AppText>
            <AppText variant="caption" color={o ? Colors.accent : Colors.textMuted} numberOfLines={2} style={styles.status}>
              {o ? `Personnalisé · ${o.fileName ?? 'fichier'} · ${size(o.bytes)} · ${timeAgo(o.updatedAt)}` : 'Son d’origine'}
            </AppText>
            <View style={styles.actions}>
              <Tap accessibilityRole="button" accessibilityLabel={`Écouter ${s.label}`} onPress={() => listen(s.id)} style={styles.iconButton}>
                <Ionicons name="play" size={17} color={Colors.text} />
              </Tap>
              <Tap accessibilityRole="button" accessibilityLabel={`Remplacer ${s.label}`} disabled={busy !== null} onPress={() => replace(s.id, s.label)} style={[styles.iconButton, styles.editButton, busy === s.id && styles.busyButton]}>
                <Ionicons name={busy === s.id ? 'ellipsis-horizontal' : 'create-outline'} size={19} color={busy === s.id ? Colors.textMuted : Colors.onAccent} />
              </Tap>
              {o && (
                <Tap accessibilityRole="button" accessibilityLabel={`Rétablir le son d’origine de ${s.label}`} disabled={busy !== null} onPress={() => reset(s.id, s.label)} style={[styles.iconButton, styles.resetButton]}>
                  <Ionicons name="refresh-outline" size={18} color={Colors.wrong} />
                </Tap>
              )}
            </View>
          </Card>
        );
        })}
      </View>
    </View>
  );

  return (
    <Screen back title="Sons du jeu">
      <AppText muted>
        Remplace un son par un fichier {SOUND_FORMATS_LABEL} ({MAX_MB} Mo maximum). Le changement vaut pour tous les joueurs, à leur prochaine
        partie. N’envoie que des sons que tu as le droit d’utiliser.
      </AppText>
      <Tap accessibilityRole="button" onPress={stop} style={styles.stopButton}>
        <Ionicons name="stop" size={15} color={Colors.text} />
        <AppText style={styles.stopLabel}>Arrêter l’écoute</AppText>
      </Tap>
      {message && <AppText color={message.ok ? Colors.correct : Colors.wrong}>{message.text}</AppText>}
      {list.error && <AppText color={Colors.wrong}>{errorMessage(list.error)}</AppText>}
      {section('effect', 'Effets du duel')}
      {section('music', 'Musiques')}
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: Spacing.sm },
  soundCard: { width: '48%', padding: Spacing.sm, gap: 7 },
  cardHeading: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 34 },
  soundIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surfaceRaised },
  soundIconActive: { backgroundColor: '#FCE6F1' },
  soundTitle: { flex: 1, fontSize: 14, lineHeight: 18 },
  description: { minHeight: 32, fontSize: 11, lineHeight: 15 },
  status: { minHeight: 32, fontSize: 11, lineHeight: 15 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  iconButton: { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  editButton: { backgroundColor: Colors.accent },
  resetButton: { backgroundColor: '#FCE6F1' },
  busyButton: { opacity: 0.55 },
  stopButton: { alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 32, paddingHorizontal: 11, borderRadius: 16, backgroundColor: Colors.surfaceRaised },
  stopLabel: { fontSize: 12, fontWeight: '700' },
});
