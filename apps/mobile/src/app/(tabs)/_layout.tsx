import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Tabs } from 'expo-router';
import { Platform, StyleSheet } from 'react-native';

import type { IconName } from '@/components/social';
import { Colors, Gradients, Radius } from '@/constants/theme';
import { useApi } from '@/net/api';
import { useGameServer } from '@/state/game-server';

/** L'onglet central (Jouer : parties rapides et défis) prend la forme du gros bouton « VS ». */
const TABS: { name: string; title: string; icon?: IconName; iconActive?: IconName }[] = [
  { name: 'index', title: 'Accueil', icon: 'home-outline', iconActive: 'home' },
  { name: 'people', title: 'Personnes', icon: 'people-outline', iconActive: 'people' },
  { name: 'play', title: 'Jouer' },
  { name: 'explore', title: 'Thèmes', icon: 'grid-outline', iconActive: 'grid' },
  { name: 'activity', title: 'Activité', icon: 'notifications-outline', iconActive: 'notifications' },
];
/** Pages sans bouton dans la barre : le profil s'ouvre par l'avatar du bandeau, les classements depuis Jouer. */
const HIDDEN = ['profile', 'leaderboard'];

export default function TabsLayout() {
  const { playerId, unreadNotifications } = useGameServer();
  const requests = useApi<{ requests: unknown[] }>(playerId ? '/api/me/follow-requests' : null);
  const activityBadge = unreadNotifications + (requests.data?.requests.length ?? 0);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarActiveTintColor: Colors.accent,
        tabBarInactiveTintColor: Colors.text,
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopWidth: 0,
          borderTopLeftRadius: Radius.lg,
          borderTopRightRadius: Radius.lg,
          boxShadow: '0 -4px 18px rgba(18, 26, 51, 0.08)',
          overflow: 'visible',
          // Sur le Web, pas de zone de sécurité en bas : on donne une hauteur fixe à la barre.
          ...(Platform.OS === 'web' ? { height: 72, paddingTop: 10, paddingBottom: 10 } : { paddingTop: 8 }),
        },
        sceneStyle: { backgroundColor: Colors.background },
      }}>
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarAccessibilityLabel: tab.title,
            tabBarBadge: tab.name === 'activity' && activityBadge ? (activityBadge > 99 ? '99+' : activityBadge) : undefined,
            tabBarBadgeStyle: { backgroundColor: Colors.accent, color: Colors.onAccent },
            tabBarIcon: ({ color, focused }) =>
              tab.icon ? (
                <Ionicons name={focused ? tab.iconActive! : tab.icon} color={color as string} size={30} />
              ) : (
                <VsButton focused={focused} />
              ),
          }}
        />
      ))}
      {/* Pas `href: null` : depuis le SDK 58, un onglet caché ainsi redirige ailleurs. On masque seulement le bouton. */}
      {HIDDEN.map((name) => (
        <Tabs.Screen key={name} name={name} options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      ))}
    </Tabs>
  );
}

/** Le même « VS » peint au pinceau que l'écran d'avant-duel : l'identité visuelle de Qu1z. */
const VS_IMAGE = require('../../../assets/images/vs.png');

function VsButton({ focused }: { focused: boolean }) {
  return (
    <LinearGradient colors={Gradients.accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.vs, focused && styles.vsFocused]}>
      <Image source={VS_IMAGE} style={styles.vsImage} contentFit="contain" accessibilityIgnoresInvertColors />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  vs: {
    width: 74,
    height: 74,
    borderRadius: 37,
    marginTop: -30,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 4,
    borderColor: Colors.surface,
    boxShadow: '0 6px 16px rgba(229, 21, 95, 0.4)',
  },
  vsFocused: { borderColor: '#FFD3E3' },
  // L'image garde son halo sombre : agrandie et rognée par le rond, le pinceau remplit le bouton.
  vsImage: { width: 96, height: 96 },
});
