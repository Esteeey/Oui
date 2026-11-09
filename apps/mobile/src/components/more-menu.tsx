import Ionicons from '@expo/vector-icons/Ionicons';
import { useRef, useState, type ReactNode } from 'react';
import { Modal, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PhysicalSheet, SheetPresence } from '@/components/physical-sheet';
import type { IconName } from '@/components/social';
import { Tap } from '@/components/tap';
import { AppText } from '@/components/ui';
import { Colors, MaxContentWidth, Spacing } from '@/constants/theme';

export interface MoreMenuItem {
  label: string;
  icon: IconName;
  onPress: () => void;
  destructive?: boolean;
}

/** Menu « trois points » : la liste d'actions s'ouvre depuis le bas de l'écran. */
export function MoreMenu({ items, label = 'Plus d’options', trigger }: { items: MoreMenuItem[]; label?: string; trigger?: (open: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const afterExit = useRef<(() => void) | null>(null);
  const insets = useSafeAreaInsets();
  if (items.length === 0) return null;
  const show = () => {
    setMounted(true);
    setOpen(true);
  };
  const close = () => setOpen(false);
  const choose = (item: MoreMenuItem) => {
    setOpen(false);
    // iOS refuse d'ouvrir une fenêtre tant que la précédente n'est pas refermée (feuille de signalement).
    if (Platform.OS === 'ios') afterExit.current = item.onPress;
    else setTimeout(item.onPress, 0);
  };
  const exited = () => {
    setMounted(false);
    const next = afterExit.current;
    afterExit.current = null;
    if (next) setTimeout(next, 350);
  };
  return (
    <>
      {trigger ? (
        trigger(show)
      ) : (
        <Tap accessibilityRole="button" accessibilityLabel={label} hitSlop={10} onPress={show} style={styles.trigger}>
          <Ionicons name="ellipsis-horizontal" size={20} color={Colors.text} />
        </Tap>
      )}
      <Modal visible={mounted} transparent animationType="none" onRequestClose={close}>
        <SheetPresence.Provider value={{ closing: !open, onExited: exited }}>
          <PhysicalSheet onClose={close} style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.sm }]}>
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
            <Tap accessibilityRole="button" onPress={close} style={[styles.row, styles.cancel]}>
              <AppText variant="label" muted>
                Annuler
              </AppText>
            </Tap>
          </PhysicalSheet>
        </SheetPresence.Provider>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  sheet: { maxWidth: MaxContentWidth, backgroundColor: Colors.surface, paddingHorizontal: Spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, minHeight: 52, paddingHorizontal: Spacing.md },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: Colors.border, marginVertical: Spacing.xs },
  cancel: { justifyContent: 'center' },
});
