import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { APPEAL_STATUS_LABEL, RESTRICTIONS, SANCTION_LABEL, type SanctionView } from '@qu1z/shared';

import { AppText, Button, Card, LoadingState } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { api, errorMessage, useApi } from '@/net/api';

const date = (t: number) => new Date(t).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });

/** Une sanction et son appel : le joueur peut contester et suit la décision. */
function SanctionCard({ s }: { s: SanctionView }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [evidence, setEvidence] = useState('');
  const [error, setError] = useState<string | null>(null);
  const color = s.level === 'ban' ? Colors.wrong : s.level === 'suspension' ? Colors.goldInk : Colors.infoInk;

  const send = async () => {
    setError(null);
    try {
      await api('POST', `/api/me/sanctions/${s.id}/appeal`, { text, evidence: evidence.trim() || undefined });
      setOpen(false);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <Card style={{ borderColor: color, borderWidth: 1 }}>
      <AppText variant="label" color={color}>
        {SANCTION_LABEL[s.level]}
        {s.revokedAt ? ' · levée' : s.active ? ' · en cours' : ''}
      </AppText>
      <AppText>Motif : {s.reason}</AppText>
      <AppText variant="caption" muted>
        Le {date(s.startsAt)}
        {s.endsAt ? ` · jusqu’au ${date(s.endsAt)}` : ''}
      </AppText>
      {s.restrictions.length > 0 && (
        <AppText variant="caption" muted>
          Restreint : {s.restrictions.map((r) => RESTRICTIONS.find((x) => x.id === r)?.label.toLowerCase()).join(', ')}
        </AppText>
      )}
      {s.level === 'warning' && (
        <AppText variant="caption" muted>
          Rappel : respecte les autres joueurs. Les règles s’appliquent aux messages, groupes, publications et commentaires.
        </AppText>
      )}
      {s.appeal ? (
        <View style={styles.appeal}>
          <AppText variant="label">Ton appel : {APPEAL_STATUS_LABEL[s.appeal.status]}</AppText>
          <AppText variant="caption" muted>
            « {s.appeal.text} »
          </AppText>
          {s.appeal.decisionText && <AppText>Décision : {s.appeal.decisionText}</AppText>}
        </View>
      ) : s.revokedAt ? null : open ? (
        <View style={{ gap: Spacing.sm }}>
          <TextInput
            value={text}
            onChangeText={setText}
            maxLength={2000}
            multiline
            placeholder="Explique pourquoi tu contestes cette décision (10 caractères minimum)"
            placeholderTextColor={Colors.textMuted}
            accessibilityLabel="Explication de l’appel"
            style={styles.input}
          />
          <TextInput
            value={evidence}
            onChangeText={setEvidence}
            maxLength={2000}
            multiline
            placeholder="Éléments justificatifs (facultatif)"
            placeholderTextColor={Colors.textMuted}
            accessibilityLabel="Éléments justificatifs"
            style={styles.input}
          />
          {error && <AppText color={Colors.wrong}>{error}</AppText>}
          <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
            <Button label="Annuler" variant="outline" color={Colors.text} onPress={() => setOpen(false)} style={{ flex: 1 }} />
            <Button label="Envoyer l’appel" disabled={text.trim().length < 10} onPress={send} style={{ flex: 1 }} />
          </View>
        </View>
      ) : (
        <Button label="Contester cette décision" variant="outline" color={Colors.text} onPress={() => setOpen(true)} />
      )}
    </Card>
  );
}

export function SanctionsList() {
  const list = useApi<{ sanctions: SanctionView[] }>('/api/me/sanctions');
  const sanctions = list.data?.sanctions ?? [];
  return (
    <View style={{ gap: Spacing.md }}>
      <LoadingState visible={list.loading && !list.data} />
      {list.data && sanctions.length === 0 && <AppText muted>Aucune sanction sur ton compte.</AppText>}
      {sanctions.map((s) => (
        <SanctionCard key={s.id} s={s} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  appeal: { gap: 4, backgroundColor: Colors.background, borderRadius: Radius.sm, padding: Spacing.sm },
  input: { color: Colors.text, fontSize: 15, minHeight: 80, backgroundColor: Colors.background, borderRadius: Radius.sm, padding: Spacing.sm, textAlignVertical: 'top' },
});
