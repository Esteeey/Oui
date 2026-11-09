import { useState } from 'react';
import { TextInput, View } from 'react-native';

import { AdminScreen, ConfirmSheet, Dock, Field, Hint, Pill, Pills, SectionLabel, adminStyles, type Notice } from '@/components/admin-ui';
import { AppText, Button, Card } from '@/components/ui';
import { Colors } from '@/constants/theme';
import { api, errorMessage, useApi } from '@/net/api';

const KINDS = [
  { value: 'info', label: 'Information' },
  { value: 'update', label: 'Mise à jour' },
  { value: 'feature', label: 'Nouveauté' },
  { value: 'event', label: 'Événement' },
  { value: 'maintenance', label: 'Maintenance' },
] as const;

type Kind = (typeof KINDS)[number]['value'];

/** Annonce officielle à tous les joueurs (administrateurs), avec aperçu et confirmation avant l'envoi. */
export default function AdminAnnounceScreen() {
  const me = useApi<{ role: string }>('/api/me');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [kind, setKind] = useState<Kind>('info');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  if (me.data && me.data.role !== 'admin') {
    return (
      <AdminScreen title="Annonce officielle">
        <AppText muted>Accès réservé aux administrateurs.</AppText>
      </AdminScreen>
    );
  }

  const publish = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const r = await api<{ recipients: number }>('POST', '/api/admin/announcements', { title, body, kind });
      setNotice({ ok: true, text: `Annonce publiée (${r.recipients} joueurs).` });
      setTitle('');
      setBody('');
    } catch (e) {
      setNotice({ ok: false, text: errorMessage(e) });
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  const ready = !!title.trim() && !!body.trim();

  return (
    <AdminScreen
      title="Annonce officielle"
      notice={notice}
      dock={
        <Dock>
          <Button label="Publier l’annonce" disabled={!ready} onPress={() => setConfirming(true)} style={adminStyles.grow} />
        </Dock>
      }
      sheet={
        confirming && (
          <ConfirmSheet
            title="Envoyer à tous les joueurs ?"
            text="L’annonce sera publiée immédiatement."
            confirmLabel="Publier"
            busy={busy}
            onCancel={() => setConfirming(false)}
            onConfirm={() => void publish()}
          />
        )
      }>
      <Field label="Type">
        <Pills options={KINDS} value={kind} onChange={setKind} color={Colors.accent} />
      </Field>
      <Field label="Titre">
        <TextInput value={title} onChangeText={setTitle} maxLength={120} placeholder="Titre" placeholderTextColor={Colors.textMuted} accessibilityLabel="Titre de l’annonce" style={adminStyles.input} />
      </Field>
      <Field label="Texte">
        <TextInput
          value={body}
          onChangeText={setBody}
          maxLength={1000}
          multiline
          placeholder="Texte de l’annonce"
          placeholderTextColor={Colors.textMuted}
          accessibilityLabel="Texte de l’annonce"
          style={[adminStyles.input, adminStyles.multiline, { minHeight: 112 }]}
        />
        <Hint>{body.length} / 1000</Hint>
      </Field>
      {ready && (
        <View style={adminStyles.stack}>
          <SectionLabel>Aperçu</SectionLabel>
          <Card>
            <Pill label={KINDS.find((k) => k.value === kind)!.label} />
            <AppText style={adminStyles.strong}>{title}</AppText>
            <AppText>{body}</AppText>
          </Card>
        </View>
      )}
    </AdminScreen>
  );
}
