import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { GradientHeader, HeaderBack, Logo } from '@/components/header';
import { Colors, Fonts, MaxContentWidth, NavBarHeight, Radius, Shadow, Spacing, fontForWeight, isArena } from '@/constants/theme';

const ARENA = isArena();
import { mediaUri } from '@/net/media';

type Variant = 'display' | 'title' | 'heading' | 'body' | 'label' | 'caption' | 'score';

/** Dégradé du bloc d'en-tête : bleu ciel en haut, rose très pâle, puis presque blanc. */
const HEADER_SKY = ['#CDEFFB', '#E2E9FB', '#F8E8FA', '#FEFAFE'] as const;
const HEADER_SKY_STOPS = [0, 0.42, 0.72, 1] as const;
const HEADER_CARD_RADIUS = 20;

/** Traduit la graisse demandée en famille Poppins, sauf si le style impose déjà sa police. */
function withAppFont(style: TextStyle): TextStyle {
  if (style.fontFamily) return style;
  const { fontWeight, ...rest } = style;
  return { ...rest, fontFamily: fontForWeight(fontWeight) };
}

export function AppText({
  variant = 'body',
  muted,
  color,
  style,
  ...props
}: TextProps & { variant?: Variant; muted?: boolean; color?: string }) {
  const resolved = StyleSheet.flatten([textStyles[variant], muted && { color: Colors.textMuted }, color ? { color } : null, style]) as TextStyle;
  return <Text {...props} style={withAppFont(resolved)} />;
}

/** Marge basse à laisser sous un contenu pour qu'il ne passe pas derrière la barre de navigation. */
export function useNavBarSpace(): number {
  return NavBarHeight + Math.max(useSafeAreaInsets().bottom, 14) + Spacing.sm;
}

/**
 * Écran standard : fond très clair, en-tête clair (titre, retour, actions), puis le contenu.
 * Les onglets affichent le logo à gauche, les autres écrans un retour.
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
  headerContent,
  onRefresh,
  refreshing = false,
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
  /** Contenu ajouté sous le titre : l'en-tête devient un bloc en dégradé, arrondi en bas, au-dessus du contenu. */
  headerContent?: ReactNode;
  /** Active « tirer pour actualiser » sur un écran défilant. */
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const navSpace = useNavBarSpace();
  const content = <View style={[styles.content, style]}>{children}</View>;
  const left = headerLeft ?? (back ? <HeaderBack close={back === 'close'} /> : inTabs ? <Logo /> : null);
  const bottom = inTabs ? { paddingBottom: navSpace } : null;
  const header = <GradientHeader title={title} left={left} right={headerRight} alignLeft={inTabs} compact={!!headerContent} />;
  return (
    <View style={styles.screen}>
      {headerContent ? (
        <View style={styles.headerCard}>
          <LinearGradient colors={HEADER_SKY} locations={HEADER_SKY_STOPS} style={[StyleSheet.absoluteFill, styles.headerCardFill]} />
          {header}
          {headerContent}
        </View>
      ) : (
        header
      )}
      <SafeAreaView style={styles.sheet} edges={inTabs ? [] : ['bottom']}>
        {scroll ? (
          <ScrollView
            contentContainerStyle={[styles.scroll, bottom]}
            showsVerticalScrollIndicator={false}
            refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} colors={[Colors.accent]} /> : undefined}>
            {content}
          </ScrollView>
        ) : (
          <View style={[styles.scroll, bottom]}>{content}</View>
        )}
      </SafeAreaView>
    </View>
  );
}

/** Indicateur d'un premier chargement ; attend un instant pour ne pas clignoter sur un chargement rapide. */
export function LoadingState({ visible, label = 'Chargement…' }: { visible: boolean; label?: string }) {
  const [late, setLate] = useState(false);
  useEffect(() => {
    if (!visible) {
      setLate(false);
      return;
    }
    const timer = setTimeout(() => setLate(true), 300);
    return () => clearTimeout(timer);
  }, [visible]);
  if (!visible || !late) return null;
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={label} accessibilityLiveRegion="polite" style={styles.loading}>
      <ActivityIndicator color={Colors.accent} />
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Button({
  label,
  onPress,
  color,
  textColor,
  variant = 'solid',
  disabled,
  style,
  small,
  compact,
}: {
  label: string;
  onPress?: () => void;
  /** Sans couleur, un bouton plein prend le rose de l'accent. */
  color?: string;
  textColor?: string;
  variant?: 'solid' | 'outline';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Version compacte (hauteur 38, texte 14). */
  small?: boolean;
  /** Variante intermédiaire pour les actions de profil (hauteur 48). */
  compact?: boolean;
}) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  const solid = variant === 'solid';
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => scale.set(withSpring(0.93, { duration: 120 }))}
      onPressOut={() => scale.set(withSpring(1, { damping: 9, stiffness: 280 }))}
      style={style}>
      <Animated.View
        style={[
          styles.button,
          small && styles.buttonSmall,
          compact && styles.buttonCompact,
          solid ? { backgroundColor: !color || color === Colors.accent ? Colors.accentFill : color } : { borderColor: color ?? Colors.accent, borderWidth: 2 },
          ARENA && solid && styles.buttonArena,
          disabled && { opacity: 0.4 },
          animated,
        ]}>
        <AppText variant="label" color={textColor ?? (solid ? Colors.onAccent : !color || color === Colors.accent ? Colors.accentInk : color)} style={small ? { fontSize: 13 } : compact ? { fontSize: 14 } : undefined}>
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

/** Photo de profil cerclée de rose, ou initiale sur fond coloré quand le joueur n'en a pas. */
export function Avatar({
  name,
  color,
  size = 56,
  uri,
  borderColor = Colors.avatarRing,
  ring = true,
}: {
  name: string;
  color: string;
  size?: number;
  uri?: string | null;
  borderColor?: string;
  /** Contour rose ; absent dans le fil d'actualité. */
  ring?: boolean;
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
        borderWidth: !ring ? 0 : size >= 100 ? 4 : size >= 72 ? 3 : 2,
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
  display: { color: Colors.text, fontSize: 38, fontWeight: '800', letterSpacing: -0.5 },
  title: { color: Colors.text, fontSize: 26, fontWeight: '800' },
  heading: { color: Colors.text, fontSize: 18, fontWeight: '700' },
  body: { color: Colors.text, fontSize: 15, lineHeight: 22 },
  label: { color: Colors.text, fontSize: 15, fontWeight: '600' },
  caption: { color: Colors.text, fontSize: 12 },
  score: { color: Colors.text, fontSize: 34, fontFamily: Fonts.score, fontVariant: ['tabular-nums'] },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  headerCard: {
    zIndex: 2,
    elevation: 4,
    borderBottomLeftRadius: HEADER_CARD_RADIUS,
    borderBottomRightRadius: HEADER_CARD_RADIUS,
    backgroundColor: Colors.surface,
    boxShadow: '0 3px 10px rgba(14, 15, 43, 0.12)',
  },
  headerCardFill: { borderBottomLeftRadius: HEADER_CARD_RADIUS, borderBottomRightRadius: HEADER_CARD_RADIUS },
  sheet: { flex: 1 },
  scroll: { flexGrow: 1, alignItems: 'center' },
  content: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
    gap: Spacing.md,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: Spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    ...Shadow,
  },
  button: {
    minHeight: 50,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    overflow: 'hidden',
  },
  // Thème Arène : bouton « de jeu » en relief (contour et ombre franche).
  buttonArena: { borderWidth: 2, borderColor: '#0B3C5D', boxShadow: '0 4px 0 #0B3C5D', overflow: 'visible' },
  buttonSmall: { minHeight: 38, paddingHorizontal: Spacing.md, borderRadius: Radius.xs },
  buttonCompact: { minHeight: 44, paddingHorizontal: Spacing.md, borderRadius: Radius.xs },
  track: { width: '100%', backgroundColor: Colors.surfaceRaised, overflow: 'hidden' },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  loading: { alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing.xl },
});
