import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { MAX_QUESTION_REPORT_DETAILS, QUESTION_REPORT_REASONS, type QuestionReportReason } from '@qu1z/shared';

import { Tap } from '@/components/tap';
import { AppText, Button } from '@/components/ui';
import { Colors, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { api, errorMessage } from '@/net/api';

export interface ReportedQuestion {
  id: string;
  themeId: string;
  text: string;
}

/** Signaler une erreur dans une question (mauvaise réponse, formulation…) : l'équipe la corrige ensuite. */
export function QuestionReportSheet({ question, onClose }: { question: ReportedQuestion | null; onClose: () => void }) {
  const [reason, setReason] = useState<QuestionReportReason | null>(null);
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
    if (!question || !reason) return;
    setBusy(true);
    setState(null);
    try {
      await api('POST', '/api/question-reports', { themeId: question.themeId, questionId: question.id, reason, details: details.trim() || undefined });
      setState({ ok: true, text: 'Merci ! Ton signalement a été envoyé, la question va être vérifiée.' });
    } catch (e) {
      setState({ ok: false, text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={!!question} transparent animationType="slide" onRequestClose={close}>
      <Pressable accessibilityRole="button" accessibilityLabel="Fermer" onPress={close} style={styles.backdrop} />
      <View style={styles.sheet}>
        <ScrollView contentContainerStyle={{ gap: Spacing.sm }} keyboardShouldPersistTaps="handled">
          <AppText variant="heading">Signaler cette question</AppText>
          <AppText muted>« {question?.text} »</AppText>
          {state?.ok ? (
            <>
              <AppText color={Colors.correct}>{state.text}</AppText>
              <Button label="Fermer" onPress={close} />
            </>
          ) : (
            <>
              {QUESTION_REPORT_REASONS.map((r) => (
                <Tap
                  key={r.id}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: reason === r.id }}
                  accessibilityLabel={r.label}
                  onPress={() => setReason(r.id)}
                  style={[styles.reason, reason === r.id && styles.reasonOn]}>
                  <View style={[styles.radio, reason === r.id && styles.radioOn]} />
                  <AppText style={{ flex: 1 }}>{r.label}</AppText>
                </Tap>
              ))}
              <TextInput
                value={details}
                onChangeText={setDetails}
                maxLength={MAX_QUESTION_REPORT_DETAILS}
                multiline
                placeholder="Précise si tu veux (facultatif)"
                placeholderTextColor={Colors.textMuted}
                accessibilityLabel="Détails du signalement"
                style={styles.input}
              />
              {state && <AppText color={Colors.wrong}>{state.text}</AppText>}
              <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                <Button label="Annuler" variant="outline" color={Colors.text} onPress={close} style={{ flex: 1 }} />
                <Button label={busy ? 'Envoi…' : 'Envoyer'} disabled={!reason || busy} onPress={send} style={{ flex: 1 }} />
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
  reason: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: 12, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border },
  reasonOn: { borderColor: Colors.accent, backgroundColor: Colors.surfaceRaised },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: Colors.textMuted },
  radioOn: { borderColor: Colors.accent, backgroundColor: Colors.accent },
  input: { minHeight: 70, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, padding: 10, color: Colors.text, textAlignVertical: 'top' },
});
