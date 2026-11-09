import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PSEUDO_PATTERN } from '@qu1z/shared';

import { Logo } from '@/components/header';
import { AppText, Button } from '@/components/ui';
import { Colors, Gradients, MaxContentWidth, Radius, Shadow, Spacing } from '@/constants/theme';
import { ApiError, authRequest, errorMessage, TOKEN_KEY } from '@/net/api';
import { useGameServer } from '@/state/game-server';
import { Tap } from '@/components/tap';

type Mode = 'login' | 'register';

const PASSWORD_MIN_LENGTH = 8;

/**
 * Page d'accueil sans compte : connexion (e-mail + mot de passe) ou inscription (e-mail, pseudo,
 * mot de passe). Il n'y a pas de mode invité : on ne joue qu'une fois connecté à son profil.
 */
export function LoginScreen() {
  const { switchAccount } = useGameServer();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [pseudo, setPseudo] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const register = mode === 'register';
  const valid =
    email.includes('@') &&
    password.length >= (register ? PASSWORD_MIN_LENGTH : 1) &&
    (!register || PSEUDO_PATTERN.test(pseudo.trim()));

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { token } = register
        ? await authRequest('/api/auth/register', { email, pseudo: pseudo.trim(), password })
        : await authRequest('/api/auth/login', { email, password });
      await AsyncStorage.setItem(TOKEN_KEY, token);
      switchAccount();
    } catch (e) {
      setError(e instanceof ApiError ? errorMessage(e) : 'Serveur injoignable. Vérifie ta connexion.');
      setBusy(false);
    }
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
  };

  return (
    <View style={styles.screen}>
      <LinearGradient colors={Gradients.banner} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SafeAreaView style={styles.flex}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.brand}>
              <View style={styles.logoTile}>
                <Logo size={68} />
              </View>
              <AppText variant="display" color={Colors.onAccent} style={styles.brandName}>
                Qu1z
              </AppText>
              <AppText color="rgba(255,255,255,0.78)" style={styles.center}>
                Affronte des joueurs du monde entier sur tes thèmes préférés.
              </AppText>
            </View>

            <View style={styles.sheet}>
              <View style={styles.tabs} accessibilityRole="tablist">
                {(['login', 'register'] as const).map((m) => (
                  <Tap
                    key={m}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: mode === m }}
                    onPress={() => switchMode(m)}
                    style={[styles.tab, mode === m && styles.tabActive]}>
                    <AppText variant="label" color={mode === m ? Colors.text : Colors.textMuted}>
                      {m === 'login' ? 'Connexion' : 'Inscription'}
                    </AppText>
                  </Tap>
                ))}
              </View>

              <Field
                icon="mail-outline"
                value={email}
                onChangeText={setEmail}
                placeholder="Adresse e-mail"
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                textContentType="emailAddress"
                returnKeyType="next"
              />
              {register && (
                <Field
                  icon="person-outline"
                  value={pseudo}
                  onChangeText={setPseudo}
                  placeholder="Pseudo"
                  autoCapitalize="none"
                  autoComplete="username"
                  textContentType="username"
                  maxLength={20}
                  returnKeyType="next"
                />
              )}
              <Field
                icon="lock-closed-outline"
                value={password}
                onChangeText={setPassword}
                placeholder="Mot de passe"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoComplete={register ? 'new-password' : 'current-password'}
                textContentType={register ? 'newPassword' : 'password'}
                returnKeyType="go"
                onSubmitEditing={submit}
                right={
                  <Tap
                    accessibilityRole="button"
                    accessibilityLabel={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                    hitSlop={10}
                    onPress={() => setShowPassword((v) => !v)}>
                    <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={22} color={Colors.textMuted} />
                  </Tap>
                }
              />
              {register && (
                <AppText variant="caption" muted>
                  Pseudo : 3 à 20 caractères, sans espace. Mot de passe : au moins {PASSWORD_MIN_LENGTH} caractères. Photo, pays et bio se
                  règlent ensuite dans ton profil.
                </AppText>
              )}

              {error && (
                <AppText color={Colors.wrong} accessibilityRole="alert">
                  {error}
                </AppText>
              )}

              <Button
                label={busy ? 'Un instant…' : register ? 'Créer mon compte' : 'Se connecter'}
                disabled={!valid || busy}
                onPress={submit}
              />

              <Tap accessibilityRole="button" onPress={() => switchMode(register ? 'login' : 'register')} style={styles.switch}>
                <AppText muted style={styles.center}>
                  {register ? 'Déjà un compte ? ' : 'Pas encore de compte ? '}
                  <AppText variant="label" color={Colors.accentInk}>
                    {register ? 'Se connecter' : 'S’inscrire'}
                  </AppText>
                </AppText>
              </Tap>
            </View>
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </View>
  );
}

function Field({ icon, right, ...props }: TextInputProps & { icon: keyof typeof Ionicons.glyphMap; right?: ReactNode }) {
  return (
    <View style={styles.field}>
      <Ionicons name={icon} size={20} color={Colors.textMuted} />
      <TextInput {...props} accessibilityLabel={props.placeholder} placeholderTextColor={Colors.textMuted} style={styles.input} />
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  // Tuile blanche : le violet du logo disparaîtrait sur le dégradé de fond.
  logoTile: { width: 96, height: 96, borderRadius: 24, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  screen: { flex: 1, backgroundColor: Colors.navy },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: Spacing.md, gap: Spacing.lg, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  brand: { alignItems: 'center', gap: Spacing.sm, paddingTop: Spacing.lg },
  brandName: { marginTop: Spacing.xs },
  center: { textAlign: 'center' },
  sheet: { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, gap: Spacing.md, ...Shadow },
  tabs: { flexDirection: 'row', backgroundColor: Colors.surfaceRaised, borderRadius: Radius.pill, padding: 4 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: Radius.pill },
  tabActive: { backgroundColor: Colors.surface, boxShadow: '0 1px 4px rgba(18, 26, 51, 0.12)' },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.background,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
  },
  input: { flex: 1, color: Colors.text, fontSize: 17, paddingVertical: 14 },
  switch: { paddingVertical: Spacing.xs },
});
