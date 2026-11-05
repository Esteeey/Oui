import { router } from 'expo-router';
import { Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';

import { getCategory, getTheme, type PeopleEntry, type PeopleSections, type PublicProfile, type ThemeInfo } from '@qu1z/shared';

import { HeaderButton } from '@/components/header';
import { UserRow } from '@/components/player-row';
import { SectionHeader } from '@/components/social';
import { AppText, Avatar, Button, Screen } from '@/components/ui';
import { Colors, Radius, Shadow, Spacing } from '@/constants/theme';
import { useApi } from '@/net/api';
import { useGameServer } from '@/state/game-server';
import { avatarColor } from '@/utils/avatar';
import { Tap } from '@/components/tap';

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;

/**
 * Personnes : suggestions, joueurs aux thèmes communs, actifs et populaires (sans âge, sexe ni position),
 * puis mes abonnés et abonnements, thèmes suivis, confidentialité.
 * Les défis sont dans l'onglet Jouer, les demandes d'abonnement dans l'onglet Activité.
 */
export default function PeopleScreen() {
  const { playerId } = useGameServer();
  const me = useApi<PublicProfile>(playerId ? `/api/users/${playerId}` : null);
  const people = useApi<PeopleSections>(playerId ? '/api/people' : null);
  const themes = useApi<{ themes: ThemeInfo[] }>(playerId ? '/api/themes' : null);
  const subscribed = (themes.data?.themes ?? []).filter((t) => t.subscribed);

  const invite = () =>
    Share.share({ message: `Viens me défier sur Qu1z ! Mon pseudo : @${me.data?.pseudo ?? ''}` }).catch(() => {});

  const link = (label: string, value: number | undefined, onPress: () => void) => (
    <Tap accessibilityRole="button" onPress={onPress} style={styles.link}>
      <AppText variant="label">{label}</AppText>
      <AppText muted>{value !== undefined ? `${value}  ›` : '›'}</AppText>
    </Tap>
  );

  return (
    <Screen inTabs title="Personnes" headerRight={<HeaderButton icon="search" label="Rechercher" onPress={() => router.push('/search')} />}>
      <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
        <Button label="Découvrir des joueurs" onPress={() => router.push('/discover')} style={{ flex: 1 }} />
        <Button label="Inviter" color={Colors.opponent} onPress={invite} style={{ flex: 1 }} />
      </View>

      <SectionHeader
        title="Suggestions"
        action={
          <Tap accessibilityRole="link" onPress={() => router.push('/discover')} hitSlop={8}>
            <AppText variant="label" color={Colors.accent}>
              Tout voir
            </AppText>
          </Tap>
        }
      />
      {people.data && people.data.suggestions.length === 0 && <AppText muted>Pas encore d’autres joueurs à te proposer.</AppText>}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carousel} style={styles.carouselBleed}>
        {(people.data?.suggestions ?? []).map((u) => (
          <Pressable
            key={u.id}
            accessibilityRole="button"
            accessibilityLabel={`Profil de ${u.pseudo}`}
            onPress={() => router.push({ pathname: '/player/[id]', params: { id: u.id } })}
            style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}>
            <Avatar name={u.pseudo} color={avatarColor(u.id)} uri={u.avatar} size={56} />
            <AppText variant="label" numberOfLines={1}>
              {u.pseudo}
            </AppText>
            <AppText variant="caption" color={Colors.gold}>
              Niveau {u.level}
            </AppText>
          </Pressable>
        ))}
      </ScrollView>

      <PeopleSection title="Thèmes en commun" entries={people.data?.commonThemes} hint={(e) => `${plural(e.commonThemes ?? 0, 'thème')} en commun`} />
      <PeopleSection title="Joueurs actifs" entries={people.data?.active} hint={(e) => `${plural(e.duelsThisWeek ?? 0, 'duel')} cette semaine`} />
      <PeopleSection
        title="Joueurs populaires"
        entries={people.data?.popular}
        hint={(e) => (e.followers == null ? 'Très suivi' : plural(e.followers, 'abonné'))}
      />

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
          <Tap
            key={t.themeId}
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/theme/[id]', params: { id: t.themeId } })}
            style={[styles.link, { borderLeftWidth: 5, borderLeftColor: category.color }]}>
            <AppText variant="label">
              {category.icon} {theme.name}
            </AppText>
            <AppText muted>{t.subscribers} abonné{t.subscribers > 1 ? 's' : ''}</AppText>
          </Tap>
        );
      })}

      <SectionHeader title="Confidentialité" />
      {link('Joueurs bloqués', undefined, () => router.push('/settings/blocked'))}
      {link('Profil et confidentialité', undefined, () => router.push('/settings/profile'))}
    </Screen>
  );
}

/** Section de joueurs avec la raison de la proposition ; masquée quand elle est vide. */
function PeopleSection({ title, entries, hint }: { title: string; entries?: PeopleEntry[]; hint: (e: PeopleEntry) => string }) {
  if (!entries?.length) return null;
  return (
    <>
      <SectionHeader title={title} />
      {entries.map((e) => (
        <UserRow key={e.user.id} user={e.user} subtitle={hint(e)} />
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  carouselBleed: { marginHorizontal: -Spacing.md },
  carousel: { gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingBottom: 4 },
  card: {
    width: 132,
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.sm + 4,
  },
  link: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    minHeight: 52,
    ...Shadow,
  },
});
