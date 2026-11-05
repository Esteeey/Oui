import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { DailyQuests } from '@qu1z/shared';

import { AppText, Card } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { useApi } from '@/net/api';
import { useGameServer } from '@/state/game-server';

/** « 05:12:09 » : heures, minutes et secondes restantes. */
export function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/**
 * Carte « Défis du jour » de l'accueil : 3 objectifs avec leur avancée et leur récompense en XP, et le compte
 * à rebours jusqu'à minuit (nouveaux objectifs). Rechargée après chaque match (l'XP du profil change).
 */
export function DailyQuestsCard() {
  const { playerId, profile } = useGameServer();
  const quests = useApi<DailyQuests>(playerId ? '/api/quests' : null);
  const [now, setNow] = useState(() => Date.now());
  const resetsAt = quests.data?.resetsAt ?? null;

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (profile) quests.refresh();
    // Après un match : nouvelle avancée.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.xp]);
  useEffect(() => {
    if (resetsAt !== null && now >= resetsAt) quests.refresh();
    // Minuit passé : nouveaux objectifs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetsAt !== null && now >= resetsAt]);

  const data = quests.data;
  if (!data) return null;
  const done = data.quests.filter((q) => q.done).length;
  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <AppText variant="heading" style={{ fontSize: 17 }}>
          Défis du jour · {done}/{data.quests.length}
        </AppText>
        <View style={styles.timer} accessible accessibilityLabel={`Nouveaux défis dans ${clock(data.resetsAt - now)}`}>
          <Ionicons name="time-outline" size={16} color={Colors.textMuted} />
          <AppText variant="caption" muted style={{ fontVariant: ['tabular-nums'] }}>
            {clock(data.resetsAt - now)}
          </AppText>
        </View>
      </View>
      {data.quests.map((q) => (
        <View key={q.id} style={styles.row}>
          <Ionicons name={q.done ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={q.done ? Colors.correct : Colors.textMuted} />
          <View style={{ flex: 1, gap: 4 }}>
            <AppText variant="label" style={q.done ? styles.doneText : undefined}>
              {q.label}
            </AppText>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${Math.round((q.progress / q.goal) * 100)}%`, backgroundColor: q.done ? Colors.correct : Colors.accent }]} />
            </View>
            <AppText variant="caption" muted>
              {q.kind === 'score' ? (q.done ? 'Atteint' : 'Pas encore') : `${q.progress}/${q.goal}`}
            </AppText>
          </View>
          <AppText variant="label" color={q.done ? Colors.correct : Colors.accent}>
            +{q.reward} XP
          </AppText>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  timer: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 4 },
  doneText: { opacity: 0.7 },
  track: { height: 6, borderRadius: 3, backgroundColor: 'rgba(127,127,127,0.25)', overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
});
