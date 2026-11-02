import { router } from 'expo-router';
import { Pressable, Share, StyleSheet, View } from 'react-native';

import { getCategory, getTheme, type ChallengeView, type PublicProfile, type ThemeInfo, type UserSummary } from '@qu1z/shared';

import { UserRow } from '@/components/player-row';
import { SearchButton } from '@/components/search-button';
import { SectionHeader } from '@/components/social';
import { AppText, Button, Screen } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { api, errorMessage, useApi } from '@/net/api';
import { useState } from 'react';
import { useGameServer } from '@/state/game-server';

/** Abonnements : demandes reçues, mes listes, thèmes suivis, joueurs bloqués. */
export default function SocialScreen() {
  const { playerId } = useGameServer();
  const me = useApi<PublicProfile>(playerId ? `/api/users/${playerId}` : null);
  const requests = useApi<{ requests: { user: UserSummary; createdAt: number }[] }>(playerId ? '/api/me/follow-requests' : null);
  const themes = useApi<{ themes: ThemeInfo[] }>(playerId ? '/api/themes' : null);
  const subscribed = (themes.data?.themes ?? []).filter((t) => t.subscribed);
  const pending = requests.data?.requests ?? [];
  const challenges = useApi<{ challenges: ChallengeView[] }>(playerId ? '/api/challenges' : null);
  const incoming = (challenges.data?.challenges ?? []).filter((c) => c.incoming);
  const outgoing = (challenges.data?.challenges ?? []).filter((c) => !c.incoming);
  const [error, setError] = useState<string | null>(null);
  const act = (path: string) => {
    setError(null);
    api('POST', path).catch((e) => setError(errorMessage(e)));
  };

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
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: Spacing.sm }}>
        <AppText variant="title">Social</AppText>
        <SearchButton />
      </View>
      <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
        <Button label="Découvrir des joueurs" onPress={() => router.push('/discover')} style={{ flex: 1 }} />
        <Button label="Inviter" color={Colors.opponent} onPress={invite} style={{ flex: 1 }} />
      </View>

      {error && <AppText color={Colors.wrong}>{error}</AppText>}
      {incoming.length > 0 && (
        <>
          <SectionHeader title={`Défis reçus · ${incoming.length}`} />
          {incoming.map((c) => (
            <UserRow
              key={c.id}
              user={c.from}
              subtitle={`${c.kind === 'rematch' ? 'Revanche' : 'Défi'} · ${getTheme(c.themeId)?.name ?? ''}`}
              right={
                <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                  <Button label="Refuser" variant="outline" color={Colors.textMuted} onPress={() => act(`/api/challenges/${c.id}/decline`)} />
                  <Button label="Jouer" color={Colors.opponent} onPress={() => act(`/api/challenges/${c.id}/accept`)} />
                </View>
              }
            />
          ))}
        </>
      )}
      {outgoing.length > 0 && (
        <>
          <SectionHeader title={`Défis envoyés · ${outgoing.length}`} />
          {outgoing.map((c) => (
            <UserRow
              key={c.id}
              user={c.to}
              subtitle={`En attente · ${getTheme(c.themeId)?.name ?? ''}`}
              right={<Button label="Annuler" variant="outline" color={Colors.textMuted} onPress={() => act(`/api/challenges/${c.id}/cancel`)} />}
            />
          ))}
        </>
      )}

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
