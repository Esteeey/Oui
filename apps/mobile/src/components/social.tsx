import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { divisionFor } from '@qu1z/shared';

import { AppText } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';

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

export function Chip({
  label,
  active,
  color = Colors.player,
  onPress,
}: {
  label: string;
  active?: boolean;
  color?: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.chip, active ? { backgroundColor: color, borderColor: color } : null]}>
      <AppText variant="caption" color={active ? Colors.background : Colors.text}>
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
          style={[styles.segment, o.value === value && { backgroundColor: Colors.surfaceRaised }]}>
          <AppText variant="label" color={o.value === value ? Colors.text : Colors.textMuted}>
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
}: {
  icon: IconName;
  onPress: () => void;
  badge?: number;
  label: string;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={10} onPress={onPress} style={styles.iconButton}>
      <Ionicons name={icon} size={24} color={Colors.text} />
      {!!badge && (
        <View style={styles.badge}>
          <AppText variant="caption" color={Colors.background} style={{ fontSize: 11 }}>
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
    borderWidth: 1.5,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: Radius.pill,
    padding: 4,
    borderWidth: 1,
    borderColor: Colors.border,
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
    backgroundColor: Colors.player,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  demo: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.sm,
    padding: Spacing.sm,
  },
  dot: { width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: Colors.background },
});
