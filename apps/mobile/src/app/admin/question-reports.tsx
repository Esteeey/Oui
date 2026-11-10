import { StyleSheet, View } from 'react-native';

import { QUESTION_REPORT_REASONS, getTheme, type QuestionReportView } from '@qu1z/shared';

import { AdminScreen, Hint, Pill, adminStyles } from '@/components/admin-ui';
import { AppText, Button, Card, LoadingState } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { api, useApi } from '@/net/api';

const reasonLabel = (id: string) => QUESTION_REPORT_REASONS.find((r) => r.id === id)?.label ?? id;

/** Questions signalées par les joueurs, les plus signalées d'abord. « Traité » retire la question de la liste. */
export default function QuestionReportsScreen() {
  const me = useApi<{ role: string }>('/api/me');
  const admin = me.data?.role === 'admin';
  const reports = useApi<{ questions: QuestionReportView[] }>(admin ? '/api/admin/question-reports' : null);
  const questions = reports.data?.questions ?? [];
  const resolve = (questionId: string) => api('POST', '/api/admin/question-reports/resolve', { questionId }).catch(() => {});

  if (me.data && !admin) {
    return (
      <AdminScreen title="Questions signalées">
        <AppText muted>Accès réservé aux administrateurs.</AppText>
      </AdminScreen>
    );
  }

  return (
    <AdminScreen title="Questions signalées">
      <View style={adminStyles.stack}>
        <LoadingState visible={reports.loading && !reports.data} label="Chargement des signalements" />
        {reports.data && questions.length === 0 && <Hint>Aucune question signalée pour l’instant.</Hint>}
        {questions.map((q) => (
          <Card key={q.questionId} style={styles.card}>
            <AppText variant="caption" muted>
              {getTheme(q.themeId)?.name ?? q.themeId} · {q.count} signalement{q.count > 1 ? 's' : ''} · {q.questionId}
            </AppText>
            <AppText variant="label">{q.text}</AppText>
            <AppText color={Colors.correct}>Réponse du jeu : {q.answer}</AppText>
            <View style={styles.reasons}>
              {q.reasons.map((r) => (
                <Pill key={r.id} label={`${reasonLabel(r.id)}${r.count > 1 ? ` × ${r.count}` : ''}`} />
              ))}
            </View>
            {q.details.map((d, i) => (
              <AppText key={i} muted>
                « {d} »
              </AppText>
            ))}
            <Button small label="Traité" variant="outline" color={Colors.text} onPress={() => void resolve(q.questionId)} />
          </Card>
        ))}
      </View>
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.sm },
  reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
