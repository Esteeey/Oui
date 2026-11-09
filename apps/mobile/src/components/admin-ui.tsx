import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState, type ComponentProps, type ComponentRef, type ReactNode } from 'react';
import { BackHandler, KeyboardAvoidingView, PanResponder, Platform, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppNavBar, useKeyboardVisible, useNavBarHeight } from '@/components/app-nav-bar';
import { GradientHeader, HeaderBack } from '@/components/header';
import { PhysicalSheet, SheetPresence } from '@/components/physical-sheet';
import { Tap } from '@/components/tap';
import { AppText, Button } from '@/components/ui';
import { Colors, MaxContentWidth, Radius, Shadow, Spacing } from '@/constants/theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];
export type Notice = { ok: boolean; text: string };

/**
 * Cadre des écrans d'administration : contenu qui défile, résultat de la dernière action,
 * actions fixes sous le pouce, barre de navigation, puis feuille du bas par-dessus tout.
 * La feuille reste dans l'écran (pas de `Modal`) pour se comporter comme lui quand le clavier s'ouvre.
 */
export function AdminScreen({
  title,
  children,
  dock,
  sheet,
  notice,
  scrollKey,
}: {
  title: string;
  children?: ReactNode;
  dock?: ReactNode;
  sheet?: ReactNode;
  notice?: Notice | null;
  /** Quand cette valeur change, la page remonte en haut (étape suivante d'un formulaire). */
  scrollKey?: string | number;
}) {
  const keyboard = useKeyboardVisible();
  const navHeight = useNavBarHeight();
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);

  useEffect(() => {
    scroll.current?.scrollTo({ y: 0, animated: false });
  }, [scrollKey]);

  return (
    <View style={styles.screen}>
      <GradientHeader left={<HeaderBack />} title={title} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView ref={scroll} style={styles.flex} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={styles.column}>{children}</View>
        </ScrollView>
        <View style={{ marginBottom: keyboard ? 0 : navHeight }}>
          {notice && (
            <View accessibilityLiveRegion="polite" style={[styles.notice, { backgroundColor: notice.ok ? Colors.correct : Colors.wrong }]}>
              <AppText color={Colors.onAccent} style={styles.noticeText}>
                {notice.text}
              </AppText>
            </View>
          )}
          {dock}
        </View>
      </KeyboardAvoidingView>
      <AppNavBar />
      <SheetHost sheet={sheet} />
    </View>
  );
}

/** Garde la feuille affichée pendant son animation de sortie, une fois que l'écran l'a retirée. */
function SheetHost({ sheet }: { sheet?: ReactNode }) {
  const [shown, setShown] = useState<ReactNode>(null);
  if (sheet && sheet !== shown) setShown(sheet);
  const content = sheet || shown;
  if (!content) return null;
  return <SheetPresence.Provider value={{ closing: !sheet, onExited: () => setShown(null) }}>{content}</SheetPresence.Provider>;
}

/** Actions toujours accessibles en bas de l'écran. */
export function Dock({ children, dark }: { children: ReactNode; dark?: boolean }) {
  return (
    <View style={[styles.dock, dark && styles.dockDark]}>
      <View style={styles.dockRow}>{children}</View>
    </View>
  );
}

export function Hint({ children, color, style }: { children: ReactNode; color?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <AppText variant="caption" color={color ?? Colors.textMuted} style={[styles.hint, style as never]}>
      {children}
    </AppText>
  );
}

export function SectionLabel({ children }: { children: string }) {
  return (
    <AppText variant="caption" color={Colors.textSoft} style={styles.sectionLabel} accessibilityRole="header">
      {children.toUpperCase()}
    </AppText>
  );
}

export function Pill({ label, color = Colors.textMuted, background = Colors.surfaceRaised }: { label: string; color?: string; background?: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: background }]}>
      <AppText variant="caption" color={color} style={styles.pillText} numberOfLines={1}>
        {label}
      </AppText>
    </View>
  );
}

/** Onglets sur une seule ligne, avec le nombre d'éléments à traiter. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string; count?: number }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.segmented} accessibilityRole="tablist">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Tap
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={[styles.segment, selected && styles.segmentOn]}>
            <AppText numberOfLines={1} color={selected ? Colors.ink : Colors.textMuted} style={styles.segmentText}>
              {option.label}
              {!!option.count && <AppText color={Colors.accentInk} style={styles.segmentCount}>{` ${option.count}`}</AppText>}
            </AppText>
          </Tap>
        );
      })}
    </View>
  );
}

/** Pastilles de filtre ou de choix, qui passent à la ligne si besoin. */
export function Pills<T extends string | number>({
  options,
  value,
  onChange,
  color = Colors.ink,
}: {
  options: readonly { value: T; label: string; color?: string }[];
  value: T;
  onChange: (value: T) => void;
  color?: string;
}) {
  return (
    <View style={styles.pills}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Tap
            key={String(option.value)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={[styles.choice, selected && { backgroundColor: option.color ?? color, borderColor: option.color ?? color }]}>
            <AppText color={selected ? Colors.onAccent : Colors.text} style={styles.choiceText} numberOfLines={1}>
              {option.label}
            </AppText>
          </Tap>
        );
      })}
    </View>
  );
}

/** Feuille qui monte du bas. Le geste retour d'Android la ferme sans quitter la page. */
export function Sheet({ title, onClose, children }: { title?: string; onClose: () => void; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      close.current();
      return true;
    });
    return () => subscription.remove();
  }, []);

  return (
    <PhysicalSheet onClose={onClose} style={styles.sheet}>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={[styles.sheetBody, { paddingBottom: Math.max(insets.bottom, Spacing.md) }]}>
        {title && <AppText variant="heading" accessibilityRole="header">{title}</AppText>}
        {children}
      </ScrollView>
    </PhysicalSheet>
  );
}

export function SheetAction({ icon, label, danger, disabled, onPress }: { icon: IconName; label: string; danger?: boolean; disabled?: boolean; onPress: () => void }) {
  const color = danger ? Colors.wrong : Colors.text;
  return (
    <Tap accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.action, disabled && { opacity: 0.5 }]}>
      <Ionicons name={icon} size={21} color={color} />
      <AppText color={color} style={styles.actionText}>
        {label}
      </AppText>
    </Tap>
  );
}

/** Demande de confirmation avant une action lourde. */
export function ConfirmSheet({
  title,
  text,
  confirmLabel,
  danger,
  busy,
  onCancel,
  onConfirm,
}: {
  title: string;
  text: string;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Sheet title={title} onClose={onCancel}>
      <AppText>{text}</AppText>
      <View style={styles.buttons}>
        <Button label="Annuler" variant="outline" color={Colors.text} onPress={onCancel} style={styles.flex} />
        <Button label={busy ? 'Un instant…' : confirmLabel} color={danger ? Colors.wrong : undefined} disabled={busy} onPress={onConfirm} style={styles.flex} />
      </View>
    </Sheet>
  );
}

/** Section repliable d'un dossier. */
export function Fold({ title, defaultOpen, children }: { title: string; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <View style={styles.fold}>
      <Tap accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={styles.foldHead}>
        <AppText style={styles.foldTitle}>{title}</AppText>
        <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={17} color={Colors.textMuted} />
      </Tap>
      {open && <View style={styles.foldBody}>{children}</View>}
    </View>
  );
}

export function Field({ label, children, color }: { label: string; children: ReactNode; color?: string }) {
  return (
    <View style={styles.field}>
      <AppText color={color} style={styles.fieldLabel}>
        {label}
      </AppText>
      {children}
    </View>
  );
}

/** Curseur au doigt, sans dépendance native supplémentaire. */
export function Slider({
  value,
  min,
  max,
  step,
  label,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  label: string;
  onChange: (value: number) => void;
}) {
  const width = useRef(0);
  const start = useRef(0);
  const latest = useRef({ value, min, max, step, onChange });
  latest.current = { value, min, max, step, onChange };

  const move = (x: number) => {
    const c = latest.current;
    if (!width.current) return;
    const ratio = Math.min(1, Math.max(0, x / width.current));
    const next = Math.min(c.max, Math.max(c.min, c.min + Math.round((ratio * (c.max - c.min)) / c.step) * c.step));
    if (next !== c.value) c.onChange(next);
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (event) => {
        start.current = event.nativeEvent.locationX;
        move(start.current);
      },
      onPanResponderMove: (_, gesture) => move(start.current + gesture.dx),
    }),
  ).current;

  const percent = `${max > min ? ((value - min) / (max - min)) * 100 : 0}%` as const;
  const nudge = (direction: 1 | -1) => {
    const next = Math.min(max, Math.max(min, value + direction * step));
    if (next !== value) onChange(next);
  };

  return (
    <View
      {...pan.panHandlers}
      onLayout={(event) => {
        width.current = event.nativeEvent.layout.width;
      }}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min, max, now: value }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event) => nudge(event.nativeEvent.actionName === 'increment' ? 1 : -1)}
      style={styles.slider}>
      <View style={styles.sliderInner}>
        <View style={styles.sliderTrack}>
          <View style={[styles.sliderFill, { width: percent }]} />
        </View>
        <View style={[styles.sliderThumb, { left: percent }]} />
      </View>
    </View>
  );
}

export const adminStyles = StyleSheet.create({
  input: { minHeight: 48, borderRadius: 13, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, color: Colors.text, paddingHorizontal: 13, paddingVertical: 11, fontSize: 15 },
  multiline: { textAlignVertical: 'top' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  grow: { flex: 1, minWidth: 0 },
  stack: { gap: Spacing.sm },
  strong: { fontSize: 14.5, lineHeight: 20, fontWeight: '600' },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, alignItems: 'center' },
  column: { width: '100%', maxWidth: MaxContentWidth, paddingHorizontal: 14, paddingTop: Spacing.xs, paddingBottom: Spacing.md, gap: 14 },
  notice: { paddingHorizontal: Spacing.md, paddingVertical: 10 },
  noticeText: { fontSize: 13.5, lineHeight: 19, textAlign: 'center' },
  dock: { backgroundColor: Colors.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border, paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center' },
  dockDark: { backgroundColor: Colors.ink, borderTopWidth: 0, paddingVertical: 8 },
  dockRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, width: '100%', maxWidth: MaxContentWidth },
  hint: { fontSize: 12.5, lineHeight: 18 },
  sectionLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6 },
  pill: { minHeight: 22, paddingHorizontal: 8, borderRadius: 11, justifyContent: 'center', alignSelf: 'flex-start' },
  pillText: { fontSize: 11.5, fontWeight: '700' },
  segmented: { flexDirection: 'row', gap: 2, padding: 3, borderRadius: 13, backgroundColor: Colors.surfaceRaised },
  segment: { flex: 1, minHeight: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  segmentOn: { backgroundColor: Colors.surface, ...Shadow },
  segmentText: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  segmentCount: { fontSize: 13, lineHeight: 18, fontWeight: '800' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  choice: { minHeight: 44, paddingHorizontal: 14, borderRadius: 22, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  choiceText: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  sheet: { maxWidth: MaxContentWidth, maxHeight: '86%', backgroundColor: Colors.background },
  sheetBody: { paddingHorizontal: 14, gap: 12 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 54, paddingHorizontal: 14, borderRadius: 14, backgroundColor: Colors.surface },
  actionText: { flex: 1, fontSize: 14.5, lineHeight: 20, fontWeight: '600' },
  buttons: { flexDirection: 'row', gap: Spacing.sm },
  fold: { backgroundColor: Colors.surface, borderRadius: Radius.md, ...Shadow },
  foldHead: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm, paddingHorizontal: 14, paddingVertical: Spacing.sm },
  foldTitle: { flex: 1, fontSize: 14.5, lineHeight: 20, fontWeight: '600' },
  foldBody: { paddingHorizontal: 14, paddingBottom: 14, gap: Spacing.sm },
  field: { gap: 6 },
  fieldLabel: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  slider: { flex: 1, height: 44, justifyContent: 'center' },
  sliderInner: { height: 44, justifyContent: 'center', pointerEvents: 'none' },
  sliderTrack: { height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: Colors.border },
  sliderFill: { height: 6, backgroundColor: Colors.accent },
  sliderThumb: { position: 'absolute', top: 12, width: 20, height: 20, marginLeft: -10, borderRadius: 10, backgroundColor: Colors.accent, borderWidth: 2, borderColor: Colors.surface },
});
