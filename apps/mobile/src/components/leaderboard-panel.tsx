import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { countryFlag, countryName, type LeaderboardPeriod, type LeaderboardRow, type LeaderboardScope, type PublicProfile } from '@qu1z/shared';

import { DivisionBadge, Segmented } from '@/components/social';
import { AppText, Avatar } from '@/components/ui';
import { Colors, Radius, Shadow, Spacing } from '@/constants/theme';
import { useApi } from '@/net/api';
import { useGameServer } from '@/state/game-server';
import { avatarColor } from '@/utils/avatar';
import { Tap } from '@/components/tap';

/**
 * Classement réel par cote ou par XP de la saison (le mois en cours), général si `themeId` est absent :
 * Amis (joueurs suivis), Pays (choisi dans le profil) ou Monde.
 * `limit` réduit la liste (aperçu sur la page d'un thème).
 */
export function LeaderboardPanel({ themeId, limit }: { themeId?: string; limit?: number }) {
  const { playerId } = useGameServer();
  const [scope, setScope] = useState<LeaderboardScope>('world');
  const [period, setPeriod] = useState<LeaderboardPeriod>('rating');
  const me = useApi<PublicProfile>(playerId ? `/api/users/${playerId}` : null);
  const board = useApi<{ rows: LeaderboardRow[]; season?: { name: string } }>(
    playerId ? `/api/leaderboard?scope=${scope}&period=${period}${themeId ? `&theme=${themeId}` : ''}${limit ? `&limit=${limit}` : ''}` : null,
  );
  const rows = board.data?.rows ?? [];
  const country = me.data?.country ?? null;
  const noCountry = scope === 'country' && me.data && !country;

  return (
    <View style={{ gap: Spacing.sm }}>
      <Segmented
        value={period}
        onChange={setPeriod}
        options={[
          { value: 'rating', label: 'Cote' },
          { value: 'season', label: 'Saison' },
        ]}
      />
      {period === 'season' && board.data?.season && (
        <AppText variant="caption" muted>
          Saison {board.data.season.name} : XP gagnée ce mois-ci. Le podium final reçoit une médaille.
        </AppText>
      )}
      <Segmented
        value={scope}
        onChange={setScope}
        options={[
          { value: 'following', label: 'Amis' },
          { value: 'country', label: country ? `${countryFlag(country)} Pays` : 'Pays' },
          { value: 'world', label: 'Monde' },
        ]}
      />
      {noCountry ? (
        <Tap accessibilityRole="button" onPress={() => router.push('/settings/profile')} style={styles.notice}>
          <AppText muted style={{ flex: 1 }}>
            Choisis ton pays (facultatif) pour comparer ton score aux joueurs de ton pays.
          </AppText>
          <AppText variant="label" color={Colors.accent}>
            Choisir ›
          </AppText>
        </Tap>
      ) : (
        <>
          {board.data && rows.length > 0 && !rows.some((r) => r.isMe) && !limit && (
            <AppText variant="caption" muted>
              Joue un duel dans ce thème pour apparaître dans le classement.
            </AppText>
          )}
          {board.data && rows.length === 0 && (
            <AppText muted>
              {scope === 'country' ? `Personne n’est encore classé ici en ${countryName(country) ?? 'ton pays'}.` : 'Personne n’est encore classé ici.'}
            </AppText>
          )}
          {rows.map((row) => (
            <Tap
              key={row.user.id}
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/player/[id]', params: { id: row.user.id } })}
              style={[styles.row, row.isMe && styles.me]}>
              <AppText variant="heading" style={styles.rank} color={row.rank <= 3 ? Colors.gold : Colors.textMuted}>
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
                {period === 'season' ? ' XP' : ''}
              </AppText>
            </Tap>
          ))}
        </>
      )}
    </View>
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
  rank: { width: 32, textAlign: 'center' },
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
