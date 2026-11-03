import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';

import { BackButton } from '@/components/back-button';
import { AppText, Button, Card, Screen } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { api, errorMessage, invalidateAll, TOKEN_KEY, useApi } from '@/net/api';
import { currentPushToken, registerForPush } from '@/net/push';
import { useGameServer } from '@/state/game-server';

interface Account {
  email: string | null;
  emailVerified: boolean;
  emailRequired: boolean;
}

/**
 * Compte et e-mail : ajouter son adresse (connexion sans mot de passe), retrouver son compte sur un
 * autre appareil, se déconnecter. Le lien magique reçu par e-mail ouvre cet écran avec le code déjà rempli.
 */
export default function AccountScreen() {
  const params = useLocalSearchParams<{ email?: string; code?: string }>();
  const { switchAccount } = useGameServer();
  const account = useApi<Account>('/api/me/account');
  const [email, setEmail] = useState(params.email ?? '');
  const [code, setCode] = useState(params.code ?? '');
  const [step, setStep] = useState<'email' | 'code'>(params.code ? 'code' : 'email');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const autoVerified = useRef(false);
  const a = account.data;

  const start = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await api('POST', '/api/auth/email/start', { email });
      setStep('code');
      setMessage({ ok: true, text: `Code envoyé à ${email.trim().toLowerCase()}. Il est valable 15 minutes.` });
    } catch (e) {
      setMessage({ ok: false, text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const verify = async (mail = email, value = code) => {
    setBusy(true);
    setMessage(null);
    try {
      const r = await api<{ result: 'linked' } | { result: 'login'; token: string }>('POST', '/api/auth/email/verify', { email: mail, code: value });
      if (r.result === 'login') {
        // Connexion au compte existant : nouveau jeton, reconnexion temps réel, push réenregistré.
        await AsyncStorage.setItem(TOKEN_KEY, r.token);
        switchAccount();
        setTimeout(() => {
          invalidateAll();
          void registerForPush();
        }, 800);
        setMessage({ ok: true, text: 'Tu es connecté à ton compte.' });
      } else {
        setMessage({ ok: true, text: 'Adresse e-mail confirmée. Ton compte est protégé.' });
      }
      setStep('email');
      setCode('');
      account.refresh();
    } catch (e) {
      setMessage({ ok: false, text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  // Lien magique : e-mail et code dans l'adresse → vérification automatique.
  useEffect(() => {
    if (params.email && params.code && !autoVerified.current) {
      autoVerified.current = true;
      void verify(params.email, params.code);
    }
  }, [params.email, params.code]); // eslint-disable-line react-hooks/exhaustive-deps

  const logout = async () => {
    setMessage(null);
    try {
      await api('POST', '/api/auth/logout', { pushToken: (await currentPushToken()) ?? undefined });
      await AsyncStorage.removeItem(TOKEN_KEY);
      switchAccount();
      router.replace('/');
    } catch (e) {
      setMessage({ ok: false, text: errorMessage(e) });
    }
  };

  return (
    <Screen>
      <BackButton />
      <AppText variant="title">Compte et e-mail</AppText>

      {a?.emailVerified ? (
        <Card>
          <AppText variant="label" color={Colors.correct}>
            ✓ Adresse confirmée
          </AppText>
          <AppText>{a.email}</AppText>
          <AppText variant="caption" muted>
            Pour retrouver ton compte sur un autre appareil, entre cette adresse sur l’écran « Compte et e-mail » : tu recevras un code.
          </AppText>
        </Card>
      ) : (
        <Card>
          <AppText variant="label">Protège ton compte</AppText>
          <AppText muted>
            Ajoute ton adresse e-mail pour ne jamais perdre ta progression et te connecter sur un autre appareil. Pas de mot de passe : tu reçois un
            code.
          </AppText>
          {a?.emailRequired && (
            <AppText color={Colors.gold}>Une adresse confirmée est nécessaire pour la messagerie, les publications et les groupes.</AppText>
          )}
          <AppText variant="caption" muted>
            Tu as déjà un compte avec e-mail ? Entre la même adresse : tu seras connecté à ce compte.
          </AppText>
        </Card>
      )}

      {!a?.emailVerified && step === 'email' && (
        <Card>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="ton@email.fr"
            placeholderTextColor={Colors.textMuted}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            accessibilityLabel="Adresse e-mail"
            style={styles.input}
          />
          <Button label={busy ? 'Envoi…' : 'Recevoir un code'} disabled={!email.includes('@') || busy} onPress={start} />
        </Card>
      )}

      {step === 'code' && (
        <Card>
          <AppText variant="label">Code reçu par e-mail</AppText>
          <TextInput
            value={code}
            onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
            placeholder="123456"
            placeholderTextColor={Colors.textMuted}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            accessibilityLabel="Code à 6 chiffres"
            style={[styles.input, styles.code]}
          />
          <Button label={busy ? 'Vérification…' : 'Valider'} disabled={code.length !== 6 || busy} onPress={() => verify()} />
          <Button label="Changer d’adresse" variant="outline" color={Colors.text} onPress={() => setStep('email')} />
        </Card>
      )}

      {message && <AppText color={message.ok ? Colors.correct : Colors.wrong}>{message.text}</AppText>}

      {a?.emailVerified && (
        <>
          <Button label="Se déconnecter de cet appareil" variant="outline" color={Colors.wrong} onPress={logout} />
          <AppText variant="caption" muted>
            Tu pourras te reconnecter avec ton adresse e-mail. Cet appareil ne recevra plus tes notifications.
          </AppText>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: { color: Colors.text, fontSize: 17, backgroundColor: Colors.background, borderRadius: Radius.sm, paddingHorizontal: Spacing.sm, paddingVertical: 12 },
  code: { fontSize: 28, letterSpacing: 8, textAlign: 'center', fontWeight: '800' },
});
