import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import type { GroupDetail, UserSummary } from '@qu1z/shared';

import { BackButton } from '@/components/back-button';
import { PlayerPicker } from '@/components/group';
import { AppText, Button, Screen } from '@/components/ui';
import { Colors } from '@/constants/theme';
import { api, errorMessage, useApi } from '@/net/api';

/** Inviter des joueurs dans un groupe (créateur et administrateurs). */
export default function InviteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const group = useApi<GroupDetail>(`/api/groups/${id}`);
  const [selected, setSelected] = useState<UserSummary[]>([]);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const exclude = [...(group.data?.members.map((m) => m.user.id) ?? []), ...(group.data?.invitations.map((i) => i.invitee.id) ?? [])];

  const invite = async () => {
    setBusy(true);
    setMessage(null);
    const failed: string[] = [];
    let lastError = '';
    for (const u of selected) {
      try {
        await api('POST', `/api/groups/${id}/invitations`, { userId: u.id });
      } catch (e) {
        failed.push(u.pseudo);
        lastError = errorMessage(e);
      }
    }
    setBusy(false);
    if (failed.length) {
      setMessage({ ok: false, text: `Impossible d’inviter ${failed.join(', ')} : ${lastError}` });
      setSelected(selected.filter((u) => failed.includes(u.pseudo)));
    } else {
      router.back();
    }
  };

  return (
    <Screen>
      <BackButton />
      <AppText variant="title">Inviter dans « {group.data?.name ?? '…'} »</AppText>
      <PlayerPicker selected={selected} onChange={setSelected} exclude={exclude} />
      {message && <AppText color={message.ok ? Colors.correct : Colors.wrong}>{message.text}</AppText>}
      <Button
        label={busy ? 'Envoi…' : `Inviter${selected.length ? ` (${selected.length})` : ''}`}
        onPress={invite}
        disabled={!selected.length || busy}
      />
    </Screen>
  );
}
