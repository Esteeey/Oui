import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { THEMES, getCategory, getTheme, type ChallengeView } from '@qu1z/shared';

import { ChallengeRow } from '@/components/challenge-card';
import { PlayBanner } from '@/components/play-banner';
import { UserRow } from '@/components/player-row';
import { SectionHeader, type IconName } from '@/components/social';
import { AppText, Avatar, Button, Screen } from '@/components/ui';
import { Colors, Radius, Shadow, Spacing } from '@/constants/theme';
import { api, errorMessage, useApi } from '@/net/api';
import { useGameServer } from '@/state/game-server';
import { useProgress } from '@/state/progress';
import { avatarColor } from '@/utils/avatar';
import { Tap } from '@/components/tap';

/** Jouer : partie rapide, duel au hasard, défis reçus et envoyés, rejouer un thème ou un adversaire. */
export default function PlayScreen() {
  const { playerId } = useGameServer();
  const { history } = useProgress();
  const challenges = useApi<{ challenges: ChallengeView[] }>(playerId ? '/api/challenges' : null);
  const incoming = (challenges.data?.challenges ?? []).filter((c) => c.incoming);
  const outgoing = (challenges.data?.challenges ?? []).filter((c) => !c.incoming);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const quickTheme = history[0]?.themeId ?? THEMES[0].id;
  const recentThemes = [...new Set(history.map((d) => d.themeId))].filter((id) => getTheme(id)).slice(0, 4);
  // Derniers adversaires réels (jamais le bot), une fois chacun, avec le thème du dernier duel.
  const rivals = history
    .filter((d) => d.opponentId && !d.opponentIsBot)
    .filter((d, i, all) => all.findIndex((x) => x.opponentId === d.opponentId) === i)
    .slice(0, 5);

  const act = (path: string, body?: unknown, done?: string) => {
    setMessage(null);
    api('POST', path, body)
      .then(() => done && setMessage({ ok: true, text: done }))
      .catch((e) => setMessage({ ok: false, text: errorMessage(e) }));
  };
  const duel = (themeId: string, mode?: 'pvp') => router.push({ pathname: '/duel/[themeId]', params: mode ? { themeId, mode } : { themeId } });
  const randomTheme = () => THEMES[Math.floor(Math.random() * THEMES.length)].id;

  return (
    <Screen inTabs title="Jouer">
      <PlayBanner themeId={quickTheme} title={history.length ? 'Rejouer' : 'Prêt pour un duel ?'} />

      <View style={styles.quick}>
        <QuickAction icon="shuffle" label="Duel au hasard" hint="Thème surprise" onPress={() => duel(randomTheme(), 'pvp')} />
        <QuickAction icon="hardware-chip-outline" label="Entraînement" hint="Contre le bot" onPress={() => duel(quickTheme)} />
      </View>
      <View style={styles.quick}>
        <QuickAction icon="grid-outline" label="Choisir un thème" hint="Toutes les catégories" onPress={() => router.push('/explore')} />
        <QuickAction icon="trophy-outline" label="Classements" hint="Monde et abonnements" onPress={() => router.push('/leaderboard')} />
      </View>

      {message && <AppText color={message.ok ? Colors.correct : Colors.wrong}>{message.text}</AppText>}

      {incoming.length > 0 && (
        <>
          <SectionHeader title={`Défis reçus · ${incoming.length}`} />
          {incoming.map((c) => (
            <ChallengeRow key={c.id} c={c} onChanged={challenges.refresh} onMessage={(ok, text) => setMessage({ ok, text })} />
          ))}
        </>
      )}
      {outgoing.length > 0 && (
        <>
          <SectionHeader title={`Défis envoyés · ${outgoing.length}`} />
          {outgoing.map((c) => (
            <ChallengeRow key={c.id} c={c} onChanged={challenges.refresh} onMessage={(ok, text) => setMessage({ ok, text })} />
          ))}
        </>
      )}

      {rivals.length > 0 && (
        <>
          <SectionHeader title="Rejouer contre" />
          {rivals.map((d) => (
            <View key={d.opponentId} style={styles.row}>
              <Tap
                accessibilityRole="button"
                accessibilityLabel={`Profil de ${d.opponentName}`}
                onPress={() => router.push({ pathname: '/player/[id]', params: { id: d.opponentId! } })}
                style={styles.rowMain}>
                <Avatar name={d.opponentName} color={avatarColor(d.opponentId!)} size={44} />
                <View style={{ flex: 1 }}>
                  <AppText variant="label" numberOfLines={1}>
                    {d.opponentName}
                  </AppText>
                  <AppText variant="caption" muted numberOfLines={1}>
                    {d.outcome === 'win' ? 'Victoire' : d.outcome === 'loss' ? 'Défaite' : 'Égalité'} · {getTheme(d.themeId)?.name}
                  </AppText>
                </View>
              </Tap>
              <Button
                label="Défier"
                color={Colors.opponent}
                onPress={() => act('/api/challenges', { userId: d.opponentId, themeId: d.themeId }, `Défi envoyé à ${d.opponentName}.`)}
              />
            </View>
          ))}
        </>
      )}

      {recentThemes.length > 0 && (
        <>
          <SectionHeader title="Tes derniers thèmes" />
          {recentThemes.map((id) => {
            const theme = getTheme(id)!;
            const category = getCategory(theme.categoryId);
            return (
              <View key={id} style={[styles.row, { borderLeftWidth: 5, borderLeftColor: category?.color ?? Colors.accent }]}>
                <Tap
                  accessibilityRole="button"
                  onPress={() => router.push({ pathname: '/theme/[id]', params: { id } })}
                  style={styles.rowMain}>
                  <AppText style={{ fontSize: 26 }}>{category?.icon}</AppText>
                  <AppText variant="label" style={{ flex: 1 }} numberOfLines={1}>
                    {theme.name}
                  </AppText>
                </Tap>
                <Button label="Jouer" onPress={() => duel(id, 'pvp')} />
              </View>
            );
          })}
        </>
      )}

      <SectionHeader title="Défier un ami" />
      <Tap
        accessibilityRole="button"
        onPress={() => playerId && router.push({ pathname: '/player/[id]/[list]', params: { id: playerId, list: 'following' } })}
        style={styles.link}>
        <AppText variant="label">Choisir parmi les joueurs que je suis</AppText>
        <AppText muted>›</AppText>
      </Tap>
    </Screen>
  );
}

function QuickAction({ icon, label, hint, onPress }: { icon: IconName; label: string; hint: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.action, pressed && { opacity: 0.7 }]}>
      <View style={styles.actionIcon}>
        <Ionicons name={icon} size={22} color={Colors.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <AppText variant="label" numberOfLines={1}>
          {label}
        </AppText>
        <AppText variant="caption" muted numberOfLines={1}>
          {hint}
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  quick: { flexDirection: 'row', gap: Spacing.sm },
  action: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.sm + 4,
    minHeight: 64,
    ...Shadow,
  },
  actionIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FDE7EF', alignItems: 'center', justifyContent: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.sm + 4,
    ...Shadow,
  },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm + 4 },
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
