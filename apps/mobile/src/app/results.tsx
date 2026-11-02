import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getTheme, levelFromXp, type DuelOutcome, type ParticipantView } from '@qu1z/shared';

import { Celebration, Crown, GOLD, ReplayButton, ResultBanner } from '@/components/results-art';
import { ThemeCover } from '@/components/theme-cover';
import { AppText, Avatar } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { questionImageSource } from '@/game/question-images';
import { api, errorMessage } from '@/net/api';
import { useGameServer } from '@/state/game-server';

const R = {
  bg: '#000000',
  text: '#FFFFFF',
  muted: '#A1A1AA',
  win: '#22C55E',
  winDark: '#15803D',
  winBg: '#04140A',
  loss: '#EF4444',
  lossDark: '#B91C1C',
  lossBg: '#160505',
  draw: '#F59E0B',
  line: '#2E2E33',
};

const BANNER: Record<DuelOutcome, { text: string; color: string; dark: string }> = {
  win: { text: 'VICTOIRE !', color: R.win, dark: R.winDark },
  loss: { text: 'PERDU !', color: R.loss, dark: R.lossDark },
  draw: { text: 'ÉGALITÉ !', color: R.draw, dark: '#B45309' },
};

export default function ResultsScreen() {
  const game = useGameServer();
  const duel = game.duel;
  const [details, setDetails] = useState(false);
  const [rematch, setRematch] = useState<string | null>(null);

  useEffect(() => {
    if (duel?.phase === 'finished' && duel.result) game.ackResult(duel.duelId);
    // Accusé de réception une seule fois par duel affiché.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duel?.duelId, duel?.result]);

  if (!duel || duel.phase !== 'finished' || !duel.result) return <Redirect href="/" />;
  const result = duel.result;
  const theme = getTheme(duel.themeId);
  const banner = BANNER[result.outcome];
  const level = levelFromXp(result.accountXpAfter);
  const record = result.record;

  const close = () => (router.canGoBack() ? router.dismissTo('/') : router.replace('/'));
  const replay = () => {
    const req = game.lastRequest?.themeId === duel.themeId ? game.lastRequest : null;
    const params: Record<string, string> = { themeId: duel.themeId };
    if (req?.mode === 'pvp') params.mode = 'pvp';
    router.replace({ pathname: '/duel/[themeId]', params: params as { themeId: string } });
  };
  const share = () =>
    Share.share({
      message: `${banner.text} ${duel.me.points} à ${duel.opponent.points} contre ${duel.opponent.name} en « ${theme?.name} » sur Qu1z. Viens me défier !`,
    }).catch(() => {});

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: Spacing.xl }} showsVerticalScrollIndicator={false}>
        <ThemeCover themeId={duel.themeId} height={300} fadeTo={R.bg}>
          <SafeAreaView edges={['top']} style={styles.coverContent}>
            <Pressable accessibilityRole="button" accessibilityLabel="Fermer" onPress={close} style={styles.close}>
              <Ionicons name="close" size={26} color={R.text} />
            </Pressable>
            <View style={styles.titles}>
              <AppText style={styles.title}>RÉSULTATS</AppText>
              <AppText style={styles.subtitle}>{theme?.name}</AppText>
            </View>
          </SafeAreaView>
        </ThemeCover>

        <View style={styles.body}>
          <Animated.View entering={ZoomIn.springify()} style={{ gap: Spacing.sm, marginTop: -Spacing.lg }}>
            <Celebration color={result.outcome === 'loss' ? '#71717A' : GOLD} />
            <ResultBanner {...banner} />
          </Animated.View>

          {/* Le joueur connecté est TOUJOURS à gauche : le serveur l'envoie comme « me ». */}
          <Animated.View entering={FadeInDown.delay(120).springify()} style={styles.players}>
            <PlayerCard player={duel.me} outcome={result.outcome} self />
            <View style={styles.vs}>
              <AppText style={styles.vsText}>VS</AppText>
            </View>
            <PlayerCard player={duel.opponent} outcome={result.outcome === 'win' ? 'loss' : result.outcome === 'loss' ? 'win' : 'draw'} />
          </Animated.View>

          {!result.finished && !result.forfeited && (
            <AppText variant="caption" color={R.muted} style={{ textAlign: 'center' }}>
              Tu n’étais plus connecté à la fin du duel : pas de bonus de fin ni de victoire.
            </AppText>
          )}
          {result.forfeited && (
            <AppText variant="caption" color={R.muted} style={{ textAlign: 'center' }}>
              Duel abandonné : aucun XP.
            </AppText>
          )}

          <Animated.View entering={FadeInDown.delay(220).springify()} style={styles.table}>
            <BonusRow icon="trophy" label="Bonus fin" value={result.rewards.finishBonus} />
            <BonusRow icon="star" label="Bonus victoire" value={result.rewards.victoryBonus} />
            <BonusRow icon="flash" label="Bonus boost" value={result.rewards.boostBonus} />
            <View style={[styles.row, styles.totalRow]}>
              <Ionicons name="layers" size={24} color={GOLD} style={styles.rowIcon} />
              <AppText style={[styles.rowLabel, { color: GOLD, fontWeight: '800' }]}>XP total</AppText>
              <AppText style={[styles.rowValue, { color: GOLD, fontSize: 26 }]}>{result.rewards.total}</AppText>
            </View>
          </Animated.View>

          <View style={{ gap: Spacing.sm }}>
            <View style={styles.levelRow}>
              <AppText style={styles.levelText}>Niveau {level.level}</AppText>
              <AppText style={styles.levelText}>
                {level.needed ? `${level.current} / ${level.needed}` : 'Niveau maximal'}
              </AppText>
            </View>
            <View style={styles.track} accessible accessibilityLabel={`Progression du niveau : ${Math.round(level.progress * 100)} %`}>
              <LinearGradient
                colors={['#FF6B35', '#FFD60A', '#FF3EA5', '#A855F7']}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={{ width: `${Math.max(2, level.progress * 100)}%`, height: '100%', borderRadius: 999 }}
              />
            </View>
          </View>

          <ReplayButton onPress={replay} />
          {!duel.opponent.isBot && (
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                api('POST', '/api/challenges', { userId: duel.opponent.id, themeId: duel.themeId, rematchOf: duel.duelId })
                  .then(() => setRematch(`Revanche proposée à ${duel.opponent.name}.`))
                  .catch((e) => setRematch(errorMessage(e)))
              }
              style={styles.rematch}>
              <AppText variant="label" color="#FF6B35">
                Proposer une revanche à {duel.opponent.name}
              </AppText>
            </Pressable>
          )}
          {rematch && (
            <AppText variant="caption" color={R.muted} style={{ textAlign: 'center' }}>
              {rematch}
            </AppText>
          )}

          <View style={styles.secondary}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Discuter avec l’adversaire"
              onPress={() => router.push({ pathname: '/chat/[duelId]', params: { duelId: duel.duelId } })}
              style={styles.secondaryButton}>
              <Ionicons name="chatbubble-ellipses" size={28} color={R.text} />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Partager le résultat" onPress={share} style={styles.secondaryButton}>
              <Ionicons name="share-social" size={28} color={R.text} />
            </Pressable>
          </View>

          <Pressable accessibilityRole="button" onPress={() => setDetails((d) => !d)} style={styles.detailsToggle}>
            <AppText variant="label" color={R.muted}>
              {details ? 'Masquer le détail des questions' : 'Voir le détail des questions'}
            </AppText>
            <Ionicons name={details ? 'chevron-up' : 'chevron-down'} size={18} color={R.muted} />
          </Pressable>
          {details &&
            record.questions.map((q, i) => {
              const mine = record.player[i];
              const theirs = record.opponent[i];
              return (
                <View key={q.id} style={styles.detail}>
                  <View style={{ flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' }}>
                    {questionImageSource(q.image) !== null && (
                      <Image source={questionImageSource(q.image)!} contentFit="cover" style={styles.thumb} accessibilityLabel="Illustration" />
                    )}
                    <AppText variant="caption" color={R.muted} style={{ flex: 1 }}>
                      {i + 1}. {q.text}
                    </AppText>
                  </View>
                  <AppText variant="label" color={R.win}>
                    {q.choices[q.correctIndex]}
                  </AppText>
                  <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                    <Pill label="Toi" correct={mine.correct} points={mine.points} ms={mine.responseMs} answered={mine.choice !== null} />
                    <Pill label={record.opponentName} correct={theirs.correct} points={theirs.points} ms={theirs.responseMs} answered={theirs.choice !== null} />
                  </View>
                </View>
              );
            })}
        </View>
      </ScrollView>
    </View>
  );
}

function PlayerCard({ player, outcome, self }: { player: ParticipantView; outcome: DuelOutcome; self?: boolean }) {
  const color = outcome === 'win' ? R.win : outcome === 'loss' ? R.loss : R.draw;
  const bg = outcome === 'win' ? R.winBg : outcome === 'loss' ? R.lossBg : '#141006';
  return (
    <View style={styles.cardSlot}>
      <View style={styles.crown}>{outcome === 'win' && <Crown />}</View>
      <View style={[styles.card, { borderColor: color, backgroundColor: bg }]}>
        <AppText style={styles.cardName} numberOfLines={1}>
          {player.name}
        </AppText>
        <View style={[styles.ring, { borderColor: color }]}>
          <Avatar name={player.name} color={self ? Colors.player : (player.color ?? Colors.opponent)} size={76} />
        </View>
        <AppText style={[styles.cardScore, { color }]}>{player.points}</AppText>
      </View>
    </View>
  );
}

function BonusRow({ icon, label, value }: { icon: 'trophy' | 'star' | 'flash'; label: string; value: number }) {
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={24} color={R.text} style={styles.rowIcon} />
      <AppText style={styles.rowLabel}>{label}</AppText>
      <AppText style={styles.rowValue}>+{value}</AppText>
    </View>
  );
}

function Pill({ label, correct, points, ms, answered }: { label: string; correct: boolean; points: number; ms: number; answered: boolean }) {
  return (
    <View style={[styles.pill, { borderColor: correct ? R.win : R.loss }]}>
      <AppText variant="caption" color={R.text} numberOfLines={1} style={{ flex: 1 }}>
        {label}
      </AppText>
      <AppText variant="caption" color={R.text}>
        {points} pts · {answered ? `${(ms / 1000).toFixed(1)} s` : '—'}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: R.bg },
  coverContent: { flex: 1 },
  close: {
    position: 'absolute',
    right: 16,
    top: 12,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  titles: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 40, gap: 2 },
  title: { color: R.text, fontSize: 30, fontWeight: '900', letterSpacing: 1 },
  subtitle: { color: '#E4E4E7', fontSize: 18, fontWeight: '600' },
  body: { width: '100%', maxWidth: 480, alignSelf: 'center', paddingHorizontal: 20, gap: Spacing.lg },
  players: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  cardSlot: { flex: 1, alignItems: 'center' },
  crown: { height: 22, justifyContent: 'flex-end' },
  card: { alignSelf: 'stretch', borderWidth: 2, borderRadius: 6, paddingVertical: 12, paddingHorizontal: 8, alignItems: 'center', gap: 8 },
  cardName: { color: R.text, fontSize: 16, fontWeight: '700' },
  ring: { borderWidth: 4, borderRadius: 50, padding: 3 },
  cardScore: { fontSize: 36, fontWeight: '900', fontVariant: ['tabular-nums'] },
  vs: {
    position: 'absolute',
    left: '50%',
    top: '52%',
    transform: [{ translateX: -24 }, { translateY: -18 }],
    width: 48,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#000000',
    borderWidth: 2,
    borderColor: '#FF6B35',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  vsText: { color: '#FFFFFF', fontWeight: '900', fontStyle: 'italic', fontSize: 18 },
  table: { borderWidth: 1, borderColor: '#3F3F46', borderRadius: 4, overflow: 'hidden', backgroundColor: R.bg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 54,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: R.line,
  },
  totalRow: { backgroundColor: '#241C02', borderBottomWidth: 0 },
  rowIcon: { width: 40 },
  rowLabel: { flex: 1, color: R.text, fontSize: 17 },
  rowValue: { color: R.text, fontSize: 22, fontWeight: '800', fontVariant: ['tabular-nums'] },
  levelRow: { flexDirection: 'row', justifyContent: 'space-between' },
  levelText: { color: R.text, fontSize: 17, fontWeight: '800' },
  track: { height: 16, borderRadius: 999, backgroundColor: '#2A2A2E', overflow: 'hidden' },
  secondary: { flexDirection: 'row', gap: 12 },
  rematch: { alignItems: 'center', justifyContent: 'center', minHeight: 44, borderWidth: 1.5, borderColor: '#FF6B35', borderRadius: 10 },
  secondaryButton: { flex: 1, height: 54, borderRadius: 10, backgroundColor: '#111113', alignItems: 'center', justifyContent: 'center' },
  detailsToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: Spacing.sm },
  detail: { borderTopWidth: 1, borderTopColor: R.line, paddingTop: Spacing.sm, gap: 6 },
  thumb: { width: 54, height: 36, borderRadius: 6 },
  pill: { flex: 1, flexDirection: 'row', gap: 6, borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
});
