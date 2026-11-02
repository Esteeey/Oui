import { router } from 'expo-router';
import { Pressable, Share, StyleSheet, View } from 'react-native';

import { getCategory, getTheme, type PublicProfile, type ThemeInfo, type UserSummary } from '@qu1z/shared';

import { UserRow } from '@/components/player-row';
import { SectionHeader } from '@/components/social';
import { AppText, Button, Screen } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { api, useApi } from '@/net/api';
import { useGameServer } from '@/state/game-server';

/** Abonnements : demandes reçues, mes listes, thèmes suivis, joueurs bloqués. */
export default function SocialScreen() {
  const { playerId } = useGameServer();
  const me = useApi<PublicProfile>(playerId ? `/api/users/${playerId}` : null);
  const requests = useApi<{ requests: { user: UserSummary; createdAt: number }[] }>(playerId ? '/api/me/follow-requests' : null);
  const themes = useApi<{ themes: ThemeInfo[] }>(playerId ? '/api/themes' : null);
  const subscribed = (themes.data?.themes ?? []).filter((t) => t.subscribed);
  const pending = requests.data?.requests ?? [];

  const invite = () =>
    Share.share({ message: `Viens me défier sur Qu1z ! Mon pseudo : @${me.data?.pseudo ?? ''}` }).catch(() => {});

  const link = (label: string, value: number | undefined, onPress: () => void) => (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.link}>
      <AppText variant="label">{label}</AppText>
      <AppText muted>{value !== undefined ? `${value}  ›` : '›'}</AppText>
    </Pressable>
  );

  return (
    <Screen inTabs>
      <AppText variant="title" style={{ paddingTop: Spacing.sm }}>
        Social
      </AppText>
      <Button label="Inviter un ami" color={Colors.opponent} onPress={invite} />

      {pending.length > 0 && (
        <>
          <SectionHeader title={`Demandes d’abonnement · ${pending.length}`} />
          {pending.map(({ user }) => (
            <UserRow
              key={user.id}
              user={user}
              right={
                <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                  <Button label="Refuser" variant="outline" color={Colors.textMuted} onPress={() => api('POST', `/api/me/follow-requests/${user.id}/decline`).catch(() => {})} />
                  <Button label="Accepter" color={Colors.correct} onPress={() => api('POST', `/api/me/follow-requests/${user.id}/accept`).catch(() => {})} />
                </View>
              }
            />
          ))}
        </>
      )}

      <SectionHeader title="Mes abonnements" />
      {playerId &&
        link('Mes abonnés', me.data?.followers, () =>
          router.push({ pathname: '/player/[id]/[list]', params: { id: playerId, list: 'followers' } }),
        )}
      {playerId &&
        link('Joueurs que je suis', me.data?.following, () =>
          router.push({ pathname: '/player/[id]/[list]', params: { id: playerId, list: 'following' } }),
        )}

      <SectionHeader title={`Thèmes suivis · ${subscribed.length}`} />
      {subscribed.length === 0 && <AppText muted>Abonne-toi à un thème depuis sa page pour suivre et publier dans son fil.</AppText>}
      {subscribed.map((t) => {
        const theme = getTheme(t.themeId);
        const category = theme ? getCategory(theme.categoryId) : undefined;
        if (!theme || !category) return null;
        return (
          <Pressable
            key={t.themeId}
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/theme/[id]', params: { id: t.themeId } })}
            style={[styles.link, { borderLeftWidth: 5, borderLeftColor: category.color }]}>
            <AppText variant="label">
              {category.icon} {theme.name}
            </AppText>
            <AppText muted>{t.subscribers} abonné{t.subscribers > 1 ? 's' : ''}</AppText>
          </Pressable>
        );
      })}

      <SectionHeader title="Confidentialité" />
      {link('Joueurs bloqués', undefined, () => router.push('/settings/blocked'))}
      {link('Profil et confidentialité', undefined, () => router.push('/settings/profile'))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  link: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    minHeight: 52,
  },
});
