import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';

import { THEMES, type Theme, type UserSummary } from '@qu1z/shared';

import { Laurel, RankBadge, rankLabel } from '@/components/rank';
import { Tap } from '@/components/tap';
import { ThemeIcon } from '@/components/theme-icon';
import { AppText, Avatar } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { avatarColor } from '@/utils/avatar';
import { timeAgo } from '@/utils/time';

const BANNER_PURPLE = '#3B0D54';
const BANNER_LIGHT = '#4B166B';
const BANNER_STRIP = '#6A1B9A';

/** Date d'une publication, formulée comme dans le fil : « Il y a 2 h ». */
function fullAgo(at: number): string {
  const label = timeAgo(at);
  const full = /^\d/.test(label) ? `il y a ${label}` : label;
  return full.charAt(0).toUpperCase() + full.slice(1);
}

/** En-tête d'une carte du fil : photo, pseudo, rang et date. */
export function FeedCardHeader({ user, createdAt, right }: { user: UserSummary; createdAt: number; right?: ReactNode }) {
  const openUser = () => router.push({ pathname: '/player/[id]', params: { id: user.id } });
  return (
    <View style={styles.header}>
      <Tap accessibilityRole="button" accessibilityLabel={`Profil de ${user.pseudo}`} onPress={openUser}>
        <Avatar name={user.pseudo} color={avatarColor(user.id)} uri={user.avatar} size={40} ring={false} />
      </Tap>
      <View style={{ flex: 1, gap: 1 }}>
        <View style={styles.nameRow}>
          <AppText color={Colors.ink} style={styles.name} onPress={openUser} numberOfLines={1}>
            {user.pseudo}
          </AppText>
          <RankBadge small label={rankLabel(user.title, user.level)} />
        </View>
        <AppText color={Colors.textSoft} style={styles.time}>
          {fullAgo(createdAt)}
        </AppText>
      </View>
      {right}
    </View>
  );
}

/** Bandeau violet d'un défi jouable : icônes de thèmes voisins et bouton « Relever le défi ». */
export function ChallengeBanner({ theme }: { theme: Theme }) {
  const open = () => router.push({ pathname: '/theme/[id]', params: { id: theme.id } });
  const tiles = [theme, ...THEMES.filter((t) => t.categoryId === theme.categoryId && t.id !== theme.id)].slice(0, 3);
  return (
    <Tap accessibilityRole="button" accessibilityLabel={`Relever le défi : ${theme.name}`} onPress={open} style={styles.challenge}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Svg width="100%" height="100%" viewBox="0 0 780 205" preserveAspectRatio="none">
          <Polygon points="0,0 90,0 0,90" fill={BANNER_STRIP} />
          <Polygon points="780,85 780,205 665,205" fill={BANNER_STRIP} />
        </Svg>
      </View>
      <View style={styles.tiles}>
        {tiles.map((t) => (
          <View key={t.id} style={styles.tile}>
            <ThemeIcon themeId={t.id} size={32} />
          </View>
        ))}
      </View>
      <View style={styles.challengeButton}>
        <Ionicons name="game-controller-outline" size={18} color={Colors.onAccent} />
        <AppText color={Colors.onAccent} style={styles.challengeLabel}>
          Relever le défi
        </AppText>
      </View>
    </Tap>
  );
}

/** Bandeau violet d'un résultat : trophée, thème, score et récompense. */
export function ResultBanner({ themeName, value, pill, onPress }: { themeName: string; value: string; pill: string; onPress?: () => void }) {
  return (
    <Tap accessibilityRole="button" accessibilityLabel={`${themeName} : ${value}, ${pill}`} onPress={onPress} style={styles.result}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Svg width="100%" height="100%" viewBox="0 0 772 132" preserveAspectRatio="none">
          <Polygon points="475,132 605,0 772,0 772,132" fill={BANNER_LIGHT} />
          <Polygon points="475,132 605,0 640,0 510,132" fill={BANNER_STRIP} />
        </Svg>
      </View>
      <View style={styles.trophy}>
        <Laurel height={26} color="#6B2FA0" stem="#6B2FA0" />
        <Ionicons name="trophy" size={38} color={Colors.goldBright} />
        <Laurel flip height={26} color="#6B2FA0" stem="#6B2FA0" />
      </View>
      <View style={styles.resultDivider} />
      <AppText color={Colors.onAccent} style={styles.resultTheme} numberOfLines={1}>
        {themeName}
      </AppText>
      <View style={styles.resultScore}>
        <AppText color={Colors.onAccent} style={styles.resultValue} numberOfLines={1}>
          {value}
        </AppText>
        <View style={styles.resultPill}>
          <AppText color={Colors.onAccent} style={styles.resultPillText} numberOfLines={1}>
            {pill}
          </AppText>
        </View>
      </View>
    </Tap>
  );
}

export const feedCard = {
  backgroundColor: '#FDFDFE',
  borderRadius: Radius.md,
  paddingHorizontal: 10,
  paddingTop: 6,
  paddingBottom: Spacing.xs,
  gap: 6,
  borderWidth: 1,
  borderColor: Colors.border,
} as const;

const styles = StyleSheet.create({
  header: { flexDirection: 'row', gap: 9, alignItems: 'center', paddingLeft: 4 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 15, lineHeight: 21, fontWeight: '800', flexShrink: 1 },
  time: { fontSize: 12, lineHeight: 16 },
  challenge: { height: 94, borderRadius: 13, overflow: 'hidden', backgroundColor: BANNER_PURPLE, alignItems: 'center', justifyContent: 'center', gap: 6 },
  tiles: { flexDirection: 'row', gap: 9 },
  tile: { width: 78, height: 46, borderRadius: 8, borderWidth: 1.5, borderColor: '#9B6BC4', alignItems: 'center', justifyContent: 'center' },
  challengeButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, width: 165, height: 28, borderRadius: Radius.pill, backgroundColor: '#FF1493' },
  challengeLabel: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  result: { height: 60, borderRadius: 12, overflow: 'hidden', backgroundColor: BANNER_PURPLE, flexDirection: 'row', alignItems: 'center', paddingLeft: 10, paddingRight: 10 },
  trophy: { flexDirection: 'row', alignItems: 'center' },
  resultDivider: { width: 1, height: 44, marginHorizontal: 10, backgroundColor: '#7C3FA8' },
  resultTheme: { flex: 1, fontSize: 17, lineHeight: 24, fontWeight: '800' },
  resultScore: { alignItems: 'center', gap: 1 },
  resultValue: { fontSize: 22, lineHeight: 28, fontWeight: '800' },
  resultPill: { minWidth: 82, height: 18, paddingHorizontal: 8, borderRadius: 6, backgroundColor: '#FF1493', alignItems: 'center', justifyContent: 'center' },
  resultPillText: { fontSize: 11, lineHeight: 15, fontWeight: '600' },
});
