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

import { AdminScreen, ConfirmSheet, Dock, Hint, Pills, SheetAction, Slider, adminStyles, type Notice } from '@/components/admin-ui';
import { DuelInviteOverlay, type DuelInviteData } from '@/components/duel-invite-overlay';
import { OverlayPortal } from '@/components/overlay-portal';
import { Tap } from '@/components/tap';
import { AppText, Button, Card } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { api, errorMessage, invalidateAll, useApi } from '@/net/api';

type Settings = { duelInvite: DuelInviteAnimation; customized: boolean };

const GROUPS = ['Durées', 'Écran', 'Déchirure', 'Carte', 'Couleurs'] as const;
type Group = (typeof GROUPS)[number];

/** Réglage de l'invitation en duel (administrateurs) : essayer, enregistrer pour tous, ou revenir à l'origine. */
export default function AdminAnimationsScreen() {
  const me = useApi<{ role: string; pseudo?: string }>('/api/me');
  const admin = me.data?.role === 'admin';
  const saved = useApi<Settings>(admin ? '/api/animations' : null);
  const [draft, setDraft] = useState<DuelInviteAnimation | null>(null);
  const [group, setGroup] = useState<Group>('Durées');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [resetting, setResetting] = useState(false);
  const [preview, setPreview] = useState<DuelInviteData | null>(null);
  const [previewAccepted, setPreviewAccepted] = useState<string | null>(null);

  useEffect(() => {
    if (saved.data && !draft) setDraft(saved.data.duelInvite);
  }, [saved.data, draft]);

  const clean = useMemo(() => normalizeDuelInviteAnimation(draft ?? DUEL_INVITE_DEFAULTS), [draft]);

  if (me.data && !admin) {
    return (
      <AdminScreen title="Animations">
        <AppText muted>Accès réservé aux administrateurs.</AppText>
      </AdminScreen>
    );
  }

  const changed = !!draft && !!saved.data && JSON.stringify(clean) !== JSON.stringify(saved.data.duelInvite);
  const total = clean.veilMs + clean.tearMs + clean.cardMs + clean.contentMs;

  const setNumber = (key: DuelInviteNumberKey, value: number) => setDraft((d) => d && { ...d, [key]: value });
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
    setNotice(null);
    try {
      const next = await task();
      setDraft(next.duelInvite);
      saved.refresh();
      invalidateAll();
      setNotice({ ok: true, text });
    } catch (e) {
      setNotice({ ok: false, text: errorMessage(e) });
    } finally {
      setBusy(false);
      setResetting(false);
    }
  };

  return (
    <AdminScreen
      title="Animations"
      notice={notice}
      dock={
        draft && (
          <Dock>
            <Button label="Voir" variant="outline" color={Colors.text} onPress={play} style={styles.see} />
            <Button label={busy ? 'Enregistrement…' : 'Enregistrer pour tous'} disabled={busy || !changed} onPress={() => void run(() => api<Settings>('PUT', '/api/admin/animations/duelInvite', clean), 'Réglages enregistrés.')} style={adminStyles.grow} />
          </Dock>
        )
      }
      sheet={
        resetting && (
          <ConfirmSheet
            title="Rétablir les réglages d’origine ?"
            text="Tes réglages seront remplacés pour tous les joueurs."
            confirmLabel="Rétablir"
            danger
            busy={busy}
            onCancel={() => setResetting(false)}
            onConfirm={() => void run(() => api<Settings>('DELETE', '/api/admin/animations/duelInvite'), 'Réglages d’origine rétablis.')}
          />
        )
      }>
      <Hint>Invitation à un duel. Le réglage vaut pour tous les joueurs, à leur prochaine ouverture de l’app.</Hint>
      {draft && (
        <>
          <Card style={styles.switchRow}>
            <View style={adminStyles.grow}>
              <AppText style={adminStyles.strong}>Déchirure activée</AppText>
              <Hint>Durée totale : {total} ms. Désactivée : simple fondu.</Hint>
            </View>
            <Switch accessibilityLabel="Déchirure activée" value={draft.enabled} onValueChange={(enabled) => setDraft({ ...draft, enabled })} trackColor={{ true: Colors.accent }} />
          </Card>
          {changed && <Hint color={Colors.accentInk}>Modifications non enregistrées : visibles dans l’aperçu seulement.</Hint>}

          <Pills value={group} onChange={setGroup} options={GROUPS.map((g) => ({ value: g, label: g }))} />

          {group === 'Couleurs' ? (
            <Card>
              {DUEL_INVITE_COLORS.map((f) => {
                const value = draft[f.key];
                const valid = isHexColor(value);
                return (
                  <View key={f.key} style={styles.colorRow}>
                    <AppText style={[adminStyles.strong, adminStyles.grow]}>{f.label}</AppText>
                    <View style={[styles.swatch, { backgroundColor: valid ? value : DUEL_INVITE_DEFAULTS[f.key] }]} />
                    <TextInput
                      accessibilityLabel={`Couleur ${f.label}`}
                      value={value}
                      maxLength={7}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      onChangeText={(text) => setDraft({ ...draft, [f.key]: text })}
                      style={[adminStyles.input, styles.hex, !valid && styles.hexInvalid]}
                    />
                  </View>
                );
              })}
            </Card>
          ) : (
            <Card>
              {DUEL_INVITE_NUMBERS.filter((f) => f.group === group).map((f) => (
                <View key={f.key} style={styles.param}>
                  <View style={styles.paramHead}>
                    <AppText style={[adminStyles.strong, adminStyles.grow]}>{f.label}</AppText>
                    <AppText color={Colors.accentInk} style={styles.value}>
                      {draft[f.key]}
                      {f.unit}
                    </AppText>
                  </View>
                  <View style={styles.controls}>
                    <Tap accessibilityRole="button" accessibilityLabel={`Diminuer ${f.label}`} disabled={draft[f.key] <= f.min} onPress={() => step(f.key, -1)} style={styles.stepButton}>
                      <Ionicons name="remove" size={20} color={Colors.text} />
                    </Tap>
                    <Slider label={f.label} value={draft[f.key]} min={f.min} max={f.max} step={f.step} onChange={(value) => setNumber(f.key, value)} />
                    <Tap accessibilityRole="button" accessibilityLabel={`Augmenter ${f.label}`} disabled={draft[f.key] >= f.max} onPress={() => step(f.key, 1)} style={styles.stepButton}>
                      <Ionicons name="add" size={20} color={Colors.text} />
                    </Tap>
                  </View>
                </View>
              ))}
            </Card>
          )}

          <SheetAction icon="refresh-outline" label="Rétablir l’origine" danger disabled={busy || !saved.data?.customized} onPress={() => setResetting(true)} />
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
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  see: { minWidth: 92 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  param: { gap: 2, paddingVertical: 4 },
  paramHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  value: { fontSize: 14, lineHeight: 20, fontWeight: '700', fontVariant: ['tabular-nums'] },
  controls: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  stepButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surfaceRaised },
  colorRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, minHeight: 52 },
  swatch: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: Colors.border },
  hex: { width: 112, textAlign: 'center', paddingHorizontal: 6 },
  hexInvalid: { color: Colors.wrong, borderColor: Colors.wrong },
});
