import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { countryFlag, countryName, type LeaderboardPeriod, type LeaderboardRow, type LeaderboardScope, type PublicProfile } from '@qu1z/shared';

import { useCountdown } from '@/components/challenge-card';
import { Chip, DivisionBadge, Segmented } from '@/components/social';
import { AppText, Avatar, LoadingState } from '@/components/ui';
import { Colors, Radius, Shadow, Spacing } from '@/constants/theme';
import { useApi } from '@/net/api';
import { useGameServer } from '@/state/game-server';
import { avatarColor } from '@/utils/avatar';
import { Tap } from '@/components/tap';

type Board = { rows: LeaderboardRow[]; me: LeaderboardRow | null; season?: { name: string }; week?: { startsAt: number; endsAt: number } };

/**
 * Classement réel, général si `themeId` est absent : XP gagnée cette semaine (remise à zéro le lundi à 00:00 UTC),
 * XP de la saison (le mois en cours) ou cote. Filtres : Amis, Pays, Monde.
 * Ma position est toujours affichée, même hors du haut du classement. `limit` réduit la liste (aperçu d'un thème).
 */
export function LeaderboardPanel({ themeId, limit }: { themeId?: string; limit?: number }) {
  const { playerId } = useGameServer();
  const [scope, setScope] = useState<LeaderboardScope>('world');
  const [period, setPeriod] = useState<LeaderboardPeriod>('week');
  const me = useApi<PublicProfile>(playerId ? `/api/users/${playerId}` : null);
  const board = useApi<Board>(
    playerId ? `/api/leaderboard?scope=${scope}&period=${period}${themeId ? `&theme=${themeId}` : ''}${limit ? `&limit=${limit}` : ''}` : null,
  );
  const weekLeft = useCountdown(period === 'week' ? (board.data?.week?.endsAt ?? null) : null);
  const rows = board.data?.rows ?? [];
  const myRow = board.data?.me ?? null;
  const country = me.data?.country ?? null;
  const xpPeriod = period !== 'rating';

  // Filtre impossible tant que le joueur n'a pas choisi son pays.
  const missing = !!me.data && scope === 'country' && !country;

  return (
    <View style={{ gap: 5 }}>
      <Segmented
        compact
        value={period}
        onChange={setPeriod}
        options={[
          { value: 'week', label: 'Semaine' },
          { value: 'season', label: 'Saison' },
          { value: 'rating', label: 'Cote' },
        ]}
      />
      {period === 'week' && board.data?.week && (
        <AppText variant="caption" muted style={{ fontSize: 11, lineHeight: 15 }}>
          XP gagnée cette semaine. Remise à zéro lundi à 00:00 UTC{weekLeft ? `, dans ${weekLeft}` : ''}.
        </AppText>
      )}
      {period === 'season' && board.data?.season && (
        <AppText variant="caption" muted style={{ fontSize: 11, lineHeight: 15 }}>
          Saison {board.data.season.name} : XP gagnée ce mois-ci. Le podium final reçoit une médaille.
        </AppText>
      )}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 5 }}>
        {(
          [
            ['following', 'Amis'],
            ['country', country ? `${countryFlag(country)} Pays` : 'Pays'],
            ['world', 'Monde'],
          ] as [LeaderboardScope, string][]
        ).map(([value, label]) => (
          <Chip key={value} label={label} active={scope === value} onPress={() => setScope(value)} style={styles.compactChip} />
        ))}
      </ScrollView>
      {missing ? (
        <Tap accessibilityRole="button" onPress={() => router.push('/settings/profile')} style={styles.notice}>
          <AppText muted style={{ flex: 1 }}>
            Choisis ton pays (facultatif) pour comparer ton score aux joueurs de ton pays.
          </AppText>
          <AppText variant="label" color={Colors.accentInk}>
            Choisir ›
          </AppText>
        </Tap>
      ) : (
        <>
          <LoadingState visible={board.loading && !board.data} label="Chargement du classement" />
          {board.data && rows.length === 0 && (
            <AppText muted>
              {scope === 'country'
                ? `Personne n’est encore classé ici en ${countryName(country) ?? 'ton pays'}.`
                : xpPeriod
                  ? 'Personne n’a encore gagné d’XP sur cette période.'
                  : 'Personne n’est encore classé ici.'}
            </AppText>
          )}
          {rows.map((row) => (
            <RankRow key={row.user.id} row={row} period={period} />
          ))}
          {/* Ma position, même au-delà du haut du classement. */}
          {myRow && !rows.some((r) => r.isMe) && (
            <>
              <AppText muted style={{ textAlign: 'center', fontSize: 12, lineHeight: 16 }}>
                ⋯
              </AppText>
              <RankRow row={myRow} period={period} />
            </>
          )}
          {board.data && !myRow && !limit && (
            <AppText variant="caption" muted>
              {xpPeriod ? 'Joue un duel pour apparaître dans le classement de cette période.' : 'Joue un duel dans ce thème pour apparaître dans le classement.'}
            </AppText>
          )}
        </>
      )}
    </View>
  );
}

function RankRow({ row, period }: { row: LeaderboardRow; period: LeaderboardPeriod }) {
  return (
    <Tap
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/player/[id]', params: { id: row.user.id } })}
      style={[styles.row, row.isMe && styles.me]}>
      <AppText variant="heading" style={styles.rank} color={row.rank <= 3 ? Colors.goldInk : Colors.textMuted} numberOfLines={1} adjustsFontSizeToFit>
        {row.rank}
      </AppText>
      <Avatar name={row.user.pseudo} color={avatarColor(row.user.id)} uri={row.user.avatar} size={32} />
      <View style={{ flex: 1, gap: 1 }}>
        <AppText variant="label" numberOfLines={1} style={{ fontSize: 14, lineHeight: 18 }}>
          {row.user.pseudo}
          {row.isMe ? ' (toi)' : ''}
        </AppText>
        {period === 'rating' && <DivisionBadge rating={row.rating} compact />}
      </View>
      <AppText variant="heading" style={{ fontVariant: ['tabular-nums'] }}>
        {row.rating}
        {period !== 'rating' ? ' XP' : ''}
      </AppText>
    </Tap>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: Colors.surface,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
    ...Shadow,
  },
  me: { borderColor: Colors.accent, borderWidth: 2 },
  rank: { width: 26, textAlign: 'center', fontSize: 16, lineHeight: 20 },
  compactChip: { paddingHorizontal: 11, paddingVertical: 6 },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    ...Shadow,
  },
});
