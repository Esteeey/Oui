import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, usePathname } from 'expo-router';
import type { ComponentProps, ReactNode } from 'react';
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

import { GradientHeader, HEADER_OVERLAP, HeaderBack, Logo } from '@/components/header';
import { Colors, Gradients, Fonts, MaxContentWidth, Radius, Shadow, Spacing } from '@/constants/theme';
import { mediaUri } from '@/net/media';
import { useGameServer } from '@/state/game-server';
import { avatarColor } from '@/utils/avatar';

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

/**
 * Écran standard : bandeau dégradé en haut (titre, retour, actions), puis une feuille claire arrondie
 * qui recouvre le bas du bandeau. Les onglets affichent le logo à gauche, les autres écrans un retour.
 */
export function Screen({
  children,
  scroll = true,
  inTabs = false,
  style,
  title,
  back,
  headerLeft,
  headerRight,
}: {
  children?: ReactNode;
  scroll?: boolean;
  /** Écran affiché dans un onglet : la barre d'onglets gère déjà le bas de l'écran. */
  inTabs?: boolean;
  style?: StyleProp<ViewStyle>;
  title?: ReactNode;
  /** Bouton de retour dans le bandeau (`'close'` pour une fenêtre modale). */
  back?: boolean | 'close';
  headerLeft?: ReactNode;
  headerRight?: ReactNode;
}) {
  const content = <View style={[styles.content, style]}>{children}</View>;
  const left = headerLeft ?? (back ? <HeaderBack close={back === 'close'} /> : inTabs ? <Logo /> : null);
  return (
    <View style={styles.screen}>
      <GradientHeader
        title={title}
        left={left}
        right={
          inTabs ? (
            <>
              {headerRight}
              <ProfileButton />
            </>
          ) : (
            headerRight
          )
        }
      />
      <SafeAreaView style={styles.sheet} edges={inTabs ? [] : ['bottom']}>
        {scroll ? (
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            {content}
          </ScrollView>
        ) : (
          <View style={styles.scroll}>{content}</View>
        )}
      </SafeAreaView>
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Button({
  label,
  icon,
  onPress,
  color,
  textColor,
  variant = 'solid',
  disabled,
  style,
  small,
}: {
  label: string;
  icon?: ComponentProps<typeof Ionicons>['name'];
  onPress?: () => void;
  /** Sans couleur, un bouton plein prend le dégradé rose de l'accent. */
  color?: string;
  textColor?: string;
  variant?: 'solid' | 'outline';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Version compacte (hauteur 38, texte 14). */
  small?: boolean;
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
          small && styles.buttonSmall,
          solid ? { backgroundColor: color ?? Colors.accent } : { borderColor: color ?? Colors.accent, borderWidth: 2 },
          disabled && { opacity: 0.4 },
          animated,
        ]}>
        {solid && !color && (
          <LinearGradient colors={Gradients.accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          {icon && <Ionicons name={icon} size={18} color={textColor ?? (solid ? Colors.onAccent : (color ?? Colors.accent))} />}
          <AppText variant="label" color={textColor ?? (solid ? Colors.onAccent : (color ?? Colors.accent))} style={small ? { fontSize: 14 } : undefined}>
            {label}
          </AppText>
        </View>
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
/** Photo du joueur dans le bandeau des onglets : ouvre son profil (sauf sur le profil lui-même). */
function ProfileButton() {
  const { playerId, profile } = useGameServer();
  const pathname = usePathname();
  if (pathname === '/profile') return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Mon profil"
      hitSlop={8}
      onPress={() => router.push('/profile')}
      style={({ pressed }) => [pressed && { opacity: 0.7 }]}>
      <Avatar name={profile?.name ?? '?'} color={playerId ? avatarColor(playerId) : Colors.accent} uri={profile?.avatar} size={36} borderColor="rgba(255, 255, 255, 0.9)" />
    </Pressable>
  );
}

export function Avatar({
  name,
  color,
  size = 56,
  uri,
  borderColor = Colors.surface,
}: {
  name: string;
  color: string;
  size?: number;
  uri?: string | null;
  borderColor?: string;
}) {
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
        borderColor,
        overflow: 'hidden',
      }}>
      {source ? (
        <Image source={{ uri: source }} style={{ width: '100%', height: '100%' }} contentFit="cover" accessibilityLabel={`Photo de ${name}`} />
      ) : (
        <AppText variant="heading" color={Colors.onAccent} style={{ fontSize: size * 0.42 }}>
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
  score: { color: Colors.text, fontSize: 34, fontFamily: Fonts.score, fontVariant: ['tabular-nums'] },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.navy },
  sheet: {
    flex: 1,
    marginTop: -HEADER_OVERLAP,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    backgroundColor: Colors.background,
    overflow: 'hidden',
  },
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
    ...Shadow,
  },
  button: {
    minHeight: 54,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    overflow: 'hidden',
  },
  buttonSmall: { minHeight: 38, paddingHorizontal: Spacing.md },
  track: { width: '100%', backgroundColor: Colors.surfaceRaised, overflow: 'hidden' },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
});
