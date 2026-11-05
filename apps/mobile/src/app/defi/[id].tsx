import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';

import { CHALLENGE_STATUS_LABEL, challengeLinks, getTheme, type ChallengeView } from '@qu1z/shared';

import { shareChallenge, useCountdown } from '@/components/challenge-card';
import { AppText, Avatar, Button, Card, Screen } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { api, errorMessage, useApi } from '@/net/api';
import { useGameServer } from '@/state/game-server';
import { avatarColor } from '@/utils/avatar';

/**
 * Page d'un défi, ouverte par le lien partagé (`qu1z://defi/{id}` dans l'application, ou `/defi/{id}` sur le site).
 * L'ami peut le relever ou le refuser ; l'invitant peut le partager ou l'annuler ; une fois terminé, les scores.
 */
export default function ChallengeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { playerId } = useGameServer();
  const c = useApi<ChallengeView>(playerId && id ? `/api/challenges/${id}` : null);
  const [message, setMessage] = useState<string | null>(null);
  const challenge = c.data;
  const left = useCountdown(challenge && (challenge.status === 'sent' || challenge.status === 'pending') ? challenge.expiresAt : null);

  const act = (path: string) => {
    setMessage(null);
    api('POST', path)
      .then(() => c.refresh())
      .catch((e) => setMessage(errorMessage(e)));
  };

  return (
    <Screen back title="Défi">
      {Platform.OS === 'web' && id && (
        <Card style={{ gap: Spacing.sm }}>
          <AppText variant="label">Tu as l’application Qu1z ?</AppText>
          <Button small label="Ouvrir dans l’application" color={Colors.accent} onPress={() => Linking.openURL(challengeLinks(String(id)).app).catch(() => {})} />
          <AppText variant="caption" muted>
            Sinon, tu peux relever le défi ici, directement dans ton navigateur.
          </AppText>
        </Card>
      )}
      {c.error && <AppText muted>Ce défi est introuvable, ou il ne t’est pas destiné.</AppText>}
      {challenge && <ChallengeDetails c={challenge} left={left} onAct={act} />}
      {message && <AppText color={Colors.wrong}>{message}</AppText>}
    </Screen>
  );
}

function ChallengeDetails({ c, left, onAct }: { c: ChallengeView; left: string | null; onAct: (path: string) => void }) {
  const theme = getTheme(c.themeId);
  const from = c.from;
  const to = c.to;
  return (
    <Card style={{ gap: Spacing.md }}>
      <AppText variant="caption" color={Colors.accent}>
        {(c.kind === 'rematch' ? 'Revanche' : 'Défi').toUpperCase()} · {theme?.name ?? ''}
      </AppText>
      <View style={styles.players}>
        <Side name={from.pseudo} id={from.id} avatar={from.avatar} score={c.fromScore} />
        <AppText variant="title">VS</AppText>
        <Side name={to.pseudo} id={to.id} avatar={to.avatar} score={c.toScore} />
      </View>
      <AppText variant="label" style={{ textAlign: 'center' }}>
        {CHALLENGE_STATUS_LABEL[c.status]}
        {left ? ` · encore ${left}` : ''}
      </AppText>
      <AppText muted style={{ textAlign: 'center' }}>
        {c.status === 'sent' && (c.incoming ? `${from.pseudo} joue sa partie.` : 'Termine ta partie pour envoyer le défi.')}
        {c.status === 'pending' &&
          (c.incoming
            ? `${from.pseudo} a joué ses 7 questions. À toi de jouer les mêmes !`
            : `${to.pseudo} a ${left ?? '24 h'} pour rejouer les mêmes questions.`)}
        {c.status === 'accepted' && `${to.pseudo} joue en ce moment.`}
        {c.status === 'completed' && resultLine(c)}
        {c.status === 'declined' && `${to.pseudo} a refusé le défi.`}
        {c.status === 'expired' && 'Le délai de 24 h est passé.'}
        {c.status === 'cancelled' && 'Ce défi a été annulé.'}
      </AppText>
      {c.incoming && c.status === 'pending' && (
        <View style={styles.actions}>
          <Button label="Refuser" variant="outline" color={Colors.textMuted} onPress={() => onAct(`/api/challenges/${c.id}/decline`)} style={{ flex: 1 }} />
          <Button label="Jouer" color={Colors.opponent} onPress={() => onAct(`/api/challenges/${c.id}/accept`)} style={{ flex: 1 }} />
        </View>
      )}
      {!c.incoming && c.status === 'pending' && (
        <View style={styles.actions}>
          <Button label="Annuler" variant="outline" color={Colors.textMuted} onPress={() => onAct(`/api/challenges/${c.id}/cancel`)} style={{ flex: 1 }} />
          <Button label="Partager" color={Colors.accent} onPress={() => shareChallenge(c)} style={{ flex: 1 }} />
        </View>
      )}
    </Card>
  );
}

function resultLine(c: ChallengeView): string {
  const me = c.incoming ? c.toScore : c.fromScore;
  const them = c.incoming ? c.fromScore : c.toScore;
  if (me === null || them === null) return 'Défi terminé.';
  return me > them ? `Victoire ${me} – ${them} !` : me < them ? `Défaite ${me} – ${them}.` : `Égalité ${me} – ${them}.`;
}

function Side({ name, id, avatar, score }: { name: string; id: string; avatar: string | null; score: number | null }) {
  return (
    <View style={styles.side}>
      <Avatar name={name} uri={avatar} color={avatarColor(id)} size={56} />
      <AppText variant="label" numberOfLines={1}>
        {name}
      </AppText>
      <AppText variant="score" style={{ fontSize: 26 }}>
        {score ?? '—'}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  players: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  side: { alignItems: 'center', gap: 4, flex: 1 },
  actions: { flexDirection: 'row', gap: Spacing.sm },
});
