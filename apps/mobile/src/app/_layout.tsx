import { Inter_900Black } from '@expo-google-fonts/inter/900Black';
import { useFonts } from 'expo-font';
import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { BlurTargetView } from 'expo-blur';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useEffect, type ReactNode } from 'react';

import { Colors } from '@/constants/theme';
import { listenToPushTaps } from '@/net/push';
import { BannedScreen } from '@/components/banned-screen';
import { LoginScreen } from '@/components/login-screen';
import { OnboardingGate } from '@/components/theme-onboarding';
import { GameServerProvider, useGameServer } from '@/state/game-server';
import { appBlurTarget } from '@/state/app-blur-target';
import { OverlayPortalProvider } from '@/components/overlay-portal';
import { DuelInviteHost } from '@/components/duel-invite-overlay';

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
  const [fontsLoaded, fontError] = useFonts({
    Inter_900Black,
    Poppins_400Regular: require('../../assets/fonts/Poppins_400Regular.ttf'),
    Poppins_600SemiBold: require('../../assets/fonts/Poppins_600SemiBold.ttf'),
    Poppins_700Bold: require('../../assets/fonts/Poppins_700Bold.ttf'),
    Poppins_800ExtraBold: require('../../assets/fonts/Poppins_800ExtraBold.ttf'),
    LilitaOne_400Regular: require('../../assets/fonts/LilitaOne_400Regular.ttf'),
  });
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
    <SafeAreaProvider>
      <ThemeProvider value={navigationTheme}>
        <GameServerProvider>
          <StatusBar style="dark" />
          <OverlayPortalProvider>
            <BlurTargetView ref={appBlurTarget} style={{ flex: 1 }}>
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
                  <Stack.Screen name="discover" />
                  <Stack.Screen name="notifications" options={{ animation: 'slide_from_bottom' }} />
                  <Stack.Screen name="compose" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
                </Stack>
              </BannedGate>
            </BlurTargetView>
            <DuelInviteHost />
          </OverlayPortalProvider>
        </GameServerProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

/**
 * Sans compte connecté : seule la page de connexion est affichée (pas de mode invité).
 * Compte banni : seul l'écran des sanctions (et de l'appel) reste accessible.
 */
function BannedGate({ children }: { children: ReactNode }) {
  const { banned, signedOut } = useGameServer();
  if (signedOut) return <LoginScreen />;
  return banned ? <BannedScreen /> : <OnboardingGate>{children}</OnboardingGate>;
}
