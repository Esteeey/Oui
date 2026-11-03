import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient as SvgGradient, Path, Stop } from 'react-native-svg';

import type { IconName } from '@/components/social';
import { Colors, Gradients, Radius, Spacing } from '@/constants/theme';

/** Hauteur de la partie du bandeau recouverte par la feuille de contenu arrondie. */
export const HEADER_OVERLAP = Radius.lg;

/** Bandeau bleu nuit traversé d'une vague rose, en haut de chaque écran (hors jeu). */
export function GradientHeader({
  title,
  left,
  right,
  flat,
}: {
  title?: ReactNode;
  left?: ReactNode;
  right?: ReactNode;
  /** Sans feuille arrondie par-dessus (le contenu commence juste sous le bandeau). */
  flat?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: insets.top + (flat ? Spacing.sm : Spacing.md), paddingBottom: flat ? Spacing.sm : HEADER_OVERLAP + Spacing.md }}>
      <LinearGradient colors={Gradients.header} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <Svg style={StyleSheet.absoluteFill} viewBox="0 0 400 160" preserveAspectRatio="none">
        <Defs>
          <SvgGradient id="glow" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#FF3B83" stopOpacity="0" />
            <Stop offset="0.6" stopColor="#FF3B83" stopOpacity="0.55" />
            <Stop offset="1" stopColor="#FF5A9A" stopOpacity="0.9" />
          </SvgGradient>
          <SvgGradient id="wave" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#E5155F" stopOpacity="0.2" />
            <Stop offset="1" stopColor="#FF2E7E" stopOpacity="1" />
          </SvgGradient>
        </Defs>
        <Path d="M40 160 C 170 150, 280 90, 400 -20 L400 160 Z" fill="url(#glow)" />
        <Path d="M140 160 C 240 140, 320 90, 400 10 L400 160 Z" fill="url(#wave)" />
      </Svg>
      <View style={styles.row}>
        <View style={styles.side}>{left}</View>
        <View style={styles.title}>
          {typeof title === 'string' ? (
            <Text style={styles.titleText} numberOfLines={1}>
              {title}
            </Text>
          ) : (
            title
          )}
        </View>
        <View style={[styles.side, styles.right]}>{right}</View>
      </View>
    </View>
  );
}

/** Logo Qu1z : carré rose arrondi et « Q » blanc. */
export function Logo({ size = 44 }: { size?: number }) {
  return (
    <LinearGradient colors={Gradients.accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.logo, { width: size, height: size, borderRadius: size * 0.27 }]}>
      <Text style={[styles.logoText, { fontSize: size * 0.62 }]}>Q</Text>
    </LinearGradient>
  );
}

/** Icône blanche du bandeau, avec une pastille de compteur facultative. */
export function HeaderButton({ icon, label, onPress, badge }: { icon: IconName; label: string; onPress: () => void; badge?: number }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && { opacity: 0.6 }]}>
      <Ionicons name={icon} size={26} color={Colors.onAccent} />
      {!!badge && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      )}
    </Pressable>
  );
}

/** Retour (ou fermeture d'une fenêtre modale) dans le bandeau. */
export function HeaderBack({ close }: { close?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={close ? 'Fermer' : 'Retour'}
      hitSlop={8}
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      style={({ pressed }) => [styles.back, pressed && { opacity: 0.6 }]}>
      <Ionicons name={close ? 'close' : 'chevron-back'} size={24} color={Colors.onAccent} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, minHeight: 56, gap: Spacing.sm },
  side: { minWidth: 44, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  right: { justifyContent: 'flex-end' },
  title: { flex: 1, alignItems: 'center' },
  titleText: { color: Colors.onAccent, fontSize: 24, fontWeight: '900', letterSpacing: -0.4 },
  logo: { alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 10px rgba(229, 21, 95, 0.35)' },
  logoText: { color: Colors.onAccent, fontWeight: '900', marginTop: -2 },
  button: { padding: 4 },
  badge: {
    position: 'absolute',
    top: -2,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.accent,
    borderWidth: 2,
    borderColor: Colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { color: Colors.onAccent, fontSize: 10, fontWeight: '800' },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
