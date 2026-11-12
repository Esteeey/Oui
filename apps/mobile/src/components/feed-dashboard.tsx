import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { CATEGORIES, getTheme, levelFromXp, type ActivityView, type ChallengeView, type DuelRecord, type ThemeStats } from '@qu1z/shared';

import { ThemeIcon } from '@/components/theme-icon';
import { Tap } from '@/components/tap';
import { AppText, Avatar } from '@/components/ui';
import { Colors } from '@/constants/theme';
import { avatarColor } from '@/utils/avatar';
import { timeAgo } from '@/utils/time';

const categoryColor = (themeId: string) => CATEGORIES.find((c) => c.id === getTheme(themeId)?.categoryId)?.color ?? '#7B2FFF';

/** En haut du fil : les défis qui t'attendent, sinon une invitation à jouer. */
export function WaitingHero({ challenges }: { challenges: ChallengeView[] }) {
  const waiting = challenges.filter((c) => c.incoming && c.status === 'pending');
  const names = [...new Set(waiting.map((c) => c.from.pseudo))].slice(0, 3).join(' · ');
  const open = () => (waiting[0] ? router.push(`/defi/${waiting[0].id}` as Href) : router.navigate('/play'));
  return (
    <Tap accessibilityRole="button" onPress={open} style={styles.hero}>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText style={styles.heroKicker}>À toi de jouer</AppText>
        <AppText style={styles.heroTitle}>
          {waiting.length ? `${waiting.length} défi${waiting.length > 1 ? 's t’attendent' : ' t’attend'}` : 'Lance un duel'}
        </AppText>
        <AppText numberOfLines={1} style={styles.heroSub}>{waiting.length ? names : 'Un adversaire t’attend dans tes thèmes préférés'}</AppText>
      </View>
      <View style={styles.heroGo}>
        <AppText style={styles.heroGoText}>Jouer</AppText>
      </View>
    </Tap>
  );
}

/** Trois chiffres : série de victoires en cours, taux de victoire, meilleur niveau de thème. */
export function Kpis({ history, stats }: { history: DuelRecord[]; stats: Record<string, ThemeStats> }) {
  let streak = 0;
  for (const d of history) {
    if (d.outcome !== 'win') break;
    streak++;
  }
  const all = Object.values(stats);
  const duels = all.reduce((t, s) => t + s.duels, 0);
  const wins = all.reduce((t, s) => t + s.wins, 0);
  const best = Object.entries(stats).filter(([id]) => getTheme(id)).sort((a, b) => b[1].xp - a[1].xp)[0];
  const items: [string, string][] = [
    [`🔥 ${streak}`, streak > 1 ? 'victoires d’affilée' : 'victoire d’affilée'],
    [duels ? `${Math.round((wins / duels) * 100)} %` : '–', 'de victoires'],
    [best ? `Niv. ${levelFromXp(best[1].xp).level}` : '–', best ? (getTheme(best[0])?.name ?? 'meilleur thème') : 'meilleur thème'],
  ];
  return (
    <View style={styles.kpis}>
      {items.map(([value, label]) => (
        <View key={label} style={styles.kpi}>
          <AppText style={styles.kpiValue}>{value}</AppText>
          <AppText numberOfLines={1} style={styles.kpiLabel}>{label}</AppText>
        </View>
      ))}
    </View>
  );
}

/** Temps forts des amis : niveaux franchis et sans-fautes, en cartes colorées. */
export function Highlights({ items }: { items: ActivityView[] }) {
  if (!items.length) return null;
  return (
    <View style={styles.section}>
      <AppText style={styles.h2}>Temps forts de tes amis</AppText>
      {items.map((a) => (
        <Tap
          key={a.id}
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/player/[id]', params: { id: a.user.id } })}
          style={[styles.highlight, { backgroundColor: categoryColor(a.themeId) }]}>
          <ThemeIcon themeId={a.themeId} size={48} />
          <View style={{ flex: 1 }}>
            <AppText style={styles.hlKicker}>{a.event.kind === 'level' ? 'Niveau' : 'Sans-faute'}</AppText>
            <AppText style={styles.hlTitle}>
              {a.user.pseudo} {a.event.kind === 'level' ? `passe niveau ${a.event.level}` : 'réussit un sans-faute'}
            </AppText>
            <AppText style={styles.hlSub}>{getTheme(a.themeId)?.name} · {timeAgo(a.createdAt)}</AppText>
          </View>
        </Tap>
      ))}
    </View>
  );
}

type DuelLine = { key: string; record: DuelRecord; count: number; wins: number };

/** Regroupe les duels d'entraînement d'affilée dans le même thème en une seule ligne. */
function group(history: DuelRecord[]): DuelLine[] {
  const lines: DuelLine[] = [];
  for (const d of history) {
    const last = lines[lines.length - 1];
    if (last && d.opponentIsBot && last.record.opponentIsBot && last.record.themeId === d.themeId) {
      last.count++;
      if (d.outcome === 'win') last.wins++;
      continue;
    }
    lines.push({ key: d.id, record: d, count: 1, wins: d.outcome === 'win' ? 1 : 0 });
  }
  return lines;
}

/** Derniers duels : une ligne compacte chacun, Revanche sur une défaite contre un joueur. */
export function RecentDuels({ history }: { history: DuelRecord[] }) {
  // Les duels d'un thème supprimé depuis sont ignorés.
  const lines = group(history.slice(0, 30).filter((d) => getTheme(d.themeId))).slice(0, 5);
  if (!lines.length) return null;
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <AppText style={styles.h2}>Derniers duels</AppText>
        <Tap accessibilityRole="button" onPress={() => router.push('/duels')}>
          <AppText style={styles.link}>Tout voir</AppText>
        </Tap>
      </View>
      {lines.map(({ key, record: d, count, wins }) => {
        const theme = getTheme(d.themeId);
        if (count > 1) {
          return (
            <Tap key={key} accessibilityRole="button" onPress={() => router.push('/duels')} style={[styles.row, styles.grouped]}>
              <ThemeIcon themeId={d.themeId} size={40} />
              <View style={styles.rowText}>
                <AppText style={styles.rowTitle}>{count} duels d’entraînement</AppText>
                <AppText style={styles.rowSub}>{theme?.name} · {wins} V – {count - wins} D</AppText>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
            </Tap>
          );
        }
        const tone = d.outcome === 'win' ? styles.win : d.outcome === 'loss' ? styles.loss : styles.draw;
        const toneText = d.outcome === 'win' ? styles.winText : d.outcome === 'loss' ? styles.lossText : styles.drawText;
        return (
          <Tap
            key={key}
            accessibilityRole="button"
            disabled={!d.opponentId}
            onPress={() => d.opponentId && router.push({ pathname: '/player/[id]', params: { id: d.opponentId } })}
            style={styles.row}>
            <Avatar name={d.opponentName} color={avatarColor(d.opponentId ?? d.opponentName)} size={40} uri={d.opponentAvatar} />
            <View style={styles.rowText}>
              <AppText numberOfLines={1} style={styles.rowTitle}>
                {d.outcome === 'win' ? `Tu as battu ${d.opponentName}` : d.outcome === 'loss' ? `${d.opponentName} t’a battu` : `Égalité avec ${d.opponentName}`}
              </AppText>
              <AppText numberOfLines={1} style={styles.rowSub}>{theme?.name} · {timeAgo(d.playedAt)}</AppText>
            </View>
            {d.outcome === 'loss' && d.opponentId ? (
              <View style={styles.rematch}>
                <AppText style={styles.rematchText}>Revanche</AppText>
              </View>
            ) : (
              <View style={[styles.score, tone]}>
                <AppText style={[styles.scoreText, toneText]}>{d.outcome === 'win' ? 'Victoire' : d.outcome === 'loss' ? 'Défaite' : 'Égalité'}</AppText>
              </View>
            )}
          </Tap>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: '#FF007A', borderRadius: 22, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroKicker: { color: '#FFE27A', fontSize: 11, fontWeight: '700' },
  heroTitle: { color: '#FFFFFF', fontSize: 19, lineHeight: 25, fontWeight: '800' },
  heroSub: { color: '#FFFFFF', fontSize: 12, opacity: 0.9 },
  heroGo: { backgroundColor: '#FFFFFF', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 10 },
  heroGoText: { color: '#FF007A', fontWeight: '800', fontSize: 14 },
  kpis: { flexDirection: 'row', gap: 8 },
  kpi: { flex: 1, backgroundColor: Colors.surface, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 6, alignItems: 'center', gap: 2 },
  kpiValue: { fontSize: 17, lineHeight: 22, fontWeight: '800', color: Colors.text },
  kpiLabel: { fontSize: 10.5, color: Colors.textMuted, maxWidth: '100%' },
  section: { gap: 8 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  h2: { fontSize: 16, lineHeight: 22, fontWeight: '800', color: Colors.text, marginTop: 4 },
  link: { color: Colors.accentInk, fontWeight: '700', fontSize: 13 },
  highlight: { borderRadius: 20, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  hlKicker: { color: '#FFE27A', fontSize: 10.5, fontWeight: '700' },
  hlTitle: { color: '#FFFFFF', fontSize: 14, lineHeight: 19, fontWeight: '800' },
  hlSub: { color: '#FFFFFF', fontSize: 11.5, opacity: 0.9 },
  row: { backgroundColor: Colors.surface, borderRadius: 18, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  grouped: { backgroundColor: Colors.surfaceRaised },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 13.5, lineHeight: 18, fontWeight: '700', color: Colors.text },
  rowSub: { fontSize: 11.5, color: Colors.textMuted },
  score: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
  scoreText: { fontSize: 13, fontWeight: '800' },
  win: { backgroundColor: '#DDFBF1' },
  loss: { backgroundColor: '#FFE1E8' },
  draw: { backgroundColor: '#FFF3D6' },
  winText: { color: '#047857' },
  lossText: { color: '#BE123C' },
  drawText: { color: '#92400E' },
  rematch: { backgroundColor: '#FF007A', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
  rematchText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
});
