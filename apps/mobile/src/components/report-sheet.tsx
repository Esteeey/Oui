import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { MAX_REPORT_DETAILS, REPORT_REASONS, type ReportReason, type ReportTargetType } from '@qu1z/shared';

import { AppText, Button } from '@/components/ui';
import { Colors, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { api, errorMessage } from '@/net/api';
import { Tap } from '@/components/tap';

export interface ReportTarget {
  type: ReportTargetType;
  id: string;
  /** Ce qui est signalé, affiché en titre (« ce message », « Bob »…). */
  label: string;
}

/**
 * Signaler un message, une photo / un GIF / un sticker, un joueur, un groupe, une publication ou un commentaire.
 * Le serveur fige le contenu et son contexte : il reste disponible pour l'équipe même si la conversation disparaît.
 */
export function ReportSheet({ target, onClose }: { target: ReportTarget | null; onClose: () => void }) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [state, setState] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const close = () => {
    setReason(null);
    setDetails('');
    setState(null);
    onClose();
  };

  const send = async () => {
    if (!target || !reason) return;
    setBusy(true);
    setState(null);
    try {
      await api('POST', '/api/reports', { targetType: target.type, targetId: target.id, reason, details: details.trim() || undefined });
      setState({ ok: true, text: 'Merci. Ton signalement a été envoyé à l’équipe de modération, qui va l’examiner.' });
    } catch (e) {
      setState({ ok: false, text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={!!target} transparent animationType="slide" onRequestClose={close}>
      <Pressable accessibilityRole="button" accessibilityLabel="Fermer" onPress={close} style={styles.backdrop} />
      <View style={styles.sheet}>
        <ScrollView contentContainerStyle={{ gap: Spacing.sm }}>
          <AppText variant="heading">Signaler {target?.label}</AppText>
          {state?.ok ? (
            <>
              <AppText color={Colors.correct}>{state.text}</AppText>
              <Button label="Fermer" onPress={close} />
            </>
          ) : (
            <>
              <AppText muted>Pourquoi ? Le signalement est anonyme pour la personne signalée.</AppText>
              {REPORT_REASONS.map((r) => (
                <Tap
                  key={r.id}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: reason === r.id }}
                  accessibilityLabel={r.label}
                  onPress={() => setReason(r.id)}
                  style={[styles.reason, reason === r.id && styles.reasonOn]}>
                  <View style={[styles.radio, reason === r.id && styles.radioOn]} />
                  <AppText>{r.label}</AppText>
                </Tap>
              ))}
              <TextInput
                value={details}
                onChangeText={setDetails}
                maxLength={MAX_REPORT_DETAILS}
                multiline
                placeholder="Détails (facultatif)"
                placeholderTextColor={Colors.textMuted}
                accessibilityLabel="Détails du signalement"
                style={styles.input}
              />
              {state && <AppText color={Colors.wrong}>{state.text}</AppText>}
              <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                <Button label="Annuler" variant="outline" color={Colors.text} onPress={close} style={{ flex: 1 }} />
                <Button label={busy ? 'Envoi…' : 'Envoyer'} color={Colors.wrong} disabled={!reason || busy} onPress={send} style={{ flex: 1 }} />
              </View>
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    padding: Spacing.md,
    paddingBottom: Spacing.xl,
    maxHeight: '85%',
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  reason: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, minHeight: 44, paddingHorizontal: Spacing.sm, borderRadius: Radius.sm },
  reasonOn: { backgroundColor: Colors.surfaceRaised },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: Colors.textMuted },
  radioOn: { borderColor: Colors.wrong, backgroundColor: Colors.wrong },
  input: { color: Colors.text, fontSize: 15, minHeight: 70, backgroundColor: Colors.background, borderRadius: Radius.sm, padding: Spacing.sm, textAlignVertical: 'top' },
});
