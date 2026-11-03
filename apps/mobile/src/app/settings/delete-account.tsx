import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';

import { AppText, Button, Card, Screen } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { api, errorMessage, invalidateAll, TOKEN_KEY } from '@/net/api';
import { useGameServer } from '@/state/game-server';

const CONFIRMATION = 'SUPPRIMER';

const DELETED = [
  'Ton profil : pseudo, photo, couverture, bio, pays',
  'Ta progression : XP, cotes, statistiques, historique, médailles',
  'Tes publications, commentaires, j’aime et mentions',
  'Tes messages, tes médias et tes demandes de message',
  'Tes abonnements, abonnés, blocages et notifications',
  'Ton adresse e-mail, tes sessions et tes appareils',
];

/**
 * Suppression définitive du compte. Seules les preuves de modération (signalements, sanctions) sont conservées 6 mois,
 * sans pseudo ni e-mail, puis effacées.
 */
export default function DeleteAccountScreen() {
  const { switchAccount } = useGameServer();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await api('POST', '/api/me/delete', { confirm: CONFIRMATION });
      // L'appareil repart de zéro avec un nouveau compte invité.
      await AsyncStorage.multiRemove([TOKEN_KEY, 'qu1z.pushToken']);
      switchAccount();
      setTimeout(invalidateAll, 800);
      router.replace('/');
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <Screen title="Suppression" back>
      <Card>
        <AppText variant="label" color={Colors.wrong}>
          Cette action est définitive
        </AppText>
        <AppText muted>Ton compte et toutes les données qui y sont liées seront effacés. Tu ne pourras pas les récupérer.</AppText>
        {DELETED.map((line) => (
          <AppText key={line}>• {line}</AppText>
        ))}
      </Card>
      <Card>
        <AppText variant="label">Ce qui est conservé</AppText>
        <AppText muted>
          Les signalements et sanctions qui te concernent sont gardés 6 mois, sans ton pseudo ni ton e-mail, pour respecter nos obligations de
          modération, puis effacés. Dans l’historique des autres joueurs, tu apparais comme « Joueur supprimé ».
        </AppText>
      </Card>
      <Card>
        <AppText variant="label">Pour confirmer, écris {CONFIRMATION}</AppText>
        <TextInput
          value={typed}
          onChangeText={setTyped}
          placeholder={CONFIRMATION}
          placeholderTextColor={Colors.textMuted}
          autoCapitalize="characters"
          autoCorrect={false}
          accessibilityLabel={`Écris ${CONFIRMATION} pour confirmer`}
          style={styles.input}
        />
        <Button
          label={busy ? 'Suppression…' : 'Supprimer définitivement mon compte'}
          color={Colors.wrong}
          disabled={typed.trim().toUpperCase() !== CONFIRMATION || busy}
          onPress={remove}
        />
      </Card>
      {error && <AppText color={Colors.wrong}>{error}</AppText>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: {
    color: Colors.text,
    fontSize: 17,
    backgroundColor: Colors.background,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 12,
  },
});
