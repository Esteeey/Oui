import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { Colors } from '@/constants/theme';
import { GameServerProvider } from '@/state/game-server';

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
  }, []);

  return (
    <ThemeProvider value={navigationTheme}>
      <GameServerProvider>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: Colors.background },
              animation: 'slide_from_right',
            }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="duel/[themeId]" options={{ gestureEnabled: false, animation: 'fade' }} />
            <Stack.Screen name="results" options={{ gestureEnabled: false, animation: 'fade_from_bottom' }} />
            <Stack.Screen name="chat/[duelId]" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="settings/profile" />
            <Stack.Screen name="settings/blocked" />
            <Stack.Screen name="settings/notifications" />
            <Stack.Screen name="announcement/[id]" />
            <Stack.Screen name="notifications" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="compose" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          </Stack>
      </GameServerProvider>
    </ThemeProvider>
  );
}
