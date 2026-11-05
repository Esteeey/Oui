import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';

import { CHALLENGE_STATUS_LABEL, challengeLinks, getTheme, type ChallengeView } from '@qu1z/shared';

import { UserRow } from '@/components/player-row';
import { AppText, Button, Card } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { api, errorMessage, useApi } from '@/net/api';
import { useGameServer } from '@/state/game-server';

/** Temps restant jusqu'à `target` (ms), à la minute près : « 12 h 03 min », « 4 min », mis à jour toutes les 30 s. */
export function useCountdown(target: number | null): string | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (target === null) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [target]);
  if (target === null) return null;
  return formatRemaining(target - now);
}

export function formatRemaining(ms: number): string {
  if (ms <= 0) return '0 min';
  const minutes = Math.ceil(ms / 60_000);
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = minutes % 60;
  if (d > 0) return `${d} j ${h} h`;
  if (h > 0) return `${h} h ${String(m).padStart(2, '0')} min`;
  return `${m} min`;
}

/** Partage le lien d'un défi : lien profond (ouvre l'application) et lien web (site ou page d'installation). */
export function shareChallenge(c: Pick<ChallengeView, 'id' | 'themeId'>, from?: string): void {
  const links = challengeLinks(c.id);
  const theme = getTheme(c.themeId)?.name ?? 'Qu1z';
  Share.share({
    message: [`${from ? `${from} te défie` : 'Je te défie'} en ${theme} sur Qu1z !`, `Ouvrir le défi : ${links.app}`, `Pas encore l'appli ? ${links.web}`].join('\n'),
  }).catch(() => {});
}

/**
 * Ligne de défi : adversaire, thème, statut (envoyé, en attente, accepté, terminé, refusé, expiré),
 * temps restant ou scores, et les actions possibles (jouer, refuser, partager, voir).
 */
export function ChallengeRow({ c, onChanged, onMessage }: { c: ChallengeView; onChanged?: () => void; onMessage?: (ok: boolean, text: string) => void }) {
  const other = c.incoming ? c.from : c.to;
  const open = c.status === 'sent' || c.status === 'pending';
  const left = useCountdown(open ? c.expiresAt : null);
  const theme = getTheme(c.themeId)?.name ?? '';
  const act = (path: string) =>
    api('POST', path)
      .then(() => onChanged?.())
      .catch((e) => onMessage?.(false, errorMessage(e)));

  const detail =
    c.status === 'completed'
      ? `${c.incoming ? c.toScore : c.fromScore} – ${c.incoming ? c.fromScore : c.toScore}`
      : c.status === 'pending' && !c.incoming
        ? `ton score : ${c.fromScore ?? 0} · ${left} pour répondre`
        : open
          ? `${left} pour répondre`
          : null;
  const subtitle = [c.kind === 'rematch' ? 'Revanche' : 'Défi', theme, CHALLENGE_STATUS_LABEL[c.status], detail].filter(Boolean).join(' · ');

  let right = <Button small label="Voir" variant="outline" color={Colors.textMuted} onPress={() => router.push(`/defi/${c.id}` as Href)} />;
  if (c.incoming && c.status === 'pending') {
    right = (
      <View style={styles.actions}>
        <Button small label="Refuser" variant="outline" color={Colors.textMuted} onPress={() => act(`/api/challenges/${c.id}/decline`)} />
        <Button small label="Jouer" color={Colors.opponent} onPress={() => act(`/api/challenges/${c.id}/accept`)} />
      </View>
    );
  } else if (!c.incoming && c.status === 'pending') {
    right = <Button small label="Partager" variant="outline" color={Colors.textMuted} onPress={() => shareChallenge(c)} />;
  }
  return <UserRow user={other} subtitle={subtitle} right={right} />;
}

/** Carte « Défis reçus » de l'accueil : les défis à relever, avec le temps restant. Rien si aucun. */
export function ReceivedChallengesCard() {
  const { playerId } = useGameServer();
  const challenges = useApi<{ challenges: ChallengeView[] }>(playerId ? '/api/challenges' : null);
  const [message, setMessage] = useState<string | null>(null);
  const received = (challenges.data?.challenges ?? []).filter((c) => c.incoming && c.status === 'pending');
  if (received.length === 0) return null;
  return (
    <Card style={styles.card}>
      <AppText variant="heading" style={{ fontSize: 17 }}>
        Défis reçus · {received.length}
      </AppText>
      {received.slice(0, 3).map((c) => (
        <ChallengeRow key={c.id} c={c} onChanged={challenges.refresh} onMessage={(_, text) => setMessage(text)} />
      ))}
      {received.length > 3 && <Button small label="Tous les défis" variant="outline" color={Colors.textMuted} onPress={() => router.push('/play')} />}
      {message && <AppText color={Colors.wrong}>{message}</AppText>}
    </Card>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: Spacing.sm },
  card: { gap: Spacing.sm },
});
