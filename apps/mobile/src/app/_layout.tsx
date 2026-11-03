import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, type ReactNode } from 'react';

import { Colors } from '@/constants/theme';
import { listenToPushTaps } from '@/net/push';
import { BannedScreen } from '@/components/banned-screen';
import { GameServerProvider, useGameServer } from '@/state/game-server';

SplashScreen.preventAutoHideAsync();

const navigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: Colors.background,
    card: Colors.background,
    text: Colors.text,
    primary: Colors.player,
    border: Colors.border,
  },
};

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
    // Toucher une notification push ouvre la conversation ou le centre de notifications.
    return listenToPushTaps();
  }, []);

  return (
    <ThemeProvider value={navigationTheme}>
      <GameServerProvider>
          <StatusBar style="light" />
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
            <Stack.Screen name="settings/profile" />
            <Stack.Screen name="settings/blocked" />
            <Stack.Screen name="settings/notifications" />
            <Stack.Screen name="settings/sanctions" />
            <Stack.Screen name="account" />
            <Stack.Screen name="moderation/index" />
            <Stack.Screen name="moderation/report/[id]" />
            <Stack.Screen name="announcement/[id]" />
            <Stack.Screen name="search" options={{ animation: 'fade' }} />
            <Stack.Screen name="discover" />
            <Stack.Screen name="notifications" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="compose" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          </Stack>
          </BannedGate>
      </GameServerProvider>
    </ThemeProvider>
  );
}

/** Compte banni : seul l'écran des sanctions (et de l'appel) reste accessible. */
function BannedGate({ children }: { children: ReactNode }) {
  const { banned } = useGameServer();
  return banned ? <BannedScreen /> : children;
}
