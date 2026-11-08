import Ionicons from '@expo/vector-icons/Ionicons';
import { useState, type ReactNode } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { IconName } from '@/components/social';
import { Tap } from '@/components/tap';
import { AppText } from '@/components/ui';
import { Colors, MaxContentWidth, Radius, Spacing } from '@/constants/theme';

export interface MoreMenuItem {
  label: string;
  icon: IconName;
  onPress: () => void;
  destructive?: boolean;
}

/** Menu « trois points » : la liste d'actions s'ouvre depuis le bas de l'écran. */
export function MoreMenu({ items, label = 'Plus d’options', trigger }: { items: MoreMenuItem[]; label?: string; trigger?: (open: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  if (items.length === 0) return null;
  const choose = (item: MoreMenuItem) => {
    setOpen(false);
    // iOS refuse d'ouvrir une fenêtre tant que la précédente n'est pas refermée (feuille de signalement).
    setTimeout(item.onPress, Platform.OS === 'ios' ? 350 : 0);
  };
  return (
    <>
      {trigger ? (
        trigger(() => setOpen(true))
      ) : (
        <Tap accessibilityRole="button" accessibilityLabel={label} hitSlop={10} onPress={() => setOpen(true)} style={styles.trigger}>
          <Ionicons name="ellipsis-horizontal" size={20} color={Colors.text} />
        </Tap>
      )}
      <Modal visible={open} transparent animationType="none" onRequestClose={() => setOpen(false)}>
        <Pressable accessibilityRole="button" accessibilityLabel="Fermer" style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.sm }]}>
            {items.map((item) => {
              const color = item.destructive ? Colors.wrong : Colors.text;
              return (
                <Tap key={item.label} accessibilityRole="button" onPress={() => choose(item)} style={styles.row}>
                  <Ionicons name={item.icon} size={21} color={color} />
                  <AppText variant="label" color={color}>
                    {item.label}
                  </AppText>
                </Tap>
              );
            })}
            <View style={styles.separator} />
            <Tap accessibilityRole="button" onPress={() => setOpen(false)} style={[styles.row, styles.cancel]}>
              <AppText variant="label" muted>
                Annuler
              </AppText>
            </Tap>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(14, 15, 43, 0.35)' },
  sheet: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    paddingTop: Spacing.sm,
    paddingHorizontal: Spacing.sm,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, minHeight: 52, paddingHorizontal: Spacing.md },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: Colors.border, marginVertical: Spacing.xs },
  cancel: { justifyContent: 'center' },
});
