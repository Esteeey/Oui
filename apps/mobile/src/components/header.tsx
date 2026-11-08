import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Path, Stop } from 'react-native-svg';

import type { IconName } from '@/components/social';
import { Colors, Fonts, Spacing } from '@/constants/theme';

/** En-tête clair commun aux écrans classiques : posé sur le fond pastel, sans bandeau coloré. */
export function GradientHeader({
  title,
  left,
  right,
  flat,
  alignLeft,
}: {
  title?: ReactNode;
  left?: ReactNode;
  right?: ReactNode;
  /** Variante plus serrée (conversations). */
  flat?: boolean;
  /** Titre aligné à gauche (onglets principaux) au lieu d'être centré. */
  alignLeft?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  return (
    <View style={{ paddingTop: insets.top + (flat || alignLeft ? Spacing.xs : Spacing.sm), paddingBottom: flat ? Spacing.xs : Spacing.sm }}>
      <View style={[styles.row, alignLeft && styles.rowLeft]}>
        <View style={[styles.side, alignLeft && styles.sideTight]}>{left}</View>
        <View style={[styles.title, alignLeft && styles.titleLeft]}>
          {typeof title === 'string' ? (
            <Text style={[styles.titleText, alignLeft && styles.titleTextLeft, alignLeft && width < 360 && styles.titleTextSmall]} numberOfLines={1}>
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

/** Logo QuizX : bulle rose couronnée et « Q » blanc. */
export function Logo({ size = 39 }: { size?: number }) {
  return (
    <Svg width={size} height={(size * 47) / 40} viewBox="0 0 40 47" accessibilityLabel="QuizX">
      <Defs>
        <SvgGradient id="logoPink" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#F0247E" />
          <Stop offset="1" stopColor="#D6056A" />
        </SvgGradient>
      </Defs>
      <Path d="M20 8 a19 18.5 0 1 1 -9.6 34.4 L4 46 L6.2 38.2 A19 18.5 0 0 1 20 8 Z" fill="url(#logoPink)" />
      <Path d="M12 11 L9.5 2.5 L15.5 6.5 L20 0.5 L24.5 6.5 L30.5 2.5 L28 11 Z" fill={Colors.goldBright} stroke="#E09A00" strokeWidth={0.6} strokeLinejoin="round" />
      <Circle cx={20} cy={26} r={8.5} stroke={Colors.onAccent} strokeWidth={4.5} fill="none" />
      <Path d="M23.5 30 L30 37" stroke={Colors.onAccent} strokeWidth={4.5} strokeLinecap="round" />
    </Svg>
  );
}

/** Icône de l'en-tête, avec une pastille de compteur ou un simple point rose facultatifs. */
export function HeaderButton({ icon, label, onPress, badge, dot }: { icon: IconName; label: string; onPress: () => void; badge?: number; dot?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && { opacity: 0.6 }]}>
      <Ionicons name={icon} size={26} color={Colors.ink} />
      {dot && <View style={styles.dot} />}
      {!!badge && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      )}
    </Pressable>
  );
}

/** Retour (ou fermeture d'une fenêtre modale) dans l'en-tête. */
export function HeaderBack({ close }: { close?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={close ? 'Fermer' : 'Retour'}
      hitSlop={8}
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      style={({ pressed }) => [styles.back, pressed && { opacity: 0.6 }]}>
      <Ionicons name={close ? 'close' : 'chevron-back'} size={24} color={Colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, minHeight: 48, gap: Spacing.sm },
  rowLeft: { paddingLeft: 19, gap: 18 },
  side: { minWidth: 44, flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  sideTight: { minWidth: 0 },
  right: { justifyContent: 'flex-end' },
  title: { flex: 1, alignItems: 'center' },
  titleLeft: { alignItems: 'flex-start' },
  titleText: { color: Colors.text, fontSize: 20, fontFamily: Fonts.extraBold },
  titleTextLeft: { color: Colors.ink, fontSize: 20 },
  titleTextSmall: { fontSize: 16 },
  button: { padding: 4 },
  dot: { position: 'absolute', top: 2, right: 3, width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.accent },
  badge: {
    position: 'absolute',
    top: -2,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.accent,
    borderWidth: 2,
    borderColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { color: Colors.onAccent, fontSize: 10, fontFamily: Fonts.bold, lineHeight: 12 },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
});
