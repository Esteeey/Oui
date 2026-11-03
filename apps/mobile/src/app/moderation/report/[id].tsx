import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { reasonLabel, RESTRICTIONS, SANCTION_LABEL, type ReportDetail, type Restriction, type SanctionLevel } from '@qu1z/shared';

import { BackButton } from '@/components/back-button';
import { Chip, SectionHeader } from '@/components/social';
import { AppText, Button, Card, Screen } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { api, errorMessage, useApi } from '@/net/api';

interface SnapMessage {
  id: string;
  at: string;
  sender: string | null;
  kind: string;
  text: string | null;
  media?: string | null;
  gif?: string | null;
  sticker?: string | null;
  removed?: boolean;
}

const STATUS_LABEL = { open: 'Ouvert', in_review: 'En cours d’examen', closed: 'Clos' };

/** Dossier d'un signalement : contenu figé, contexte, historique du joueur, et actions de l'équipe. */
export default function ReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const report = useApi<ReportDetail>(`/api/mod/reports/${id}`);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [level, setLevel] = useState<SanctionLevel>('warning');
  const [reason, setReason] = useState('');
  const [hours, setHours] = useState('24');
  const [restrictions, setRestrictions] = useState<Restriction[]>(RESTRICTIONS.map((r) => r.id));
  const [resolution, setResolution] = useState('');
  const r = report.data;

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setMessage(null);
    try {
      await fn();
      setMessage({ ok: true, text: ok });
    } catch (e) {
      setMessage({ ok: false, text: errorMessage(e) });
    }
  };

  if (!r) {
    return (
      <Screen>
        <BackButton />
        <AppText muted>{report.error ? errorMessage(report.error) : 'Chargement…'}</AppText>
      </Screen>
    );
  }

  const snap = r.snapshot as {
    message?: SnapMessage;
    context?: SnapMessage[];
    recent?: SnapMessage[];
    directMessages?: SnapMessage[];
    conversation?: { kind: string; name: string | null; members: { pseudo: string; role: string; left: boolean }[] };
    profile?: { pseudo: string; bio: string };
    post?: { text: string; media: { url: string } | null; author: { pseudo: string } };
    comment?: { author: string; text: string };
  };
  const context = snap.context ?? snap.recent ?? snap.directMessages ?? [];
  const isGroup = snap.conversation?.kind === 'group';
  const removable = r.targetType === 'message' || r.targetType === 'media' ? 'message' : r.targetType === 'post' || r.targetType === 'comment' ? r.targetType : null;

  return (
    <Screen>
      <BackButton />
      <AppText variant="title">Signalement</AppText>
      <AppText variant="label">
        {reasonLabel(r.reason)} · {STATUS_LABEL[r.status]}
        {r.priority ? ' · prioritaire' : ''}
      </AppText>
      <AppText variant="caption" muted>
        Par {r.reporter.pseudo} ({r.reporterReportCount} signalement{r.reporterReportCount > 1 ? 's' : ''} au total) ·{' '}
        {new Date(r.createdAt).toLocaleString('fr-FR')}
      </AppText>
      {r.details && <AppText>« {r.details} »</AppText>}
      {message && <AppText color={message.ok ? Colors.correct : Colors.wrong}>{message.text}</AppText>}

      <SectionHeader title="Contenu signalé" />
      <Card>
        {snap.message && <AppText>{snap.message.text ?? `[${snap.message.kind}]`}</AppText>}
        {snap.message?.media && <AppText variant="caption">Photo : {snap.message.media}</AppText>}
        {snap.message?.gif && <AppText variant="caption">GIF : {snap.message.gif}</AppText>}
        {snap.message?.sticker && <AppText variant="caption">Sticker : {snap.message.sticker}</AppText>}
        {snap.post && <AppText>{snap.post.text || '[photo]'}</AppText>}
        {snap.comment && <AppText>{snap.comment.text}</AppText>}
        {snap.profile && (
          <AppText>
            Profil de {snap.profile.pseudo} · bio : {snap.profile.bio || '(vide)'}
          </AppText>
        )}
        {snap.conversation && (
          <AppText variant="caption" muted>
            {isGroup ? `Groupe « ${snap.conversation.name} »` : 'Conversation privée'} ·{' '}
            {snap.conversation.members.map((m) => `${m.pseudo}${m.role !== 'member' ? ` (${m.role})` : ''}${m.left ? ' [parti]' : ''}`).join(', ')}
          </AppText>
        )}
      </Card>

      {context.length > 0 && (
        <>
          <SectionHeader title="Contexte (figé au moment du signalement)" />
          <View style={styles.context}>
            {context.map((m) => (
              <View key={m.id} style={[styles.msg, m.id === snap.message?.id && styles.target]}>
                <AppText variant="caption" color={Colors.opponent}>
                  {m.sender ?? 'Système'} · {new Date(m.at).toLocaleString('fr-FR', { timeStyle: 'short', dateStyle: 'short' })}
                  {m.removed ? ' · retiré' : ''}
                </AppText>
                <AppText>{m.text ?? `[${m.kind}]`}</AppText>
              </View>
            ))}
          </View>
        </>
      )}

      <SectionHeader title="Traitement" />
      <View style={styles.buttons}>
        {r.status === 'open' && (
          <Button label="Prendre en charge" variant="outline" color={Colors.text} onPress={() => run(() => api('POST', `/api/mod/reports/${id}/status`, { status: 'in_review' }), 'Pris en charge.')} />
        )}
        {removable && (
          <Button
            label="Retirer le contenu"
            color={Colors.wrong}
            onPress={() => run(() => api('POST', '/api/mod/remove', { type: removable, id: r.targetId, reportId: id }), 'Contenu retiré (invisible pour les joueurs).')}
          />
        )}
        {isGroup && r.conversationId && r.targetUser && (
          <>
            <Button
              label={`Exclure ${r.targetUser.pseudo} du groupe (7 j)`}
              variant="outline"
              color={Colors.wrong}
              onPress={() =>
                run(() => api('POST', `/api/mod/groups/${r.conversationId}/exclusions`, { userId: r.targetUser!.id, hours: 24 * 7, reportId: id }), 'Exclu du groupe pour 7 jours.')
              }
            />
            <Button
              label="Exclure définitivement du groupe"
              variant="outline"
              color={Colors.wrong}
              onPress={() =>
                run(() => api('POST', `/api/mod/groups/${r.conversationId}/exclusions`, { userId: r.targetUser!.id, hours: null, reportId: id }), 'Exclu définitivement du groupe.')
              }
            />
          </>
        )}
        {r.targetType === 'group' && (
          <Button
            label="Fermer le groupe"
            color={Colors.wrong}
            onPress={() => run(() => api('POST', `/api/mod/groups/${r.targetId}/close`, { reportId: id }), 'Groupe fermé pour tous les membres.')}
          />
        )}
      </View>

      {r.targetUser && (
        <>
          <SectionHeader title={`Sanctionner ${r.targetUser.pseudo}`} />
          <AppText variant="caption" muted>
            {r.targetReportCount} signalement{r.targetReportCount > 1 ? 's' : ''} contre ce joueur au total.
          </AppText>
          <Card>
            <View style={styles.buttons}>
              {(['warning', 'suspension', 'ban'] as const).map((l) => (
                <Chip key={l} label={SANCTION_LABEL[l]} color={l === 'ban' ? Colors.wrong : Colors.gold} active={level === l} onPress={() => setLevel(l)} />
              ))}
            </View>
            {level === 'suspension' && (
              <>
                <View style={styles.buttons}>
                  {[
                    ['24', '24 h'],
                    ['72', '3 jours'],
                    ['168', '7 jours'],
                    ['720', '30 jours'],
                  ].map(([h, label]) => (
                    <Chip key={h} label={label} active={hours === h} onPress={() => setHours(h)} />
                  ))}
                </View>
                {RESTRICTIONS.map((x) => (
                  <Chip
                    key={x.id}
                    label={`${restrictions.includes(x.id) ? '✓ ' : ''}${x.label}`}
                    active={restrictions.includes(x.id)}
                    onPress={() => setRestrictions(restrictions.includes(x.id) ? restrictions.filter((y) => y !== x.id) : [...restrictions, x.id])}
                  />
                ))}
              </>
            )}
            <TextInput
              value={reason}
              onChangeText={setReason}
              maxLength={500}
              multiline
              placeholder="Motif communiqué au joueur"
              placeholderTextColor={Colors.textMuted}
              accessibilityLabel="Motif de la sanction"
              style={styles.input}
            />
            <Button
              label={`Appliquer : ${SANCTION_LABEL[level]}`}
              color={level === 'ban' ? Colors.wrong : Colors.gold}
              disabled={!reason.trim()}
              onPress={() =>
                run(
                  () =>
                    api('POST', '/api/mod/sanctions', {
                      userId: r.targetUser!.id,
                      level,
                      reason,
                      reportId: id,
                      ...(level === 'suspension' ? { hours: Number(hours), restrictions } : {}),
                    }),
                  `${SANCTION_LABEL[level]} appliqué.`,
                )
              }
            />
          </Card>

          {r.targetSanctions.length > 0 && (
            <>
              <SectionHeader title="Historique des sanctions" />
              {r.targetSanctions.map((s) => (
                <View key={s.id} style={styles.msg}>
                  <AppText variant="label">
                    {SANCTION_LABEL[s.level]} · {new Date(s.startsAt).toLocaleDateString('fr-FR')}
                    {s.revokedAt ? ' · levée' : s.active ? ' · en cours' : ''}
                  </AppText>
                  <AppText variant="caption" muted>
                    {s.reason}
                    {s.appeal ? ` · appel : ${s.appeal.status}` : ''}
                  </AppText>
                  {!s.revokedAt && s.level !== 'warning' && (
                    <Button
                      label="Lever la sanction"
                      variant="outline"
                      color={Colors.text}
                      onPress={() => run(() => api('POST', `/api/mod/sanctions/${s.id}/revoke`, { reason: 'Levée par l’équipe' }), 'Sanction levée.')}
                    />
                  )}
                </View>
              ))}
            </>
          )}

          {r.linkedAccounts.length > 0 && (
            <>
              <SectionHeader title="Comptes vus sur le même réseau" />
              <AppText variant="caption" muted>
                Simple indice : un même réseau peut être partagé (famille, école, wifi public). Aucune sanction automatique.
              </AppText>
              {r.linkedAccounts.map((l) => (
                <AppText key={l.user.id}>
                  {l.user.pseudo} · {l.status === 'banned' ? 'banni' : l.status}
                </AppText>
              ))}
            </>
          )}
        </>
      )}

      <SectionHeader title="Clore le signalement" />
      <TextInput
        value={resolution}
        onChangeText={setResolution}
        maxLength={500}
        multiline
        placeholder="Résolution (interne)"
        placeholderTextColor={Colors.textMuted}
        accessibilityLabel="Résolution du signalement"
        style={styles.input}
      />
      <Button
        label={r.status === 'closed' ? 'Rouvrir' : 'Clore le signalement'}
        variant="outline"
        color={Colors.text}
        onPress={() =>
          run(
            () => api('POST', `/api/mod/reports/${id}/status`, { status: r.status === 'closed' ? 'open' : 'closed', resolution: resolution || undefined }),
            r.status === 'closed' ? 'Rouvert.' : 'Signalement clos. Le signalant est informé.',
          )
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  context: { gap: 4 },
  msg: { backgroundColor: Colors.surface, borderRadius: Radius.sm, padding: Spacing.sm, gap: 2 },
  target: { borderWidth: 2, borderColor: Colors.wrong },
  input: { color: Colors.text, fontSize: 15, minHeight: 60, backgroundColor: Colors.surface, borderRadius: Radius.sm, padding: Spacing.sm, textAlignVertical: 'top' },
});
