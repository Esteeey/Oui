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
          // Design plat : ni ombre ni contour.
          elevation: 0,
          shadowOpacity: 0,
          // Le rond VS dépasse au-dessus de la barre.
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

/** « VS » peint au pinceau (traits blancs seuls, sans halo), posé au centre du rond rose. */
const VS_IMAGE = require('../../../assets/images/vs-nav.png');

function VsButton({ focused }: { focused: boolean }) {
  return (
    <LinearGradient colors={Gradients.accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.vs, !focused && styles.vsIdle]}>
      <Image source={VS_IMAGE} style={styles.vsImage} contentFit="contain" accessibilityIgnoresInvertColors />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  // Rond rose d'origine (taille et position), en plat : ni ombre ni contour.
  vs: {
    width: 74,
    height: 74,
    borderRadius: 37,
    marginTop: -30,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  // Onglet non sélectionné : un peu atténué (sans contour, la sélection se lit à l'opacité).
  vsIdle: { opacity: 0.85 },
  // Le VS, plus petit, centré dans le rond.
  vsImage: { width: 36, height: 36 },
});
