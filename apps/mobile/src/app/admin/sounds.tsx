import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import * as DocumentPicker from 'expo-document-picker';
import { useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { GAME_SOUNDS, SOUND_FORMATS_LABEL, SOUND_MAX_BYTES, type GameSoundId, type SoundOverride } from '@qu1z/shared';

import { defaultSoundSource, refreshSoundOverrides } from '@/audio/sounds';
import { AdminScreen, Dock, Hint, Pill, Segmented, Sheet, SheetAction, adminStyles, type Notice } from '@/components/admin-ui';
import { AppText, Card } from '@/components/ui';
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

type Sound = (typeof GAME_SOUNDS)[number];
type Tab = 'effect' | 'music' | 'custom';

/** Un seul lecteur d'écoute pour tout l'écran. */
let preview: AudioPlayer | null = null;
let onPreviewEnd: (() => void) | null = null;

/** Sons du jeu (administrateurs) : écouter, remplacer par un fichier, ou rétablir le son d'origine. */
export default function AdminSoundsScreen() {
  const me = useApi<{ role: string }>('/api/me');
  const admin = me.data?.role === 'admin';
  const list = useApi<{ sounds: SoundOverride[] }>(admin ? '/api/admin/sounds' : null);
  const [tab, setTab] = useState<Tab>('effect');
  const [search, setSearch] = useState('');
  const [playing, setPlaying] = useState<Sound | null>(null);
  const [options, setOptions] = useState<Sound | null>(null);
  const [busy, setBusy] = useState<GameSoundId | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    onPreviewEnd = () => setPlaying(null);
    return () => {
      onPreviewEnd = null;
      try {
        preview?.pause();
      } catch {}
    };
  }, []);

  if (me.data && !admin) {
    return (
      <AdminScreen title="Sons du jeu">
        <AppText muted>Accès réservé aux administrateurs.</AppText>
      </AdminScreen>
    );
  }

  const byId = new Map((list.data?.sounds ?? []).map((s) => [s.id, s]));

  const stop = () => {
    try {
      preview?.pause();
    } catch {}
    setPlaying(null);
  };

  const listen = (sound: Sound) => {
    const o = byId.get(sound.id);
    const source = o ? { uri: `${apiBase()}${o.url}` } : defaultSoundSource(sound.id);
    try {
      if (preview) preview.replace(source);
      else {
        preview = createAudioPlayer(source);
        preview.addListener('playbackStatusUpdate', (status) => {
          if (status.didJustFinish) onPreviewEnd?.();
        });
      }
      preview.seekTo(0).catch(() => {});
      preview.play();
      setPlaying(sound);
    } catch {
      setNotice({ ok: false, text: 'Lecture impossible sur cet appareil.' });
    }
  };

  const done = async (text: string) => {
    setNotice({ ok: true, text });
    invalidateAll();
    list.refresh();
    await refreshSoundOverrides(true);
  };

  const replace = async (sound: Sound) => {
    setOptions(null);
    setNotice(null);
    const picked = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true, multiple: false });
    if (picked.canceled || !picked.assets[0]) return;
    const file = picked.assets[0];
    if (file.size && file.size > SOUND_MAX_BYTES) return setNotice({ ok: false, text: SOUND_ERRORS.too_large });
    setBusy(sound.id);
    try {
      const token = await AsyncStorage.getItem(TOKEN_KEY);
      if (!token) throw new ApiError(401, 'not_connected');
      const body = file.file ?? (await (await fetch(file.uri)).blob());
      const res = await fetch(`${apiBase()}/api/admin/sounds/${sound.id}?name=${encodeURIComponent(file.name)}`, {
        method: 'PUT',
        headers: { authorization: `Bearer ${token}`, 'content-type': file.mimeType ?? 'application/octet-stream' },
        body,
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new ApiError(res.status, data.error ?? 'error');
      await done(`« ${sound.label} » remplacé par ${file.name}. Les joueurs l’entendront à leur prochaine partie.`);
    } catch (e) {
      setNotice({ ok: false, text: soundError(e) });
    } finally {
      setBusy(null);
    }
  };

  const reset = async (sound: Sound) => {
    setOptions(null);
    setNotice(null);
    setBusy(sound.id);
    try {
      await api('DELETE', `/api/admin/sounds/${sound.id}`);
      await done(`« ${sound.label} » : son d’origine rétabli.`);
    } catch (e) {
      setNotice({ ok: false, text: soundError(e) });
    } finally {
      setBusy(null);
    }
  };

  const count = (kind: 'effect' | 'music') => GAME_SOUNDS.filter((s) => s.kind === kind).length;
  const query = search.trim().toLocaleLowerCase();
  const shown = GAME_SOUNDS.filter((s) => (tab === 'custom' ? byId.has(s.id) : s.kind === tab)).filter((s) => !query || s.label.toLocaleLowerCase().includes(query) || s.when.toLocaleLowerCase().includes(query));
  const selected = options ? byId.get(options.id) : undefined;

  return (
    <AdminScreen
      title="Sons du jeu"
      notice={notice}
      scrollKey={tab}
      dock={
        playing && (
          <Dock dark>
            <View style={adminStyles.grow}>
              <AppText color={Colors.onAccent} style={adminStyles.strong} numberOfLines={1}>
                {playing.label}
              </AppText>
              <Hint color="#CFC7E4">Écoute en cours</Hint>
            </View>
            <Tap accessibilityRole="button" accessibilityLabel="Arrêter l’écoute" onPress={stop} style={styles.playerStop}>
              <Ionicons name="stop" size={20} color={Colors.onAccent} />
            </Tap>
          </Dock>
        )
      }
      sheet={
        options && (
          <Sheet title={options.label} onClose={() => setOptions(null)}>
            <Hint color={selected ? Colors.accentInk : undefined}>{selected ? `Personnalisé · ${selected.fileName ?? 'fichier'} · ${size(selected.bytes)} · ${timeAgo(selected.updatedAt)}` : 'Son d’origine'}</Hint>
            <Hint>{options.when}</Hint>
            <SheetAction
              icon="play"
              label="Écouter"
              onPress={() => {
                listen(options);
                setOptions(null);
              }}
            />
            <SheetAction icon="cloud-upload-outline" label="Remplacer par un fichier" disabled={busy !== null} onPress={() => void replace(options)} />
            {selected && <SheetAction icon="refresh-outline" label="Rétablir le son d’origine" danger disabled={busy !== null} onPress={() => void reset(options)} />}
            <Hint>
              Fichier {SOUND_FORMATS_LABEL}, {MAX_MB} Mo maximum. Le changement vaut pour tous les joueurs, à leur prochaine partie. N’envoie que des sons que tu as le droit d’utiliser.
            </Hint>
          </Sheet>
        )
      }>
      <View style={styles.search}>
        <Ionicons name="search" size={18} color={Colors.textSoft} />
        <TextInput value={search} onChangeText={setSearch} placeholder="Chercher un son" placeholderTextColor={Colors.textMuted} accessibilityLabel="Chercher un son" autoCorrect={false} style={styles.searchInput} />
      </View>
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'effect', label: 'Effets', count: count('effect') },
          { value: 'music', label: 'Musiques', count: count('music') },
          { value: 'custom', label: 'Modifiés', count: byId.size },
        ]}
      />
      {list.error && <AppText color={Colors.wrong}>{errorMessage(list.error)}</AppText>}
      <Card style={styles.list}>
        {shown.length === 0 && <Hint style={styles.empty}>{tab === 'custom' && !query ? 'Aucun son modifié.' : 'Aucun son trouvé.'}</Hint>}
        {shown.map((s, index) => {
          const custom = byId.get(s.id);
          const isPlaying = playing?.id === s.id;
          return (
            <View key={s.id} style={[styles.row, index > 0 && styles.line]}>
              <Tap accessibilityRole="button" accessibilityLabel={`${isPlaying ? 'Arrêter' : 'Écouter'} ${s.label}`} onPress={() => (isPlaying ? stop() : listen(s))} style={[styles.play, isPlaying && styles.playOn]}>
                <Ionicons name={isPlaying ? 'stop' : 'play'} size={19} color={isPlaying ? Colors.onAccent : Colors.ink} />
              </Tap>
              <View style={styles.text}>
                <AppText style={adminStyles.strong}>{s.label}</AppText>
                {custom ? <Pill label="Personnalisé" color={Colors.accentInk} background="#FCE6F1" /> : <Hint>{s.when}</Hint>}
              </View>
              <Tap accessibilityRole="button" accessibilityLabel={`Options de ${s.label}`} disabled={busy !== null} onPress={() => setOptions(s)} style={styles.more}>
                <Ionicons name={busy === s.id ? 'hourglass-outline' : 'ellipsis-horizontal'} size={21} color={Colors.textMuted} />
              </Tap>
            </View>
          );
        })}
      </Card>
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, minHeight: 48, paddingHorizontal: 12, borderRadius: 13, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  searchInput: { flex: 1, minWidth: 0, color: Colors.text, fontSize: 15, paddingVertical: 8 },
  list: { gap: 0, paddingVertical: 4, paddingHorizontal: 12 },
  empty: { paddingVertical: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  line: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
  play: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surfaceRaised },
  playOn: { backgroundColor: Colors.accent },
  text: { flex: 1, minWidth: 0, gap: 2 },
  more: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  playerStop: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.15)' },
});
