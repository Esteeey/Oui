import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { NEARBY_KM, countryFlag, countryName, type LeaderboardPeriod, type LeaderboardRow, type LeaderboardScope, type PublicProfile } from '@qu1z/shared';

import { useCountdown } from '@/components/challenge-card';
import { Chip, DivisionBadge, Segmented } from '@/components/social';
import { AppText, Avatar } from '@/components/ui';
import { Colors, Radius, Shadow, Spacing } from '@/constants/theme';
import { useApi } from '@/net/api';
import { shareApproxLocation } from '@/net/location';
import { useGameServer } from '@/state/game-server';
import { avatarColor } from '@/utils/avatar';
import { Tap } from '@/components/tap';

type Board = { rows: LeaderboardRow[]; me: LeaderboardRow | null; season?: { name: string }; week?: { startsAt: number; endsAt: number } };

/**
 * Classement réel, général si `themeId` est absent : XP gagnée cette semaine (remise à zéro le lundi à 00:00 UTC),
 * XP de la saison (le mois en cours) ou cote. Filtres : Amis, Pays, Région, À proximité, Monde.
 * Ma position est toujours affichée, même hors du haut du classement. `limit` réduit la liste (aperçu d'un thème).
 */
export function LeaderboardPanel({ themeId, limit }: { themeId?: string; limit?: number }) {
  const { playerId } = useGameServer();
  const [scope, setScope] = useState<LeaderboardScope>('world');
  const [period, setPeriod] = useState<LeaderboardPeriod>('week');
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const me = useApi<PublicProfile>(playerId ? `/api/users/${playerId}` : null);
  const board = useApi<Board>(
    playerId ? `/api/leaderboard?scope=${scope}&period=${period}${themeId ? `&theme=${themeId}` : ''}${limit ? `&limit=${limit}` : ''}` : null,
  );
  const weekLeft = useCountdown(period === 'week' ? (board.data?.week?.endsAt ?? null) : null);
  const rows = board.data?.rows ?? [];
  const myRow = board.data?.me ?? null;
  const country = me.data?.country ?? null;
  const region = me.data?.region ?? null;
  const xpPeriod = period !== 'rating';

  // Filtre impossible tant que le joueur n'a pas choisi son pays, sa région ou partagé sa position.
  const missing =
    me.data && scope === 'country' && !country
      ? 'country'
      : me.data && scope === 'region' && !region
        ? 'region'
        : me.data && scope === 'nearby' && !me.data.hasLocation
          ? 'location'
          : null;

  const locate = async () => {
    setLocating(true);
    setLocationError(await shareApproxLocation());
    setLocating(false);
    me.refresh();
    board.refresh();
  };

  return (
    <View style={{ gap: Spacing.sm }}>
      <Segmented
        value={period}
        onChange={setPeriod}
        options={[
          { value: 'week', label: 'Semaine' },
          { value: 'season', label: 'Saison' },
          { value: 'rating', label: 'Cote' },
        ]}
      />
      {period === 'week' && board.data?.week && (
        <AppText variant="caption" muted>
          XP gagnée cette semaine. Remise à zéro lundi à 00:00 UTC{weekLeft ? `, dans ${weekLeft}` : ''}.
        </AppText>
      )}
      {period === 'season' && board.data?.season && (
        <AppText variant="caption" muted>
          Saison {board.data.season.name} : XP gagnée ce mois-ci. Le podium final reçoit une médaille.
        </AppText>
      )}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: Spacing.sm }}>
        {(
          [
            ['following', 'Amis'],
            ['country', country ? `${countryFlag(country)} Pays` : 'Pays'],
            ['region', 'Région'],
            ['nearby', 'À proximité'],
            ['world', 'Monde'],
          ] as [LeaderboardScope, string][]
        ).map(([value, label]) => (
          <Chip key={value} label={label} active={scope === value} onPress={() => setScope(value)} />
        ))}
      </ScrollView>
      {missing === 'location' ? (
        <View style={styles.notice}>
          <View style={{ flex: 1, gap: 4 }}>
            <AppText muted>
              Partage ta position approximative (à 10 km près, jamais exacte) pour voir les joueurs à moins de {NEARBY_KM} km.
            </AppText>
            {locationError && <AppText color={Colors.wrong}>{locationError}</AppText>}
          </View>
          <Tap accessibilityRole="button" disabled={locating} onPress={locate}>
            <AppText variant="label" color={Colors.accent}>
              {locating ? '…' : 'Activer ›'}
            </AppText>
          </Tap>
        </View>
      ) : missing ? (
        <Tap accessibilityRole="button" onPress={() => router.push('/settings/profile')} style={styles.notice}>
          <AppText muted style={{ flex: 1 }}>
            {missing === 'country'
              ? 'Choisis ton pays (facultatif) pour comparer ton score aux joueurs de ton pays.'
              : 'Choisis ta région (facultatif) pour comparer ton score aux joueurs de ta région.'}
          </AppText>
          <AppText variant="label" color={Colors.accent}>
            Choisir ›
          </AppText>
        </Tap>
      ) : (
        <>
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
              <AppText muted style={{ textAlign: 'center' }}>
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
      <AppText variant="heading" style={styles.rank} color={row.rank <= 3 ? Colors.gold : Colors.textMuted} numberOfLines={1} adjustsFontSizeToFit>
        {row.rank}
      </AppText>
      <Avatar name={row.user.pseudo} color={avatarColor(row.user.id)} uri={row.user.avatar} size={40} />
      <View style={{ flex: 1, gap: 4 }}>
        <AppText variant="label" numberOfLines={1}>
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
    gap: Spacing.sm + 4,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.sm + 4,
    ...Shadow,
  },
  me: { borderColor: Colors.accent, borderWidth: 2 },
  rank: { width: 40, textAlign: 'center' },
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
