import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Switch, TextInput, View } from 'react-native';

import {
  DUEL_INVITE_COLORS,
  DUEL_INVITE_DEFAULTS,
  DUEL_INVITE_NUMBERS,
  isHexColor,
  normalizeDuelInviteAnimation,
  THEMES,
  type DuelInviteAnimation,
  type DuelInviteNumberKey,
} from '@qu1z/shared';

import { DuelInviteOverlay, type DuelInviteData } from '@/components/duel-invite-overlay';
import { OverlayPortal } from '@/components/overlay-portal';
import { SectionHeader } from '@/components/social';
import { Tap } from '@/components/tap';
import { AppText, Button, Card, Screen } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { api, errorMessage, invalidateAll, useApi } from '@/net/api';

type Settings = { duelInvite: DuelInviteAnimation; customized: boolean };

const GROUPS = ['Durées', 'Écran', 'Déchirure', 'Carte'] as const;

/** Réglage de l'invitation en duel (administrateurs) : essayer, enregistrer pour tous, ou revenir à l'origine. */
export default function AdminAnimationsScreen() {
  const me = useApi<{ role: string; pseudo?: string }>('/api/me');
  const admin = me.data?.role === 'admin';
  const saved = useApi<Settings>(admin ? '/api/animations' : null);
  const [draft, setDraft] = useState<DuelInviteAnimation | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [preview, setPreview] = useState<DuelInviteData | null>(null);
  const [previewAccepted, setPreviewAccepted] = useState<string | null>(null);

  useEffect(() => {
    if (saved.data && !draft) setDraft(saved.data.duelInvite);
  }, [saved.data, draft]);

  const clean = useMemo(() => normalizeDuelInviteAnimation(draft ?? DUEL_INVITE_DEFAULTS), [draft]);

  if (me.data && !admin) {
    return (
      <Screen back title="Animations">
        <AppText muted>Accès réservé aux administrateurs.</AppText>
      </Screen>
    );
  }

  const changed = !!draft && !!saved.data && JSON.stringify(clean) !== JSON.stringify(saved.data.duelInvite);
  const total = clean.veilMs + clean.tearMs + clean.cardMs + clean.contentMs;

  const step = (key: DuelInviteNumberKey, direction: 1 | -1) => {
    const field = DUEL_INVITE_NUMBERS.find((f) => f.key === key)!;
    setDraft((d) => d && { ...d, [key]: Math.min(field.max, Math.max(field.min, d[key] + direction * field.step)) });
  };

  const play = () => {
    const theme = THEMES[0];
    setPreviewAccepted(null);
    setPreview({ id: `apercu-${Date.now()}`, personId: 'apercu', pseudo: me.data?.pseudo ?? 'Joueur', avatar: null, themeId: theme.id, themeName: theme.name });
  };

  const run = async (task: () => Promise<Settings>, text: string) => {
    setBusy(true);
    setMessage(null);
    try {
      const next = await task();
      setDraft(next.duelInvite);
      saved.refresh();
      invalidateAll();
      setMessage({ ok: true, text });
    } catch (e) {
      setMessage({ ok: false, text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen back title="Animations">
      <AppText muted>Invitation à un duel. Le réglage vaut pour tous les joueurs, à leur prochaine ouverture de l’app.</AppText>
      {draft && (
        <>
          <View style={styles.actions}>
            <Button label="Voir l’animation" onPress={play} />
            <Button label={busy ? 'Enregistrement…' : 'Enregistrer pour tous'} variant="outline" disabled={busy || !changed} onPress={() => void run(() => api<Settings>('PUT', '/api/admin/animations/duelInvite', clean), 'Réglages enregistrés.')} />
            <Button label="Rétablir l’origine" variant="outline" disabled={busy || !saved.data?.customized} onPress={() => void run(() => api<Settings>('DELETE', '/api/admin/animations/duelInvite'), 'Réglages d’origine rétablis.')} />
          </View>
          {changed && <AppText variant="caption" color={Colors.accentInk}>Modifications non enregistrées : visibles dans l’aperçu seulement.</AppText>}
          {message && <AppText color={message.ok ? Colors.correct : Colors.wrong}>{message.text}</AppText>}

          <Card style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <AppText variant="label">Déchirure activée</AppText>
              <AppText variant="caption" muted>Désactivée : simple fondu. Durée totale actuelle : {total} ms.</AppText>
            </View>
            <Switch accessibilityLabel="Déchirure activée" value={draft.enabled} onValueChange={(enabled) => setDraft({ ...draft, enabled })} trackColor={{ true: Colors.accent }} />
          </Card>

          {GROUPS.map((group) => (
            <View key={group} style={styles.group}>
              <SectionHeader title={group} />
              <Card style={styles.list}>
                {DUEL_INVITE_NUMBERS.filter((f) => f.group === group).map((f) => (
                  <View key={f.key} style={styles.row}>
                    <AppText style={styles.rowLabel}>{f.label}</AppText>
                    <Tap accessibilityRole="button" accessibilityLabel={`Diminuer ${f.label}`} disabled={draft[f.key] <= f.min} onPress={() => step(f.key, -1)} style={styles.stepButton}>
                      <Ionicons name="remove" size={18} color={Colors.text} />
                    </Tap>
                    <AppText style={styles.value}>{draft[f.key]}{f.unit}</AppText>
                    <Tap accessibilityRole="button" accessibilityLabel={`Augmenter ${f.label}`} disabled={draft[f.key] >= f.max} onPress={() => step(f.key, 1)} style={styles.stepButton}>
                      <Ionicons name="add" size={18} color={Colors.text} />
                    </Tap>
                  </View>
                ))}
              </Card>
            </View>
          ))}

          <View style={styles.group}>
            <SectionHeader title="Couleurs" />
            <Card style={styles.list}>
              {DUEL_INVITE_COLORS.map((f) => {
                const value = draft[f.key];
                const valid = isHexColor(value);
                return (
                  <View key={f.key} style={styles.row}>
                    <AppText style={styles.rowLabel}>{f.label}</AppText>
                    <View style={[styles.swatch, { backgroundColor: valid ? value : DUEL_INVITE_DEFAULTS[f.key] }]} />
                    <TextInput
                      accessibilityLabel={`Couleur ${f.label}`}
                      value={value}
                      maxLength={7}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      onChangeText={(text) => setDraft({ ...draft, [f.key]: text })}
                      style={[styles.hex, !valid && styles.hexInvalid]}
                    />
                  </View>
                );
              })}
            </Card>
          </View>
        </>
      )}
      {saved.error && <AppText color={Colors.wrong}>{errorMessage(saved.error)}</AppText>}

      {/* Au niveau racine : dans la page, l'aperçu défilerait avec elle au lieu de couvrir l'écran. */}
      <OverlayPortal>
        <DuelInviteOverlay
          invitation={preview}
          settings={clean}
          seconds={45}
          fraction={1}
          acceptedId={previewAccepted}
          onAccept={() => {
            setPreviewAccepted(preview?.id ?? null);
            setTimeout(() => setPreview(null), 420);
          }}
          onLater={() => setPreview(null)}
          onRefuse={() => setPreview(null)}
        />
      </OverlayPortal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { gap: Spacing.sm },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  group: { gap: Spacing.sm },
  list: { gap: 4, paddingVertical: Spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 46 },
  rowLabel: { flex: 1, fontSize: 14, lineHeight: 19 },
  stepButton: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surfaceRaised },
  value: { width: 72, textAlign: 'center', fontSize: 14, lineHeight: 19, fontWeight: '700', fontVariant: ['tabular-nums'] },
  swatch: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: Colors.border },
  hex: { width: 104, minHeight: 40, borderRadius: 10, paddingHorizontal: 10, textAlign: 'center', color: Colors.text, backgroundColor: Colors.surfaceRaised },
  hexInvalid: { color: Colors.wrong, borderWidth: 1, borderColor: Colors.wrong },
});
