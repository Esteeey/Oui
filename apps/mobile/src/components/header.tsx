import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import type { IconName } from '@/components/social';
import { Colors, Fonts, LogoColors, Spacing } from '@/constants/theme';

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
        {(left || !alignLeft) && <View style={[styles.side, alignLeft && styles.sideTight]}>{left}</View>}
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

/** Logo QuizX « Le Courant » : un X en deux moitiés, traversé par un éclair couché. */
export function Logo({ size = 39, color }: { size?: number; /** Une seule couleur à la place des deux couleurs de marque. */ color?: string }) {
  return (
    <Svg width={size} height={(size * 184) / 222} viewBox="17 36 222 184" accessibilityLabel="QuizX">
      <Path d="M17 36 L95 36 L128 78.17 L161 36 L239 36 L175.2 117.52 L140.5 126.82 L169.06 98.27 L89 128 Z" fill={color ?? LogoColors.top} />
      <Path d="M239 220 L161 220 L128 177.83 L95 220 L17 220 L80.8 138.48 L115.5 129.18 L86.94 157.73 L167 128 Z" fill={color ?? LogoColors.bottom} />
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
    backgroundColor: Colors.accentFill,
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
