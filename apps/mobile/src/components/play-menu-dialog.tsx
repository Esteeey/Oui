import Ionicons from '@expo/vector-icons/Ionicons';
import { BlurView } from 'expo-blur';
import { useEffect, useState } from 'react';
import { BackHandler, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, useReducedMotion, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { UserSummary } from '@qu1z/shared';

import { playSound } from '@/audio/sounds';
import { OverlayPortal } from '@/components/overlay-portal';
import { Tap } from '@/components/tap';
import { ThemeIcon } from '@/components/theme-icon';
import { AppText, Avatar } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { api, errorMessage, useApi } from '@/net/api';
import { useGameServer } from '@/state/game-server';
import { appBlurTarget } from '@/state/app-blur-target';
import { avatarColor } from '@/utils/avatar';

/** Menu de jeu plein écran : l’icône du thème arrive au-dessus du choix d’adversaire. */
export function PlayMenuDialog({
  themeId,
  themeName,
  visible,
  onClose,
  onPlay,
}: {
  themeId: string;
  themeName: string;
  visible: boolean;
  onClose: () => void;
  onPlay: (mode?: 'pvp') => void;
}) {
  const { playerId } = useGameServer();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const [search, setSearch] = useState('');
  const [busyUser, setBusyUser] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const following = useApi<{ users: UserSummary[] }>(
    visible && playerId ? `/api/users/${playerId}/following?q=${encodeURIComponent(search)}` : null,
  );

  useEffect(() => {
    if (!visible) return;
    playSound('playMenu');
    setSearch('');
    setMessage(null);
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => subscription.remove();
  }, [onClose, visible]);

  const inviteFriend = async (user: UserSummary) => {
    setBusyUser(user.id);
    setMessage(null);
    try {
      await api('POST', '/api/live-invitations', { userId: user.id, themeId });
      onClose();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusyUser(null);
    }
  };

  const friends = following.data?.users ?? [];

  return (
    visible ? <OverlayPortal>
      <Animated.View entering={reduceMotion ? undefined : FadeIn.duration(180)} style={styles.overlay}>
        <BlurView
          blurTarget={appBlurTarget}
          blurMethod="dimezisBlurView"
          blurReductionFactor={1.2}
          intensity={56}
          style={StyleSheet.absoluteFill}
        />
        <View pointerEvents="none" style={styles.blurTint} />
        <Tap accessibilityRole="button" accessibilityLabel="Fermer le menu de jeu" onPress={onClose} style={StyleSheet.absoluteFill} />
        {/* Le contenu est remonté à chaque ouverture : les animations d’entrée rejouent aussi après fermeture. */}
        {visible && <Animated.View entering={reduceMotion ? undefined : FadeIn.duration(180)} style={[styles.content, { paddingTop: insets.top + 22, paddingBottom: Math.max(insets.bottom, Spacing.md) + 8 }]}>
          <Tap accessibilityRole="button" accessibilityLabel="Fermer" onPress={onClose} style={[styles.close, { top: insets.top + 10 }]}>
            <Ionicons name="close" size={24} color="#FFFFFF" />
          </Tap>

          <Animated.View entering={reduceMotion ? undefined : ZoomIn.delay(40).duration(420).springify()} style={styles.themeIcon}>
            <ThemeIcon themeId={themeId} size={86} />
          </Animated.View>
          <Animated.View entering={reduceMotion ? undefined : FadeInDown.delay(130).duration(280)} style={styles.titleBlock}>
            <AppText style={styles.title} numberOfLines={2}>{themeName}</AppText>
          </Animated.View>

          <Animated.View entering={reduceMotion ? undefined : FadeInDown.delay(210).duration(300)} style={styles.menuBody}>
            <View style={styles.modes}>
              <Tap accessibilityRole="button" onPress={() => { onClose(); onPlay(); }} style={[styles.modeButton, styles.solo]}>
                <Ionicons name="person" size={18} color="#16304C" />
                <AppText style={styles.soloLabel} numberOfLines={1}>Solo</AppText>
              </Tap>
              <Tap accessibilityRole="button" onPress={() => { onClose(); onPlay('pvp'); }} style={[styles.modeButton, styles.random]}>
                <Ionicons name="people" size={18} color="#FFFFFF" />
                <AppText style={styles.randomLabel} numberOfLines={1}>Adversaire aléatoire</AppText>
              </Tap>
            </View>

            <AppText style={styles.chooseLabel}>CHOISIR TON ADVERSAIRE</AppText>
            <View style={styles.search}>
              <Ionicons name="search" size={18} color="rgba(255,255,255,0.8)" />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Rechercher tes amis"
                placeholderTextColor="rgba(255,255,255,0.58)"
                accessibilityLabel="Rechercher un ami"
                returnKeyType="search"
                style={styles.searchInput}
              />
            </View>

            <ScrollView style={styles.friendList} contentContainerStyle={styles.friends} showsVerticalScrollIndicator={false}>
              {friends.map((user, index) => (
                <Animated.View key={user.id} entering={reduceMotion ? undefined : FadeIn.delay(300 + Math.min(index, 8) * 28).duration(180)}>
                  <Tap
                    accessibilityRole="button"
                    accessibilityLabel={`Inviter ${user.pseudo} en duel sur ${themeName}`}
                    disabled={!!busyUser}
                    onPress={() => void inviteFriend(user)}
                    style={styles.friend}>
                    <View style={styles.friendAvatar}>
                      <Avatar name={user.pseudo} uri={user.avatar} color={avatarColor(user.id)} size={52} />
                      {busyUser === user.id && <View style={styles.friendBusy}><AppText style={styles.busyText}>…</AppText></View>}
                    </View>
                    <AppText numberOfLines={1} style={styles.friendName}>{user.pseudo}</AppText>
                    <AppText numberOfLines={1} style={styles.friendLevel}>Niv. {user.level}</AppText>
                  </Tap>
                </Animated.View>
              ))}
              {friends.length === 0 && (
                <AppText style={styles.empty}>
                  {following.error
                    ? 'Impossible de charger tes amis.'
                    : following.data
                      ? search ? 'Aucun ami trouvé.' : 'Suis des joueurs pour les inviter ici.'
                      : 'Chargement des amis…'}
                </AppText>
              )}
            </ScrollView>
            {!!message && <AppText style={styles.error}>{message}</AppText>}
          </Animated.View>
        </Animated.View>}
      </Animated.View>
    </OverlayPortal> : null
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill, zIndex: 1000, alignItems: 'stretch', backgroundColor: 'transparent' },
  blurTint: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(5, 8, 18, 0.22)' },
  content: { flex: 1, alignItems: 'center', paddingHorizontal: Spacing.md, gap: Spacing.sm },
  close: { position: 'absolute', right: Spacing.md, zIndex: 2, width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.45)', backgroundColor: 'rgba(10,14,28,0.55)' },
  themeIcon: { width: 92, height: 92, alignItems: 'center', justifyContent: 'center', borderRadius: 24, overflow: 'hidden', backgroundColor: '#18A8CF', elevation: 14, shadowColor: '#000', shadowOpacity: 0.38, shadowRadius: 18, shadowOffset: { width: 0, height: 9 } },
  titleBlock: { width: '100%', alignItems: 'center', paddingBottom: Spacing.xs },
  title: { color: '#FFFFFF', fontSize: 26, lineHeight: 33, fontWeight: '800', textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.7)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 10 },
  menuBody: { width: '100%', maxWidth: 520, flex: 1, gap: Spacing.sm },
  modes: { flexDirection: 'row', gap: Spacing.xs },
  modeButton: { flex: 1, minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 8 },
  solo: { backgroundColor: '#F8F8FA', borderRadius: 7 },
  soloLabel: { color: '#192339', fontSize: 13, fontWeight: '700' },
  random: { backgroundColor: Colors.accent, borderRadius: 7 },
  randomLabel: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  chooseLabel: { alignSelf: 'center', marginTop: 2, color: '#FFFFFF', fontSize: 12, letterSpacing: 1.1, fontWeight: '800', textShadowColor: '#000', textShadowRadius: 5 },
  search: { minHeight: 39, flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, paddingHorizontal: 12, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)', backgroundColor: 'rgba(10,14,28,0.34)' },
  searchInput: { flex: 1, minHeight: 37, paddingVertical: 0, color: '#FFFFFF', fontSize: 13 },
  friendList: { flex: 1, minHeight: 80 },
  friends: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: Spacing.md, paddingTop: 2, paddingBottom: Spacing.sm },
  friend: { width: '18.5%', minWidth: 57, maxWidth: 74, alignItems: 'center', gap: 2 },
  friendAvatar: { position: 'relative', marginBottom: 1 },
  friendBusy: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', borderRadius: 30, backgroundColor: 'rgba(0,0,0,0.55)' },
  busyText: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  friendName: { maxWidth: '100%', color: '#FFFFFF', fontSize: 10, fontWeight: '700', textAlign: 'center', textShadowColor: '#000', textShadowRadius: 4 },
  friendLevel: { color: 'rgba(255,255,255,0.68)', fontSize: 9, textAlign: 'center' },
  empty: { alignSelf: 'center', marginTop: Spacing.lg, color: 'rgba(255,255,255,0.8)', fontSize: 13, textAlign: 'center' },
  error: { alignSelf: 'center', color: '#FF96AE', fontSize: 12, textAlign: 'center' },
});
