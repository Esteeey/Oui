import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { divisionFor } from '@qu1z/shared';

import { AppText } from '@/components/ui';
import { Colors, Gradients, Radius, Spacing } from '@/constants/theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <View style={styles.section}>
      <AppText variant="heading">{title}</AppText>
      {action}
    </View>
  );
}

export function DivisionBadge({ rating, compact }: { rating: number; compact?: boolean }) {
  const division = divisionFor(rating);
  return (
    <View style={[styles.division, { borderColor: division.color }]}>
      <Ionicons name="shield" size={12} color={division.color} />
      <AppText variant="caption" color={division.color}>
        {compact ? division.name : `${division.name} · ${rating}`}
      </AppText>
    </View>
  );
}

/** Pastille de filtre : grise au repos, rose (ou de la couleur donnée) quand elle est choisie. */
export function Chip({
  label,
  active,
  color,
  onPress,
  style,
}: {
  label: string;
  active?: boolean;
  color?: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      onPress={onPress}
      style={[styles.chip, active && color ? { backgroundColor: color } : null, style]}>
      {active && !color && (
        <LinearGradient colors={Gradients.accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      )}
      <AppText variant="label" color={active ? Colors.onAccent : Colors.text} style={{ fontSize: 14 }} numberOfLines={1}>
        {label}
      </AppText>
    </Pressable>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((o) => (
        <Pressable
          key={o.value}
          accessibilityRole="button"
          onPress={() => onChange(o.value)}
          style={[styles.segment, o.value === value && { backgroundColor: Colors.accent }]}>
          <AppText variant="label" color={o.value === value ? Colors.onAccent : Colors.textMuted}>
            {o.label}
          </AppText>
        </Pressable>
      ))}
    </View>
  );
}

export function IconButton({
  icon,
  onPress,
  badge,
  label,
  color = Colors.text,
}: {
  icon: IconName;
  onPress: () => void;
  badge?: number;
  label: string;
  color?: string;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={10} onPress={onPress} style={styles.iconButton}>
      <Ionicons name={icon} size={24} color={color} />
      {!!badge && (
        <View style={styles.badge}>
          <AppText variant="caption" color={Colors.onAccent} style={{ fontSize: 11 }}>
            {badge}
          </AppText>
        </View>
      )}
    </Pressable>
  );
}

/** Rappel affiché sur les écrans qui utilisent des données fictives. */
export function DemoNote({ children }: { children: ReactNode }) {
  return (
    <View style={styles.demo}>
      <Ionicons name="information-circle" size={16} color={Colors.textMuted} />
      <AppText variant="caption" muted style={{ flex: 1 }}>
        {children}
      </AppText>
    </View>
  );
}

export function OnlineDot({ online }: { online: boolean }) {
  return <View style={[styles.dot, { backgroundColor: online ? Colors.correct : Colors.border }]} />;
}

const styles = StyleSheet.create({
  section: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.sm },
  division: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1.5,
    borderRadius: Radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  chip: {
    borderRadius: Radius.pill,
    backgroundColor: Colors.surfaceRaised,
    paddingHorizontal: 20,
    paddingVertical: 11,
    alignItems: 'center',
    overflow: 'hidden',
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Radius.pill,
    padding: 4,
  },
  segment: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: Radius.pill },
  iconButton: { padding: 4 },
  badge: {
    position: 'absolute',
    top: -2,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  demo: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Radius.sm,
    padding: Spacing.sm,
  },
  dot: { width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: Colors.background },
});
