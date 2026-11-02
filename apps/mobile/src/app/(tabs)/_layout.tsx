import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { Platform } from 'react-native';

import type { IconName } from '@/components/social';
import { Colors } from '@/constants/theme';
import { useApi } from '@/net/api';
import { useGameServer } from '@/state/game-server';

const TABS: { name: string; title: string; icon: IconName; iconActive: IconName }[] = [
  { name: 'index', title: 'Fil', icon: 'home-outline', iconActive: 'home' },
  { name: 'explore', title: 'Explorer', icon: 'compass-outline', iconActive: 'compass' },
  { name: 'leaderboard', title: 'Classement', icon: 'trophy-outline', iconActive: 'trophy' },
  { name: 'social', title: 'Social', icon: 'people-outline', iconActive: 'people' },
  { name: 'profile', title: 'Profil', icon: 'person-circle-outline', iconActive: 'person-circle' },
];

export default function TabsLayout() {
  const { playerId } = useGameServer();
  const requests = useApi<{ requests: unknown[] }>(playerId ? '/api/me/follow-requests' : null);
  const socialBadge = requests.data?.requests.length ?? 0;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.player,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopColor: Colors.border,
          // Sur le Web, pas de zone de sécurité en bas : on laisse de la place aux libellés.
          ...(Platform.OS === 'web' ? { height: 64, paddingTop: 6, paddingBottom: 8 } : null),
        },
        tabBarLabelStyle: { fontWeight: '700', fontSize: 10 },
        sceneStyle: { backgroundColor: Colors.background },
      }}>
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarBadge: tab.name === 'social' && socialBadge ? socialBadge : undefined,
            tabBarBadgeStyle: { backgroundColor: Colors.player, color: Colors.background },
            tabBarIcon: ({ color, focused, size }) => (
              <Ionicons name={focused ? tab.iconActive : tab.icon} color={color as string} size={size} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
