import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';

import { MAX_GROUP_NAME_LENGTH, type UserSummary } from '@qu1z/shared';

import { PlayerPicker } from '@/components/group';
import { AppText, Button, Card, Screen } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { api, errorMessage } from '@/net/api';

/** Nouveau groupe : un nom et des joueurs à inviter (ils devront accepter l'invitation). */
export default function NewGroupScreen() {
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<UserSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setError(null);
    setBusy(true);
    try {
      const r = await api<{ conversationId: string }>('POST', '/api/groups', { name, userIds: selected.map((u) => u.id) });
      router.replace({ pathname: '/messages/[id]', params: { id: r.conversationId } });
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <Screen title="Nouveau groupe" back="close">
      <Card>
        <AppText variant="label">Nom du groupe</AppText>
        <TextInput
          value={name}
          onChangeText={setName}
          maxLength={MAX_GROUP_NAME_LENGTH}
          placeholder="Ex. : Les génies du quiz"
          placeholderTextColor={Colors.textMuted}
          accessibilityLabel="Nom du groupe"
          style={styles.input}
        />
      </Card>
      <AppText variant="label">Inviter des joueurs</AppText>
      <PlayerPicker selected={selected} onChange={setSelected} />
      <AppText variant="caption" muted>
        Chaque joueur reçoit une invitation dans sa messagerie et choisit de rejoindre ou non. Tu pourras ajouter la photo du groupe ensuite.
      </AppText>
      {error && <AppText color={Colors.wrong}>{error}</AppText>}
      <Button
        label={busy ? 'Création…' : selected.length ? `Créer et inviter ${selected.length} joueur${selected.length > 1 ? 's' : ''}` : 'Créer le groupe'}
        onPress={create}
        disabled={!name.trim() || busy}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: { color: Colors.text, fontSize: 16, backgroundColor: Colors.background, borderRadius: Radius.sm, paddingHorizontal: Spacing.sm, paddingVertical: 10 },
});
