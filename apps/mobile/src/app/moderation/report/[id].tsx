import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { reasonLabel, RESTRICTIONS, SANCTION_LABEL, type ReportDetail, type Restriction, type SanctionLevel } from '@qu1z/shared';

import { AdminScreen, ConfirmSheet, Dock, Field, Fold, Hint, Pill, Pills, SectionLabel, Sheet, SheetAction, adminStyles, type Notice } from '@/components/admin-ui';
import { Tap } from '@/components/tap';
import { AppText, Button, Card } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { api, errorMessage, invalidateAll, useApi } from '@/net/api';

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

interface Confirm {
  title: string;
  text: string;
  label: string;
  ok: string;
  task: () => Promise<unknown>;
}

const STATUS_LABEL = { open: 'Ouvert', in_review: 'En cours d’examen', closed: 'Clos' };

/** Dossier d'un signalement : contenu figé d'abord, le reste replié, et les actions de l'équipe sous le pouce. */
export default function ReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const report = useApi<ReportDetail>(`/api/mod/reports/${id}`);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [sheet, setSheet] = useState<'actions' | 'sanction' | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [busy, setBusy] = useState(false);
  const [level, setLevel] = useState<SanctionLevel>('warning');
  const [reason, setReason] = useState('');
  const [hours, setHours] = useState('24');
  const [restrictions, setRestrictions] = useState<Restriction[]>(RESTRICTIONS.map((r) => r.id));
  const [resolution, setResolution] = useState('');
  const r = report.data;

  const run = async (task: () => Promise<unknown>, ok: string) => {
    setNotice(null);
    setBusy(true);
    try {
      await task();
      setNotice({ ok: true, text: ok });
      setSheet(null);
      setConfirm(null);
      report.refresh();
      invalidateAll();
    } catch (e) {
      setNotice({ ok: false, text: errorMessage(e) });
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  };

  if (!r) {
    return (
      <AdminScreen title="Signalement">
        <AppText muted>{report.error ? errorMessage(report.error) : 'Chargement…'}</AppText>
      </AdminScreen>
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
  const canExclude = isGroup && !!r.conversationId && !!r.targetUser;
  const canAct = !!removable || canExclude || r.targetType === 'group' || !!r.targetUser;

  const ask = (next: Confirm) => {
    setSheet(null);
    setConfirm(next);
  };
  const toggleRestriction = (restriction: Restriction) =>
    setRestrictions(restrictions.includes(restriction) ? restrictions.filter((y) => y !== restriction) : [...restrictions, restriction]);

  const overlay = confirm ? (
    <ConfirmSheet title={confirm.title} text={confirm.text} confirmLabel={confirm.label} danger busy={busy} onCancel={() => setConfirm(null)} onConfirm={() => void run(confirm.task, confirm.ok)} />
  ) : sheet === 'actions' ? (
    <Sheet title="Traiter le signalement" onClose={() => setSheet(null)}>
      {removable && (
        <SheetAction
          icon="trash-outline"
          label="Retirer le contenu"
          danger
          onPress={() => ask({ title: 'Retirer ce contenu ?', text: 'Il devient invisible pour les joueurs.', label: 'Retirer', ok: 'Contenu retiré (invisible pour les joueurs).', task: () => api('POST', '/api/mod/remove', { type: removable, id: r.targetId, reportId: id }) })}
        />
      )}
      {canExclude && (
        <>
          <SheetAction
            icon="exit-outline"
            label={`Exclure ${r.targetUser!.pseudo} du groupe (7 j)`}
            danger
            onPress={() => ask({ title: `Exclure ${r.targetUser!.pseudo} pour 7 jours ?`, text: 'Exclusion de ce groupe pendant 7 jours.', label: 'Exclure', ok: 'Exclu du groupe pour 7 jours.', task: () => api('POST', `/api/mod/groups/${r.conversationId}/exclusions`, { userId: r.targetUser!.id, hours: 24 * 7, reportId: id }) })}
          />
          <SheetAction
            icon="exit-outline"
            label="Exclure définitivement du groupe"
            danger
            onPress={() => ask({ title: `Exclure définitivement ${r.targetUser!.pseudo} ?`, text: 'Exclusion définitive de ce groupe.', label: 'Exclure', ok: 'Exclu définitivement du groupe.', task: () => api('POST', `/api/mod/groups/${r.conversationId}/exclusions`, { userId: r.targetUser!.id, hours: null, reportId: id }) })}
          />
        </>
      )}
      {r.targetType === 'group' && (
        <SheetAction
          icon="ban-outline"
          label="Fermer le groupe"
          danger
          onPress={() => ask({ title: 'Fermer ce groupe ?', text: 'Le groupe sera fermé pour tous ses membres.', label: 'Fermer', ok: 'Groupe fermé pour tous les membres.', task: () => api('POST', `/api/mod/groups/${r.targetId}/close`, { reportId: id }) })}
        />
      )}
      {r.targetUser && <SheetAction icon="shield-outline" label={`Sanctionner ${r.targetUser.pseudo}`} onPress={() => setSheet('sanction')} />}
    </Sheet>
  ) : sheet === 'sanction' && r.targetUser ? (
    <Sheet title={`Sanctionner ${r.targetUser.pseudo}`} onClose={() => setSheet(null)}>
      <Hint>
        {r.targetReportCount} signalement{r.targetReportCount > 1 ? 's' : ''} contre ce joueur au total.
      </Hint>
      <Pills
        value={level}
        onChange={setLevel}
        color={Colors.gold}
        options={(['warning', 'suspension', 'ban'] as const).map((l) => ({ value: l, label: SANCTION_LABEL[l], color: l === 'ban' ? Colors.wrong : Colors.gold }))}
      />
      {level === 'suspension' && (
        <>
          <Field label="Durée">
            <Pills
              value={hours}
              onChange={setHours}
              options={[
                { value: '24', label: '24 h' },
                { value: '72', label: '3 jours' },
                { value: '168', label: '7 jours' },
                { value: '720', label: '30 jours' },
              ]}
            />
          </Field>
          <Field label="Restrictions">
            {RESTRICTIONS.map((x) => {
              const on = restrictions.includes(x.id);
              return (
                <Tap key={x.id} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => toggleRestriction(x.id)} style={styles.check}>
                  <View style={[styles.box, on && styles.boxOn]}>{on && <AppText color={Colors.onAccent} style={styles.tick}>✓</AppText>}</View>
                  <AppText style={adminStyles.grow}>{x.label}</AppText>
                </Tap>
              );
            })}
          </Field>
        </>
      )}
      <Field label="Motif communiqué au joueur">
        <TextInput value={reason} onChangeText={setReason} maxLength={500} multiline placeholder="Écris le motif" placeholderTextColor={Colors.textMuted} accessibilityLabel="Motif de la sanction" style={[adminStyles.input, adminStyles.multiline, { minHeight: 84 }]} />
      </Field>
      {notice && !notice.ok && <AppText color={Colors.wrong}>{notice.text}</AppText>}
      <Button
        label={`Appliquer : ${SANCTION_LABEL[level]}`}
        color={level === 'ban' ? Colors.wrong : Colors.gold}
        disabled={busy || !reason.trim()}
        onPress={() =>
          void run(
            () => api('POST', '/api/mod/sanctions', { userId: r.targetUser!.id, level, reason, reportId: id, ...(level === 'suspension' ? { hours: Number(hours), restrictions } : {}) }),
            `${SANCTION_LABEL[level]} appliqué.`,
          )
        }
      />
    </Sheet>
  ) : null;

  const dock =
    r.status === 'open' || canAct ? (
      <Dock>
        {r.status === 'open' && (
          <Button label="Prendre en charge" variant="outline" color={Colors.text} disabled={busy} onPress={() => void run(() => api('POST', `/api/mod/reports/${id}/status`, { status: 'in_review' }), 'Pris en charge.')} style={adminStyles.grow} />
        )}
        {canAct && <Button label="Agir" disabled={busy} onPress={() => setSheet('actions')} style={r.status === 'open' ? styles.act : adminStyles.grow} />}
      </Dock>
    ) : undefined;

  return (
    <AdminScreen title="Signalement" notice={notice} dock={dock} sheet={overlay}>
      <View style={adminStyles.stack}>
        <View style={adminStyles.row}>
          <AppText style={[adminStyles.strong, adminStyles.grow]}>
            {reasonLabel(r.reason)} · {STATUS_LABEL[r.status]}
          </AppText>
          {r.priority && <Pill label="Prioritaire" color="#7A5800" background="#FFF6DC" />}
        </View>
        <Hint>
          Par {r.reporter.pseudo} ({r.reporterReportCount} signalement{r.reporterReportCount > 1 ? 's' : ''} au total) · {new Date(r.createdAt).toLocaleString('fr-FR')}
        </Hint>
        {r.details && <AppText>« {r.details} »</AppText>}
      </View>

      <Card>
        <SectionLabel>Contenu signalé</SectionLabel>
        {snap.message && <AppText>{snap.message.text ?? `[${snap.message.kind}]`}</AppText>}
        {snap.message?.media && <Hint>Photo : {snap.message.media}</Hint>}
        {snap.message?.gif && <Hint>GIF : {snap.message.gif}</Hint>}
        {snap.message?.sticker && <Hint>Sticker : {snap.message.sticker}</Hint>}
        {snap.post && <AppText>{snap.post.text || '[photo]'}</AppText>}
        {snap.comment && <AppText>{snap.comment.text}</AppText>}
        {snap.profile && (
          <AppText>
            Profil de {snap.profile.pseudo} · bio : {snap.profile.bio || '(vide)'}
          </AppText>
        )}
        {snap.conversation && (
          <Hint>
            {isGroup ? `Groupe « ${snap.conversation.name} »` : 'Conversation privée'} ·{' '}
            {snap.conversation.members.map((m) => `${m.pseudo}${m.role !== 'member' ? ` (${m.role})` : ''}${m.left ? ' [parti]' : ''}`).join(', ')}
          </Hint>
        )}
      </Card>

      {context.length > 0 && (
        <Fold title={`Contexte · ${context.length} message${context.length > 1 ? 's' : ''}`} defaultOpen>
          <Hint>Figé au moment du signalement.</Hint>
          {context.map((m) => (
            <View key={m.id} style={[styles.msg, m.id === snap.message?.id && styles.target]}>
              <Hint>
                {m.sender ?? 'Système'} · {new Date(m.at).toLocaleString('fr-FR', { timeStyle: 'short', dateStyle: 'short' })}
                {m.removed ? ' · retiré' : ''}
              </Hint>
              <AppText>{m.text ?? `[${m.kind}]`}</AppText>
            </View>
          ))}
        </Fold>
      )}

      {r.targetUser && r.targetSanctions.length > 0 && (
        <Fold title={`Historique de ${r.targetUser.pseudo} · ${r.targetSanctions.length} sanction${r.targetSanctions.length > 1 ? 's' : ''}`}>
          {r.targetSanctions.map((s) => (
            <View key={s.id} style={styles.msg}>
              <AppText style={adminStyles.strong}>
                {SANCTION_LABEL[s.level]} · {new Date(s.startsAt).toLocaleDateString('fr-FR')}
                {s.revokedAt ? ' · levée' : s.active ? ' · en cours' : ''}
              </AppText>
              <Hint>
                {s.reason}
                {s.appeal ? ` · appel : ${s.appeal.status}` : ''}
              </Hint>
              {!s.revokedAt && s.level !== 'warning' && (
                <Button label="Lever la sanction" variant="outline" color={Colors.text} compact disabled={busy} onPress={() => void run(() => api('POST', `/api/mod/sanctions/${s.id}/revoke`, { reason: 'Levée par l’équipe' }), 'Sanction levée.')} />
              )}
            </View>
          ))}
        </Fold>
      )}

      {r.targetUser && r.linkedAccounts.length > 0 && (
        <Fold title={`Comptes vus sur le même réseau · ${r.linkedAccounts.length}`}>
          <Hint>Simple indice : un même réseau peut être partagé (famille, école, wifi public). Aucune sanction automatique.</Hint>
          {r.linkedAccounts.map((l) => (
            <AppText key={l.user.id}>
              {l.user.pseudo} · {l.status === 'banned' ? 'banni' : l.status}
            </AppText>
          ))}
        </Fold>
      )}

      <Fold title={r.status === 'closed' ? 'Rouvrir le signalement' : 'Clore le signalement'}>
        <TextInput value={resolution} onChangeText={setResolution} maxLength={500} multiline placeholder="Résolution (interne)" placeholderTextColor={Colors.textMuted} accessibilityLabel="Résolution du signalement" style={[adminStyles.input, adminStyles.multiline, { minHeight: 70 }]} />
        <Button
          label={r.status === 'closed' ? 'Rouvrir' : 'Clore le signalement'}
          variant="outline"
          color={Colors.text}
          disabled={busy}
          onPress={() =>
            void run(
              () => api('POST', `/api/mod/reports/${id}/status`, { status: r.status === 'closed' ? 'open' : 'closed', resolution: resolution || undefined }),
              r.status === 'closed' ? 'Rouvert.' : 'Signalement clos. Le signalant est informé.',
            )
          }
        />
      </Fold>
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  act: { minWidth: 110 },
  msg: { backgroundColor: Colors.background, borderRadius: Radius.sm, padding: Spacing.sm + 2, gap: 2 },
  target: { borderWidth: 2, borderColor: Colors.wrong },
  check: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm + 2, minHeight: 44 },
  box: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface },
  boxOn: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  tick: { fontSize: 14, lineHeight: 18, fontWeight: '700' },
});
