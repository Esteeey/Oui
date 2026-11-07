import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { Tabs } from 'expo-router';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { IconName } from '@/components/social';
import { Colors, Radius } from '@/constants/theme';
import { useApi } from '@/net/api';
import { useGameServer } from '@/state/game-server';

const NAV_ACCENT = '#990054';

/** Les cinq destinations principales restent de vraies routes Expo Router. */
const TABS: { name: string; title: string; icon?: IconName; iconActive?: IconName }[] = [
  { name: 'index', title: 'Accueil', icon: 'home-outline', iconActive: 'home' },
  { name: 'explore', title: 'Thèmes', icon: 'grid-outline', iconActive: 'grid' },
  { name: 'play', title: 'VS' },
  { name: 'activity', title: 'Notifications', icon: 'notifications-outline', iconActive: 'notifications' },
  { name: 'profile', title: 'Profil', icon: 'person-outline', iconActive: 'person' },
];
/** Ces écrans gardent leurs routes et leurs liens, mais n’occupent pas un des cinq boutons principaux. */
const HIDDEN = ['people', 'leaderboard', 'search'];
const VS_IMAGE = require('../../../assets/images/vs-nav.png');

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { playerId, unreadNotifications } = useGameServer();
  const requests = useApi<{ requests: unknown[] }>(playerId ? '/api/me/follow-requests' : null);
  const activityBadge = unreadNotifications + (requests.data?.requests.length ?? 0);
  const bottomGap = Platform.OS === 'web' ? 12 : Math.max(insets.bottom, Platform.OS === 'android' ? 16 : 20) + 8;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: true,
        tabBarActiveTintColor: NAV_ACCENT,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderWidth: 1,
          borderColor: '#F0E7ED',
          borderRadius: Radius.pill,
          marginHorizontal: 12,
          marginTop: 8,
          marginBottom: bottomGap,
          height: Platform.OS === 'web' ? 76 : 74,
          paddingTop: 6,
          paddingBottom: Platform.OS === 'web' ? 7 : 6,
          elevation: 12,
          zIndex: 10,
          shadowColor: '#121A33',
          shadowOpacity: 0.14,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 7 },
          overflow: 'visible',
        },
        tabBarItemStyle: { paddingTop: 3 },
        tabBarLabelStyle: { fontSize: 9, lineHeight: 12, fontWeight: '700', marginTop: 0 },
        sceneStyle: { backgroundColor: Colors.background },
      }}>
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarLabel: tab.name === 'play' ? '' : tab.title,
            tabBarAccessibilityLabel: tab.name === 'play' ? 'Ouvrir un duel' : tab.title,
            tabBarBadge: tab.name === 'activity' && activityBadge ? (activityBadge > 99 ? '99+' : activityBadge) : undefined,
            tabBarBadgeStyle: { backgroundColor: NAV_ACCENT, color: Colors.onAccent },
            tabBarIcon: ({ color, focused }) =>
              tab.icon ? (
                <Ionicons name={focused ? tab.iconActive! : tab.icon} color={color as string} size={22} />
              ) : (
                <VsButton focused={focused} />
              ),
          }}
        />
      ))}
      {/* Les écrans restent navigables depuis leurs liens internes, sans ajouter d’onglets. */}
      {HIDDEN.map((name) => (
        <Tabs.Screen key={name} name={name} options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      ))}
    </Tabs>
  );
}

function VsButton({ focused }: { focused: boolean }) {
  return (
    <View pointerEvents="none" style={[styles.vsButton, !focused && styles.vsIdle]}>
      <Image source={VS_IMAGE} style={styles.vsImage} contentFit="contain" accessibilityIgnoresInvertColors />
    </View>
  );
}

const styles = StyleSheet.create({
  vsButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    marginTop: -16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: NAV_ACCENT,
    borderWidth: 2,
    borderColor: Colors.surface,
    elevation: 8,
    shadowColor: '#121A33',
    shadowOpacity: 0.2,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 4 },
  },
  vsIdle: { opacity: 0.94 },
  vsImage: { width: 32, height: 32 },
});
