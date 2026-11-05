import { Inter_900Black } from '@expo-google-fonts/inter/900Black';
import { useFonts } from 'expo-font';
import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, type ReactNode } from 'react';

import { Colors } from '@/constants/theme';
import { listenToPushTaps } from '@/net/push';
import { BannedScreen } from '@/components/banned-screen';
import { LoginScreen } from '@/components/login-screen';
import { GameServerProvider, useGameServer } from '@/state/game-server';

SplashScreen.preventAutoHideAsync();

const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: Colors.background,
    card: Colors.background,
    text: Colors.text,
    primary: Colors.accent,
    border: Colors.border,
  },
};

export default function RootLayout() {
  // Police des scores, embarquée : même rendu sur le téléphone que sur le PC (sinon chaque appareil prend sa police système).
  const [fontsLoaded, fontError] = useFonts({ Inter_900Black });
  const ready = fontsLoaded || !!fontError;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  useEffect(() => {
    // Toucher une notification push ouvre la conversation ou le centre de notifications.
    return listenToPushTaps();
  }, []);

  if (!ready) return null;
  return (
    <ThemeProvider value={navigationTheme}>
      <GameServerProvider>
        <SafeAreaView style={{ flex: 1, backgroundColor: Colors.navy }} edges={['top']}>
          <StatusBar style="light" />
          <View style={{ height: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.navy }}>
            <Text style={{ color: Colors.onAccent, fontSize: 11, fontWeight: '800', letterSpacing: 1 }}>BÊTA · v1.0.7</Text>
          </View>
          <BannedGate>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: Colors.background },
              animation: 'slide_from_right',
            }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="duel/[themeId]" options={{ gestureEnabled: false, animation: 'fade' }} />
            <Stack.Screen name="results" options={{ gestureEnabled: false, animation: 'fade_from_bottom' }} />
            <Stack.Screen name="messages/index" />
            <Stack.Screen name="messages/[id]" />
            <Stack.Screen name="messages/new" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="messages/new-group" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="messages/group/[id]/index" />
            <Stack.Screen name="messages/group/[id]/invite" />
            <Stack.Screen name="settings/index" />
            <Stack.Screen name="settings/profile" />
            <Stack.Screen name="settings/delete-account" />
            <Stack.Screen name="settings/blocked" />
            <Stack.Screen name="settings/notifications" />
            <Stack.Screen name="settings/sanctions" />
            <Stack.Screen name="account" />
            <Stack.Screen name="moderation/index" />
            <Stack.Screen name="moderation/report/[id]" />
            <Stack.Screen name="announcement/[id]" />
            <Stack.Screen name="defi/[id]" />
            <Stack.Screen name="search" options={{ animation: 'fade' }} />
            <Stack.Screen name="discover" />
            <Stack.Screen name="notifications" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="compose" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          </Stack>
          </BannedGate>
        </SafeAreaView>
      </GameServerProvider>
    </ThemeProvider>
  );
}

/**
 * Sans compte connecté : seule la page de connexion est affichée (pas de mode invité).
 * Compte banni : seul l'écran des sanctions (et de l'appel) reste accessible.
 */
function BannedGate({ children }: { children: ReactNode }) {
  const { banned, signedOut } = useGameServer();
  if (signedOut) return <LoginScreen />;
  return banned ? <BannedScreen /> : children;
}
