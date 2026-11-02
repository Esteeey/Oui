import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { THEMES, getCategory } from '@qu1z/shared';

import { BackButton } from '@/components/back-button';
import { ProfileHeader, Showcase, StatsCard } from '@/components/profile-view';
import { DemoNote, SectionHeader } from '@/components/social';
import { AppText, Button, Card, Screen } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { demoRating, demoXp, getPlayer } from '@/demo/data';
import { useProgress } from '@/state/progress';
import { useSocial } from '@/state/social';

export default function PlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const player = getPlayer(id);
  const { history } = useProgress();
  const { friends, requests, addFriend, removeFriend, acceptRequest } = useSocial();
  const [choosing, setChoosing] = useState(false);
  if (!player) return <Redirect href="/" />;

  const isFriend = friends.includes(player.id);
  const xp = THEMES.reduce((t, th) => t + demoXp(player.id, th.id), 0);
  const showcase = player.showcase.map((themeId) => ({
    themeId,
    xp: demoXp(player.id, themeId),
    rating: demoRating(player.id, themeId),
  }));

  // Bilan des face-à-face contre ce joueur.
  const versus = history.filter((d) => d.opponentId === player.id);
  const myWins = versus.filter((d) => d.outcome === 'win').length;
  const theirWins = versus.filter((d) => d.outcome === 'loss').length;

  return (
    <Screen>
      <BackButton />
      <ProfileHeader
        name={player.name}
        color={player.color}
        country={player.country}
        bio={player.bio}
        xp={xp}
        actions={
          <View style={styles.actions}>
            <Button label="Défier" color={Colors.opponent} onPress={() => setChoosing((c) => !c)} style={{ flex: 1 }} />
            <Button
              label={isFriend ? 'Ami ✓' : requests.includes(player.id) ? 'Accepter' : 'Ajouter'}
              variant="outline"
              color={isFriend ? Colors.textMuted : Colors.text}
              onPress={() =>
                isFriend ? removeFriend(player.id) : requests.includes(player.id) ? acceptRequest(player.id) : addFriend(player.id)
              }
              style={{ flex: 1 }}
            />
          </View>
        }
      />

      {choosing && (
        <Card>
          <AppText variant="label">Choisis le thème du défi</AppText>
          {THEMES.map((t) => {
            const category = getCategory(t.categoryId)!;
            return (
              <Pressable
                key={t.id}
                onPress={() => router.push({ pathname: '/duel/[themeId]', params: { themeId: t.id, opponent: player.id } })}
                style={[styles.option, { borderColor: category.color }]}>
                <AppText>{category.icon}</AppText>
                <AppText variant="label" style={{ flex: 1 }}>
                  {t.name}
                </AppText>
                <Ionicons name="flash" size={16} color={category.color} />
              </Pressable>
            );
          })}
        </Card>
      )}

      <Card style={styles.rivalry}>
        <AppText variant="caption" muted>
          FACE-À-FACE
        </AppText>
        <AppText variant="score">
          <AppText variant="score" color={Colors.player}>
            {myWins}
          </AppText>
          {' – '}
          <AppText variant="score" color={player.color}>
            {theirWins}
          </AppText>
        </AppText>
        <AppText variant="caption" muted>
          {versus.length ? `${versus.length} duel${versus.length > 1 ? 's' : ''} joué${versus.length > 1 ? 's' : ''}` : 'Pas encore de duel entre vous'}
        </AppText>
      </Card>

      <StatsCard
        stats={[
          { label: 'Thèmes', value: String(player.showcase.length) },
          { label: 'Statut', value: player.online ? 'En ligne' : 'Hors ligne' },
        ]}
      />

      <Showcase title="Thèmes phares" themes={showcase} />

      <SectionHeader title="Profil de démonstration" />
      <DemoNote>
        {player.name} est un joueur fictif. En duel, ses réponses sont simulées par le bot d'entraînement.
      </DemoNote>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: Spacing.sm, alignSelf: 'stretch', marginTop: Spacing.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderRadius: Radius.sm,
    padding: Spacing.sm + 4,
  },
  rivalry: { alignItems: 'center' },
});
