import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { mediaUri } from '@/net/media';

type Variant = 'display' | 'title' | 'heading' | 'body' | 'label' | 'caption' | 'score';

export function AppText({
  variant = 'body',
  muted,
  color,
  style,
  ...props
}: TextProps & { variant?: Variant; muted?: boolean; color?: string }) {
  return (
    <Text
      {...props}
      style={[
        textStyles[variant],
        muted && { color: Colors.textMuted },
        color ? { color } : null,
        style,
      ]}
    />
  );
}

export function Screen({
  children,
  scroll = true,
  inTabs = false,
  style,
}: {
  children: ReactNode;
  scroll?: boolean;
  /** Écran affiché dans un onglet : la barre d'onglets gère déjà le bas de l'écran. */
  inTabs?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const content = <View style={[styles.content, style]}>{children}</View>;
  return (
    <SafeAreaView style={styles.screen} edges={inTabs ? ['top'] : ['top', 'bottom']}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {content}
        </ScrollView>
      ) : (
        <View style={styles.scroll}>{content}</View>
      )}
    </SafeAreaView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Button({
  label,
  onPress,
  color = Colors.player,
  variant = 'solid',
  disabled,
  style,
}: {
  label: string;
  onPress?: () => void;
  color?: string;
  variant?: 'solid' | 'outline';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  const solid = variant === 'solid';
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => scale.set(withSpring(0.96, { duration: 150 }))}
      onPressOut={() => scale.set(withSpring(1, { duration: 200 }))}
      style={style}>
      <Animated.View
        style={[
          styles.button,
          solid ? { backgroundColor: color } : { borderColor: color, borderWidth: 2 },
          disabled && { opacity: 0.4 },
          animated,
        ]}>
        <AppText variant="label" color={solid ? Colors.background : color}>
          {label}
        </AppText>
      </Animated.View>
    </Pressable>
  );
}

export function ProgressBar({
  progress,
  color = Colors.gold,
  height = 8,
}: {
  progress: number;
  color?: string;
  height?: number;
}) {
  const animated = useAnimatedStyle(() => ({
    width: withTiming(`${Math.round(Math.min(Math.max(progress, 0), 1) * 100)}%`, { duration: 600 }),
  }));
  return (
    <View style={[styles.track, { height, borderRadius: height }]}>
      <Animated.View style={[{ height, borderRadius: height, backgroundColor: color }, animated]} />
    </View>
  );
}

/** Photo de profil, ou initiale sur fond coloré quand le joueur n'en a pas. */
export function Avatar({ name, color, size = 56, uri }: { name: string; color: string; size?: number; uri?: string | null }) {
  const source = mediaUri(uri);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: size >= 40 ? 3 : 2,
        borderColor: Colors.surfaceRaised,
        overflow: 'hidden',
      }}>
      {source ? (
        <Image source={{ uri: source }} style={{ width: '100%', height: '100%' }} contentFit="cover" accessibilityLabel={`Photo de ${name}`} />
      ) : (
        <AppText variant="heading" color={Colors.background} style={{ fontSize: size * 0.42 }}>
          {name.slice(0, 1).toUpperCase()}
        </AppText>
      )}
    </View>
  );
}

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <AppText variant="heading">{value}</AppText>
      <AppText variant="caption" muted>
        {label}
      </AppText>
    </View>
  );
}

const textStyles = StyleSheet.create<Record<Variant, TextStyle>>({
  display: { color: Colors.text, fontSize: 40, fontWeight: '900', letterSpacing: -1 },
  title: { color: Colors.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  heading: { color: Colors.text, fontSize: 20, fontWeight: '800' },
  body: { color: Colors.text, fontSize: 16, lineHeight: 22 },
  label: { color: Colors.text, fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
  caption: { color: Colors.text, fontSize: 13, fontWeight: '600' },
  score: { color: Colors.text, fontSize: 34, fontWeight: '900', fontVariant: ['tabular-nums'] },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  scroll: { flexGrow: 1, alignItems: 'center' },
  content: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  button: {
    minHeight: 54,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  track: { width: '100%', backgroundColor: Colors.surfaceRaised, overflow: 'hidden' },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
});
