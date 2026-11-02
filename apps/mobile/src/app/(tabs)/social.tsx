import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, Share, StyleSheet, View } from 'react-native';

import { getCategory, getTheme } from '@qu1z/shared';

import { PlayerRow } from '@/components/player-row';
import { DemoNote, SectionHeader } from '@/components/social';
import { AppText, Button, Screen } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { PLAYERS, getPlayer, themeName } from '@/demo/data';
import { useSocial } from '@/state/social';

export default function SocialScreen() {
  const { friends, requests, challenges, acceptRequest, declineRequest } = useSocial();
  const friendPlayers = PLAYERS.filter((p) => friends.includes(p.id)).sort(
    (a, b) => Number(b.online) - Number(a.online),
  );
  const suggestions = PLAYERS.filter((p) => !friends.includes(p.id) && !requests.includes(p.id));

  const invite = () =>
    Share.share({ message: 'Viens me défier sur Qu1z, le jeu de duels de culture générale !' }).catch(() => {});

  return (
    <Screen inTabs>
      <AppText variant="title" style={{ paddingTop: Spacing.sm }}>
        Social
      </AppText>

      <Button label="Inviter un ami" color={Colors.opponent} onPress={invite} />

      {challenges.length > 0 && (
        <>
          <SectionHeader title={`Défis reçus · ${challenges.length}`} />
          {challenges.map((c) => {
            const from = getPlayer(c.fromId)!;
            const category = getCategory(getTheme(c.themeId)!.categoryId)!;
            return (
              <PlayerRow
                key={c.id}
                player={from}
                subtitle={`${category.icon} ${themeName(c.themeId)} · ${c.ago}`}
                right={
                  <Pressable
                    accessibilityRole="button"
                    onPress={() =>
                      router.push({
                        pathname: '/duel/[themeId]',
                        params: { themeId: c.themeId, opponent: c.fromId, challenge: c.id },
                      })
                    }
                    style={[styles.pill, { backgroundColor: Colors.opponent }]}>
                    <Ionicons name="flash" size={14} color={Colors.background} />
                    <AppText variant="caption" color={Colors.background}>
                      Jouer
                    </AppText>
                  </Pressable>
                }
              />
            );
          })}
        </>
      )}

      {requests.length > 0 && (
        <>
          <SectionHeader title={`Demandes d'amis · ${requests.length}`} />
          {requests.map((id) => {
            const player = getPlayer(id)!;
            return (
              <PlayerRow
                key={id}
                player={player}
                subtitle={player.bio}
                right={
                  <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                    <Pressable accessibilityLabel="Refuser" onPress={() => declineRequest(id)} style={[styles.round, { borderColor: Colors.border }]}>
                      <Ionicons name="close" size={18} color={Colors.textMuted} />
                    </Pressable>
                    <Pressable accessibilityLabel="Accepter" onPress={() => acceptRequest(id)} style={[styles.round, { backgroundColor: Colors.correct, borderColor: Colors.correct }]}>
                      <Ionicons name="checkmark" size={18} color={Colors.background} />
                    </Pressable>
                  </View>
                }
              />
            );
          })}
        </>
      )}

      <SectionHeader title={`Amis · ${friendPlayers.length}`} />
      {friendPlayers.map((p) => (
        <PlayerRow
          key={p.id}
          player={p}
          subtitle={p.online ? 'En ligne' : p.bio}
          right={<Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />}
        />
      ))}

      {suggestions.length > 0 && (
        <>
          <SectionHeader title="Suggestions" />
          {suggestions.map((p) => (
            <PlayerRow key={p.id} player={p} subtitle={p.bio} right={<Ionicons name="person-add" size={18} color={Colors.opponent} />} />
          ))}
        </>
      )}

      <DemoNote>Les amis, défis et demandes sont fictifs en attendant le serveur de jeu.</DemoNote>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: Radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  round: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
