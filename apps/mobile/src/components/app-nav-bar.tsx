import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, usePathname, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Keyboard, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient as SvgGradient, Path, Stop } from 'react-native-svg';

import { Logo } from '@/components/header';
import type { IconName } from '@/components/social';
import { Colors, Fonts, NavBarHeight, NavBarLift } from '@/constants/theme';
import { useApi } from '@/net/api';
import { useGameServer } from '@/state/game-server';
import { navLift } from '@/state/nav-lift';

type NavTab = 'home' | 'themes' | 'versus' | 'activity' | 'profile';

const ITEMS: { key: Exclude<NavTab, 'versus'>; href: Href; label: string; icon: IconName; iconActive: IconName }[] = [
  { key: 'home', href: '/' as Href, label: 'Accueil', icon: 'home-outline', iconActive: 'home' },
  { key: 'themes', href: '/explore' as Href, label: 'Thèmes', icon: 'grid-outline', iconActive: 'grid' },
  { key: 'activity', href: '/activity' as Href, label: 'Notifications', icon: 'notifications-outline', iconActive: 'notifications' },
  { key: 'profile', href: '/profile' as Href, label: 'Profil', icon: 'person-outline', iconActive: 'person' },
];

const VS_SIZE = 51;
/** Hauteur de la vague, entre son sommet (au centre) et les bords de l'écran. */
const WAVE_HEIGHT = 28;
const WAVE_CURVE =
  'M0 60 C 45 28, 110 12, 180 12 C 250 12, 280 33, 335 33 C 375 33, 390 2, 426 2 C 462 2, 477 33, 517 33 C 572 33, 602 12, 672 12 C 742 12, 807 28, 852 60';
/** Espace minimal sous les onglets quand le téléphone n'a pas de zone de sécurité. */
const MIN_BOTTOM = 14;
const PASTEL = ['#FCE4F5', '#F2E8FC', '#DEF0FD', '#D3EFFE'] as const;
const PASTEL_STOPS = [0, 0.35, 0.65, 1] as const;

/** Hauteur totale de la barre, vague et zone de sécurité comprises. */
export function useNavBarHeight(): number {
  return NavBarHeight + Math.max(useSafeAreaInsets().bottom, MIN_BOTTOM);
}

/** Onglet à allumer selon l'écran affiché, y compris sur les pages ouvertes depuis un onglet. */
function activeTab(pathname: string): NavTab | null {
  if (pathname === '/' || pathname.startsWith('/post')) return 'home';
  if (pathname.startsWith('/explore') || pathname.startsWith('/theme') || pathname.startsWith('/category')) return 'themes';
  if (pathname.startsWith('/play')) return 'versus';
  if (pathname.startsWith('/activity')) return 'activity';
  if (pathname.startsWith('/profile') || pathname.startsWith('/player')) return 'profile';
  return null;
}

/** Clavier ouvert ou non (la barre disparaît pour lui laisser la place). */
export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    // Sur iOS, l'événement « will » évite de voir la barre remonter avec le clavier.
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setVisible(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return visible;
}

/** Barre de navigation unique : fond pastel ondulé (rose à gauche, bleu à droite), bouton VS rose au centre. */
export function AppNavBar() {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const { playerId, unreadNotifications } = useGameServer();
  const requests = useApi<{ requests: unknown[] }>(playerId ? '/api/me/follow-requests' : null);
  const badge = unreadNotifications + (requests.data?.requests.length ?? 0);
  const keyboard = useKeyboardVisible();
  const active = activeTab(pathname);
  const { width } = useWindowDimensions();
  const height = useNavBarHeight();
  const bottom = Math.max(insets.bottom, MIN_BOTTOM) + NavBarLift;
  const liftStyle = useAnimatedStyle(() => ({ transform: [{ translateY: navLift.value }] }));

  if (keyboard) return null;

  const renderItem = (item: (typeof ITEMS)[number]) => {
    const focused = active === item.key;
    const color = focused ? Colors.accentInk : Colors.text;
    const count = item.key === 'activity' ? badge : 0;
    return (
      <Pressable
        key={item.key}
        accessibilityRole="tab"
        accessibilityLabel={item.label}
        accessibilityState={{ selected: focused }}
        onPress={() => router.navigate(item.href)}
        style={({ pressed }) => [styles.item, pressed && { opacity: 0.6 }]}>
        <View>
          <Ionicons name={focused ? item.iconActive : item.icon} size={24} color={color} />
          {count > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
            </View>
          )}
        </View>
        <Text style={[styles.label, { color }, focused && { fontFamily: Fonts.extraBold }, width < 360 && styles.labelSmall]} numberOfLines={1}>
          {item.label}
        </Text>
      </Pressable>
    );
  };

  return (
    <Animated.View pointerEvents="box-none" style={[styles.bar, { height }, liftStyle]}>
      <LinearGradient pointerEvents="none" colors={PASTEL} locations={PASTEL_STOPS} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.body, { top: WAVE_HEIGHT - 1 }]} />
      <View pointerEvents="none" style={styles.wave}>
        <Svg width="100%" height={WAVE_HEIGHT} viewBox="0 0 852 61" preserveAspectRatio="none">
          <Defs>
            <SvgGradient id="navPastel" x1="0" y1="0" x2="1" y2="0">
              {PASTEL.map((color, i) => (
                <Stop key={color} offset={PASTEL_STOPS[i]} stopColor={color} />
              ))}
            </SvgGradient>
          </Defs>
          <Path d={`${WAVE_CURVE} L852 61 L0 61 Z`} fill="url(#navPastel)" />
          {/* Contour blanc sur la vague seulement : refermé, il dessinerait un trait en travers de la barre. */}
          <Path d={WAVE_CURVE} fill="none" stroke={Colors.surface} strokeWidth={3} />
        </Svg>
      </View>
      <View pointerEvents="box-none" style={[styles.items, { bottom }]}>
        {renderItem(ITEMS[0])}
        {renderItem(ITEMS[1])}
        <View style={styles.vsSlot} />
        {renderItem(ITEMS[2])}
        {renderItem(ITEMS[3])}
      </View>
      <Pressable
        accessibilityRole="tab"
        accessibilityLabel="Ouvrir un duel"
        accessibilityState={{ selected: active === 'versus' }}
        onPress={() => router.navigate('/play' as Href)}
        style={({ pressed }) => [styles.vs, { bottom: bottom - 3 }, pressed && { transform: [{ scale: 0.95 }] }]}>
        <LinearGradient colors={['#FD40A6', '#F41180', '#D70963']} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={styles.vsFill}>
          <Logo size={34} color={Colors.onAccent} />
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  wave: { position: 'absolute', top: 0, left: 0, right: 0 },
  body: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  items: { position: 'absolute', left: 0, right: 0, height: 44, flexDirection: 'row', paddingHorizontal: 2 },
  item: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 2 },
  label: { fontSize: 11, lineHeight: 15, fontFamily: Fonts.regular },
  labelSmall: { fontSize: 10 },
  vsSlot: { flex: 1 },
  vs: {
    position: 'absolute',
    alignSelf: 'center',
    width: VS_SIZE,
    height: VS_SIZE,
    borderRadius: VS_SIZE / 2,
    boxShadow: '0 4px 7px rgba(150, 0, 80, 0.38)',
  },
  vsFill: { flex: 1, borderRadius: VS_SIZE / 2, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: -5,
    right: -9,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    backgroundColor: Colors.accentFill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { color: Colors.onAccent, fontSize: 10, lineHeight: 12, fontFamily: Fonts.bold },
});
