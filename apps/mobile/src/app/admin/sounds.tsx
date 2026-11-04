import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import * as DocumentPicker from 'expo-document-picker';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { GAME_SOUNDS, SOUND_FORMATS_LABEL, SOUND_MAX_BYTES, type GameSoundId, type SoundOverride } from '@qu1z/shared';

import { defaultSoundSource, refreshSoundOverrides } from '@/audio/sounds';
import { SectionHeader } from '@/components/social';
import { AppText, Button, Card, Screen } from '@/components/ui';
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
    <View style={{ gap: Spacing.sm }}>
      <SectionHeader title={title} />
      {GAME_SOUNDS.filter((s) => s.kind === kind).map((s) => {
        const o = byId.get(s.id);
        return (
          <Card key={s.id}>
            <AppText variant="label">{s.label}</AppText>
            <AppText variant="caption" muted>
              {s.when}
            </AppText>
            <AppText variant="caption" color={o ? Colors.accent : Colors.textMuted}>
              {o ? `Personnalisé : ${o.fileName ?? 'fichier'} · ${size(o.bytes)} · ${timeAgo(o.updatedAt)}` : 'Son d’origine'}
            </AppText>
            <View style={styles.buttons}>
              <Button label="▶ Écouter" variant="outline" color={Colors.text} onPress={() => listen(s.id)} />
              <Button label={busy === s.id ? 'Envoi…' : 'Remplacer'} disabled={busy !== null} onPress={() => replace(s.id, s.label)} />
              {o && <Button label="Rétablir l’origine" variant="outline" color={Colors.wrong} disabled={busy !== null} onPress={() => reset(s.id, s.label)} />}
            </View>
          </Card>
        );
      })}
    </View>
  );

  return (
    <Screen back title="Sons du jeu">
      <AppText muted>
        Remplace un son par un fichier {SOUND_FORMATS_LABEL} ({MAX_MB} Mo maximum). Le changement vaut pour tous les joueurs, à leur prochaine
        partie. N’envoie que des sons que tu as le droit d’utiliser.
      </AppText>
      <Button label="■ Arrêter l’écoute" variant="outline" color={Colors.text} onPress={stop} />
      {message && <AppText color={message.ok ? Colors.correct : Colors.wrong}>{message.text}</AppText>}
      {list.error && <AppText color={Colors.wrong}>{errorMessage(list.error)}</AppText>}
      {section('effect', 'Effets du duel')}
      {section('music', 'Musiques')}
    </Screen>
  );
}

const styles = StyleSheet.create({
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.xs },
});
