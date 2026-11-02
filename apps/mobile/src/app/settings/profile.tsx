import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';

import { MAX_BIO_LENGTH, type PublicProfile } from '@qu1z/shared';

import { BackButton } from '@/components/back-button';
import { Chip, SectionHeader } from '@/components/social';
import { AppText, Button, Card, Screen } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { api, errorMessage, useApi } from '@/net/api';
import { useGameServer } from '@/state/game-server';

/** Réglages du profil : pseudo, bio, titre équipé, confidentialité, joueurs bloqués. */
export default function ProfileSettingsScreen() {
  const { playerId } = useGameServer();
  const me = useApi<PublicProfile>(playerId ? `/api/users/${playerId}` : null);
  const account = useApi<{ titles: string[] }>('/api/me');
  const [pseudo, setPseudo] = useState('');
  const [bio, setBio] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (me.data) {
      setPseudo(me.data.pseudo);
      setBio(me.data.bio);
    }
  }, [me.data?.pseudo, me.data?.bio]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (patch: Record<string, unknown>) => {
    setMessage(null);
    try {
      await api('PATCH', '/api/me/profile', patch);
      setMessage({ ok: true, text: 'Enregistré.' });
    } catch (e) {
      setMessage({ ok: false, text: errorMessage(e) });
    }
  };

  const p = me.data;
  return (
    <Screen>
      <BackButton />
      <AppText variant="title">Mon profil</AppText>

      <Card>
        <AppText variant="label">Pseudo</AppText>
        <TextInput value={pseudo} onChangeText={setPseudo} maxLength={20} autoCapitalize="none" accessibilityLabel="Pseudo" style={styles.input} />
        <AppText variant="caption" muted>
          3 à 20 caractères, sans espace. Les autres te mentionnent avec @{pseudo || 'pseudo'}.
        </AppText>
        <AppText variant="label" style={{ marginTop: Spacing.sm }}>
          Bio
        </AppText>
        <TextInput
          value={bio}
          onChangeText={setBio}
          maxLength={MAX_BIO_LENGTH}
          multiline
          accessibilityLabel="Bio"
          style={[styles.input, { minHeight: 70 }]}
        />
        <Button label="Enregistrer" onPress={() => save({ pseudo, bio })} disabled={!p || (pseudo === p.pseudo && bio === p.bio)} />
        {message && <AppText color={message.ok ? Colors.correct : Colors.wrong}>{message.text}</AppText>}
      </Card>

      <SectionHeader title="Titre affiché" />
      <View style={styles.chips}>
        <Chip label="Aucun" active={!p?.title} onPress={() => save({ equippedTitle: null })} />
        {(account.data?.titles ?? []).map((t) => (
          <Chip key={t} label={t} color={Colors.gold} active={p?.title === t} onPress={() => save({ equippedTitle: t })} />
        ))}
      </View>
      <AppText variant="caption" muted>
        De nouveaux titres se débloquent en montant de niveau.
      </AppText>

      <SectionHeader title="Confidentialité" />
      <Card style={{ gap: Spacing.md }}>
        <Toggle
          label="Profil privé"
          hint="Les nouveaux abonnés doivent être acceptés un par un. Seuls tes abonnés voient tes publications et statistiques."
          value={p?.isPrivate ?? false}
          onChange={(v) => save({ isPrivate: v })}
        />
        <Toggle label="Afficher ma liste d’abonnés" hint="Le nombre d’abonnés reste toujours visible." value={p?.showFollowers ?? true} onChange={(v) => save({ showFollowers: v })} />
        <Toggle label="Afficher ma liste d’abonnements" hint="Le nombre d’abonnements reste toujours visible." value={p?.showFollowing ?? true} onChange={(v) => save({ showFollowing: v })} />
      </Card>

      <Pressable accessibilityRole="button" onPress={() => router.push('/settings/notifications')} style={styles.link}>
        <AppText variant="label">Notifications</AppText>
        <AppText muted>›</AppText>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => router.push('/settings/blocked')} style={styles.link}>
        <AppText variant="label">Joueurs bloqués</AppText>
        <AppText muted>›</AppText>
      </Pressable>
    </Screen>
  );
}

function Toggle({ label, hint, value, onChange }: { label: string; hint: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.toggle}>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="label">{label}</AppText>
        <AppText variant="caption" muted>
          {hint}
        </AppText>
      </View>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={label} trackColor={{ true: Colors.player, false: Colors.border }} />
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    color: Colors.text,
    fontSize: 16,
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm + 4,
    paddingVertical: 10,
    textAlignVertical: 'top',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  link: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    minHeight: 52,
  },
});
