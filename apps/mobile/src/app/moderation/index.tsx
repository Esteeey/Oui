import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import {
  APPEAL_STATUS_LABEL,
  reasonLabel,
  SANCTION_LABEL,
  type AppealSummary,
  type ModerationLogEntry,
  type ReportStatus,
  type ReportSummary,
} from '@qu1z/shared';

import { AdminScreen, Field, Hint, Pill, Pills, Segmented, SectionLabel, Sheet, adminStyles, type Notice } from '@/components/admin-ui';
import { AppText, Avatar, Button, Card, LoadingState } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { api, errorMessage, invalidateAll, useApi } from '@/net/api';
import { avatarColor } from '@/utils/avatar';
import { timeAgo } from '@/utils/time';
import { Tap } from '@/components/tap';

type Tab = 'reports' | 'appeals' | 'log';

const TYPE_LABEL: Record<string, string> = {
  message: 'Message',
  media: 'Photo / GIF / sticker',
  user: 'Joueur',
  group: 'Groupe',
  post: 'Publication',
  comment: 'Commentaire',
};

/** Libellés lisibles des actions du journal. */
const ACTION_LABEL: Record<string, string> = {
  remove_content: 'Contenu retiré',
  group_exclude: 'Exclusion officielle d’un groupe',
  group_close: 'Groupe fermé',
  sanction_warning: 'Avertissement',
  sanction_suspension: 'Suspension',
  sanction_ban: 'Bannissement',
  sanction_revoked: 'Sanction levée',
  appeal_in_review: 'Appel pris en charge',
  appeal_accepted: 'Appel accepté',
  appeal_rejected: 'Appel refusé',
  report_in_review: 'Signalement pris en charge',
  report_closed: 'Signalement clos',
  report_open: 'Signalement rouvert',
  role_moderator: 'Nommé modérateur',
  role_player: 'Retiré de l’équipe',
  admin_added: 'Admin de groupe nommé',
  admin_removed: 'Droits d’admin de groupe retirés',
  creator_transferred: 'Groupe transféré',
  member_removed: 'Membre retiré d’un groupe',
  member_excluded: 'Membre exclu d’un groupe',
  animation_updated: 'Animation modifiée',
  animation_reset: 'Animation rétablie',
  sound_updated: 'Son remplacé',
  sound_reset: 'Son d’origine rétabli',
  exclusion_lifted: 'Exclusion de groupe levée',
  group_deleted: 'Groupe supprimé par son créateur',
};

const ROLE_LABEL: Record<string, string> = { group_creator: 'créateur du groupe', group_admin: 'admin du groupe', moderator: 'modérateur', admin: 'admin' };

/** Panneau de modération (modérateurs et administrateurs) : signalements, appels et journal. */
export default function ModerationScreen() {
  const me = useApi<{ role: string }>('/api/me');
  const params = useLocalSearchParams<{ tab?: Tab }>();
  const [tab, setTab] = useState<Tab>(params.tab === 'appeals' || params.tab === 'log' ? params.tab : 'reports');
  const staff = me.data?.role === 'moderator' || me.data?.role === 'admin';
  const open = useApi<{ reports: ReportSummary[] }>(staff ? '/api/mod/reports?status=open' : null);
  const appeals = useApi<{ appeals: AppealSummary[] }>(staff ? '/api/mod/appeals' : null);
  const [selected, setSelected] = useState<AppealSummary | null>(null);
  const [decision, setDecision] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  if (me.data && !staff) {
    return (
      <AdminScreen title="Modération">
        <AppText muted>Accès réservé à l’équipe de modération.</AppText>
      </AdminScreen>
    );
  }

  const decide = async (status: 'in_review' | 'rejected' | 'accepted', ok: string) => {
    if (!selected) return;
    setBusy(true);
    setNotice(null);
    try {
      await api('POST', `/api/mod/appeals/${selected.id}`, { status, decision });
      setNotice({ ok: true, text: ok });
      setSelected(null);
      setDecision('');
      appeals.refresh();
      invalidateAll();
    } catch (e) {
      setNotice({ ok: false, text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const closeAppeal = () => {
    setSelected(null);
    setDecision('');
  };

  const list = appeals.data?.appeals ?? [];
  const hasDecision = !!decision.trim();

  return (
    <AdminScreen
      title="Modération"
      notice={notice}
      scrollKey={tab}
      sheet={
        selected && (
          <Sheet onClose={closeAppeal}>
            <View style={adminStyles.row}>
              <Avatar name={selected.user.pseudo} color={avatarColor(selected.user.id)} uri={selected.user.avatar} size={40} />
              <View style={adminStyles.grow}>
                <AppText style={adminStyles.strong}>{selected.user.pseudo}</AppText>
                <Hint>
                  {SANCTION_LABEL[selected.sanction.level]} · {APPEAL_STATUS_LABEL[selected.status]} · {timeAgo(selected.createdAt)}
                </Hint>
              </View>
            </View>
            <Hint>Motif de la sanction : {selected.sanction.reason}</Hint>
            <AppText>« {selected.text} »</AppText>
            {selected.evidence && <Hint>Justificatifs : {selected.evidence}</Hint>}
            <Field label="Décision communiquée au joueur">
              <TextInput
                value={decision}
                onChangeText={setDecision}
                multiline
                placeholder="Écris ta décision"
                placeholderTextColor={Colors.textMuted}
                accessibilityLabel={`Décision pour ${selected.user.pseudo}`}
                style={[adminStyles.input, adminStyles.multiline, { minHeight: 84 }]}
              />
            </Field>
            {notice && !notice.ok && <AppText color={Colors.wrong}>{notice.text}</AppText>}
            {selected.status === 'pending' && <Button label="Examiner" variant="outline" color={Colors.text} disabled={busy} onPress={() => void decide('in_review', 'Appel pris en charge.')} />}
            <View style={styles.pair}>
              <Button label="Refuser" variant="outline" color={Colors.wrong} disabled={busy || !hasDecision} onPress={() => void decide('rejected', 'Appel refusé.')} style={adminStyles.grow} />
              <Button label="Accepter" color={Colors.correct} disabled={busy || !hasDecision} onPress={() => void decide('accepted', 'Appel accepté, sanction levée.')} style={adminStyles.grow} />
            </View>
          </Sheet>
        )
      }>
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'reports', label: 'Signalements', count: open.data?.reports.length },
          { value: 'appeals', label: 'Appels', count: list.length },
          { value: 'log', label: 'Journal' },
        ]}
      />
      {tab === 'reports' && <Reports />}
      {tab === 'appeals' && (
        <View style={adminStyles.stack}>
          <LoadingState visible={appeals.loading && !appeals.data} />
          {appeals.data && list.length === 0 && <AppText muted>Aucun appel en attente.</AppText>}
          {list.map((a) => (
            <Tap key={a.id} accessibilityRole="button" accessibilityLabel={`Traiter l’appel de ${a.user.pseudo}`} onPress={() => setSelected(a)}>
              <Card>
                <View style={adminStyles.row}>
                  <Avatar name={a.user.pseudo} color={avatarColor(a.user.id)} uri={a.user.avatar} size={40} />
                  <View style={adminStyles.grow}>
                    <AppText style={adminStyles.strong}>{a.user.pseudo}</AppText>
                    <Hint>
                      {SANCTION_LABEL[a.sanction.level]} · {APPEAL_STATUS_LABEL[a.status]} · {timeAgo(a.createdAt)}
                    </Hint>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                </View>
                <AppText numberOfLines={3}>« {a.text} »</AppText>
              </Card>
            </Tap>
          ))}
        </View>
      )}
      {tab === 'log' && <Journal />}
    </AdminScreen>
  );
}

function Reports() {
  const [status, setStatus] = useState<ReportStatus>('open');
  const list = useApi<{ reports: ReportSummary[] }>(`/api/mod/reports?status=${status}`);
  const reports = list.data?.reports ?? [];
  return (
    <>
      <Pills
        value={status}
        onChange={setStatus}
        options={[
          { value: 'open', label: 'Ouverts' },
          { value: 'in_review', label: 'En cours' },
          { value: 'closed', label: 'Clos' },
        ]}
      />
      <LoadingState visible={list.loading && !list.data} />
      {list.data && reports.length === 0 && <AppText muted>Aucun signalement.</AppText>}
      <View style={adminStyles.stack}>
        {reports.map((r) => (
          <Tap
            key={r.id}
            accessibilityRole="button"
            accessibilityLabel={`Signalement ${TYPE_LABEL[r.targetType]} : ${r.preview}`}
            onPress={() => router.push({ pathname: '/moderation/report/[id]', params: { id: r.id } })}>
            <Card>
              <View style={adminStyles.row}>
                <AppText style={[adminStyles.strong, adminStyles.grow]}>
                  {TYPE_LABEL[r.targetType]} · {reasonLabel(r.reason)}
                </AppText>
                {r.priority && <Pill label="Prioritaire" color="#7A5800" background="#FFF6DC" />}
              </View>
              <AppText numberOfLines={2}>{r.preview}</AppText>
              <Hint>
                Signalé par {r.reporter.pseudo}
                {r.targetUser ? ` · visé : ${r.targetUser.pseudo}` : ''} · {timeAgo(r.createdAt)}
                {r.priority ? ' · demande d’un administrateur du groupe' : ''}
              </Hint>
            </Card>
          </Tap>
        ))}
      </View>
    </>
  );
}

function dayOf(at: string | number): string {
  const date = new Date(at);
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((start(new Date()) - start(date)) / 86_400_000);
  if (days === 0) return 'Aujourd’hui';
  if (days === 1) return 'Hier';
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function Journal() {
  const list = useApi<{ entries: ModerationLogEntry[] }>('/api/mod/log');
  const days = new Map<string, ModerationLogEntry[]>();
  for (const entry of list.data?.entries ?? []) {
    const day = dayOf(entry.createdAt);
    days.set(day, [...(days.get(day) ?? []), entry]);
  }
  return (
    <>
      <LoadingState visible={list.loading && !list.data} />
      {list.data && days.size === 0 && <AppText muted>Aucune action enregistrée.</AppText>}
      {[...days].map(([day, entries]) => (
        <View key={day} style={adminStyles.stack}>
          <SectionLabel>{day}</SectionLabel>
          <Card style={styles.logCard}>
            {entries.map((e, index) => (
              <View key={e.id} style={[styles.logRow, index > 0 && styles.logLine]}>
                <AppText style={adminStyles.strong}>{ACTION_LABEL[e.action] ?? e.action}</AppText>
                <Hint>
                  {e.actor?.pseudo ?? '?'} ({ROLE_LABEL[e.actorRole] ?? e.actorRole}) · {timeAgo(e.createdAt)}
                  {typeof e.details.reason === 'string' ? ` · ${e.details.reason}` : ''}
                </Hint>
              </View>
            ))}
          </Card>
        </View>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  pair: { flexDirection: 'row', gap: Spacing.sm },
  logCard: { gap: 0, paddingVertical: 2 },
  logRow: { paddingVertical: 11, gap: 2 },
  logLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
});
