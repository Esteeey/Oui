import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import {
  APPEAL_STATUS_LABEL,
  reasonLabel,
  SANCTION_LABEL,
  type AppealSummary,
  type ModerationLogEntry,
  type ReportStatus,
  type ReportSummary,
} from '@qu1z/shared';

import { Chip } from '@/components/social';
import { AppText, Avatar, Button, Card, Screen } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { api, errorMessage, useApi } from '@/net/api';
import { avatarColor } from '@/utils/avatar';
import { timeAgo } from '@/utils/time';

type Tab = 'reports' | 'appeals' | 'log' | 'announce';

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
  exclusion_lifted: 'Exclusion de groupe levée',
  group_deleted: 'Groupe supprimé par son créateur',
};

/** Panneau de modération (modérateurs et administrateurs) : signalements, appels, journal, annonces. */
export default function ModerationScreen() {
  const me = useApi<{ role: string }>('/api/me');
  const params = useLocalSearchParams<{ tab?: Tab }>();
  const [tab, setTab] = useState<Tab>(params.tab === 'announce' ? 'announce' : 'reports');
  const staff = me.data?.role === 'moderator' || me.data?.role === 'admin';

  if (me.data && !staff) {
    return (
      <Screen back title="Modération">
        <AppText muted>Accès réservé à l’équipe de modération.</AppText>
      </Screen>
    );
  }

  return (
    <Screen title="Modération" back>
      <View style={styles.tabs}>
        <Chip label="Signalements" active={tab === 'reports'} onPress={() => setTab('reports')} />
        <Chip label="Appels" active={tab === 'appeals'} onPress={() => setTab('appeals')} />
        <Chip label="Journal" active={tab === 'log'} onPress={() => setTab('log')} />
        {me.data?.role === 'admin' && <Chip label="Annonce" active={tab === 'announce'} onPress={() => setTab('announce')} />}
      </View>
      {tab === 'reports' && <Reports />}
      {tab === 'appeals' && <Appeals />}
      {tab === 'log' && <Journal />}
      {tab === 'announce' && <Announce />}
    </Screen>
  );
}

function Reports() {
  const [status, setStatus] = useState<ReportStatus>('open');
  const list = useApi<{ reports: ReportSummary[] }>(`/api/mod/reports?status=${status}`);
  const reports = list.data?.reports ?? [];
  return (
    <>
      <View style={styles.tabs}>
        {(['open', 'in_review', 'closed'] as const).map((s) => (
          <Chip key={s} label={s === 'open' ? 'Ouverts' : s === 'in_review' ? 'En cours' : 'Clos'} color={Colors.opponent} active={status === s} onPress={() => setStatus(s)} />
        ))}
      </View>
      {list.data && reports.length === 0 && <AppText muted>Aucun signalement.</AppText>}
      {reports.map((r) => (
        <Pressable
          key={r.id}
          accessibilityRole="button"
          accessibilityLabel={`Signalement ${TYPE_LABEL[r.targetType]} : ${r.preview}`}
          onPress={() => router.push({ pathname: '/moderation/report/[id]', params: { id: r.id } })}>
          <Card style={r.priority ? { borderColor: Colors.gold, borderWidth: 1 } : undefined}>
            <View style={styles.row}>
              <AppText variant="label" style={{ flex: 1 }}>
                {r.priority ? '⚑ ' : ''}
                {TYPE_LABEL[r.targetType]} · {reasonLabel(r.reason)}
              </AppText>
              <AppText variant="caption" muted>
                {timeAgo(r.createdAt)}
              </AppText>
            </View>
            <AppText numberOfLines={2}>{r.preview}</AppText>
            <AppText variant="caption" muted>
              Signalé par {r.reporter.pseudo}
              {r.targetUser ? ` · visé : ${r.targetUser.pseudo}` : ''}
              {r.priority ? ' · demande d’un administrateur du groupe' : ''}
            </AppText>
          </Card>
        </Pressable>
      ))}
    </>
  );
}

function Appeals() {
  const list = useApi<{ appeals: AppealSummary[] }>('/api/mod/appeals');
  const [decision, setDecision] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const appeals = list.data?.appeals ?? [];
  const decide = (id: string, status: string) =>
    api('POST', `/api/mod/appeals/${id}`, { status, decision: decision[id] }).catch((e) => setError(errorMessage(e)));
  return (
    <>
      {error && <AppText color={Colors.wrong}>{error}</AppText>}
      {list.data && appeals.length === 0 && <AppText muted>Aucun appel en attente.</AppText>}
      {appeals.map((a) => (
        <Card key={a.id}>
          <View style={styles.row}>
            <Avatar name={a.user.pseudo} color={avatarColor(a.user.id)} uri={a.user.avatar} size={36} />
            <View style={{ flex: 1 }}>
              <AppText variant="label">{a.user.pseudo}</AppText>
              <AppText variant="caption" muted>
                {SANCTION_LABEL[a.sanction.level]} · {APPEAL_STATUS_LABEL[a.status]} · {timeAgo(a.createdAt)}
              </AppText>
            </View>
          </View>
          <AppText variant="caption" muted>
            Motif de la sanction : {a.sanction.reason}
          </AppText>
          <AppText>« {a.text} »</AppText>
          {a.evidence && <AppText variant="caption">Justificatifs : {a.evidence}</AppText>}
          <TextInput
            value={decision[a.id] ?? ''}
            onChangeText={(t) => setDecision({ ...decision, [a.id]: t })}
            placeholder="Décision communiquée au joueur"
            placeholderTextColor={Colors.textMuted}
            multiline
            accessibilityLabel={`Décision pour ${a.user.pseudo}`}
            style={styles.input}
          />
          <View style={styles.buttons}>
            {a.status === 'pending' && <Button label="Examiner" variant="outline" color={Colors.text} onPress={() => decide(a.id, 'in_review')} />}
            <Button label="Refuser" variant="outline" color={Colors.wrong} disabled={!decision[a.id]?.trim()} onPress={() => decide(a.id, 'rejected')} />
            <Button label="Accepter et lever" color={Colors.correct} disabled={!decision[a.id]?.trim()} onPress={() => decide(a.id, 'accepted')} />
          </View>
        </Card>
      ))}
    </>
  );
}

function Journal() {
  const list = useApi<{ entries: ModerationLogEntry[] }>('/api/mod/log');
  return (
    <>
      {(list.data?.entries ?? []).map((e) => (
        <View key={e.id} style={styles.logRow}>
          <AppText variant="label">{ACTION_LABEL[e.action] ?? e.action}</AppText>
          <AppText variant="caption" muted>
            {e.actor?.pseudo ?? '?'} ({e.actorRole === 'group_creator' ? 'créateur du groupe' : e.actorRole === 'group_admin' ? 'admin du groupe' : e.actorRole}) ·{' '}
            {timeAgo(e.createdAt)}
            {typeof e.details.reason === 'string' ? ` · ${e.details.reason}` : ''}
          </AppText>
        </View>
      ))}
    </>
  );
}

function Announce() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [kind, setKind] = useState('info');
  const [state, setState] = useState<{ ok: boolean; text: string } | null>(null);
  const publish = async () => {
    setState(null);
    try {
      const r = await api<{ recipients: number }>('POST', '/api/admin/announcements', { title, body, kind });
      setState({ ok: true, text: `Annonce publiée (${r.recipients} joueurs).` });
      setTitle('');
      setBody('');
    } catch (e) {
      setState({ ok: false, text: errorMessage(e) });
    }
  };
  const KINDS = [
    ['info', 'Information'],
    ['update', 'Mise à jour'],
    ['feature', 'Nouveauté'],
    ['event', 'Événement'],
    ['maintenance', 'Maintenance'],
  ];
  return (
    <Card>
      <AppText variant="label">Annonce officielle à tous les joueurs</AppText>
      <View style={styles.tabs}>
        {KINDS.map(([id, label]) => (
          <Chip key={id} label={label} active={kind === id} onPress={() => setKind(id)} />
        ))}
      </View>
      <TextInput value={title} onChangeText={setTitle} maxLength={120} placeholder="Titre" placeholderTextColor={Colors.textMuted} accessibilityLabel="Titre de l’annonce" style={styles.input} />
      <TextInput
        value={body}
        onChangeText={setBody}
        maxLength={1000}
        multiline
        placeholder="Texte de l’annonce"
        placeholderTextColor={Colors.textMuted}
        accessibilityLabel="Texte de l’annonce"
        style={[styles.input, { minHeight: 100 }]}
      />
      {state && <AppText color={state.ok ? Colors.correct : Colors.wrong}>{state.text}</AppText>}
      <Button label="Publier l’annonce" disabled={!title.trim() || !body.trim()} onPress={publish} />
    </Card>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  input: { color: Colors.text, fontSize: 15, backgroundColor: Colors.background, borderRadius: Radius.sm, padding: Spacing.sm, textAlignVertical: 'top' },
  logRow: { borderBottomWidth: 1, borderBottomColor: Colors.border, paddingVertical: Spacing.sm, gap: 2 },
});
