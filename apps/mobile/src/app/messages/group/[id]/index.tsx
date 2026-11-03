import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { groupRights, MAX_GROUP_NAME_LENGTH, type GroupDetail, type GroupMemberView, type MediaView } from '@qu1z/shared';

import { BackButton } from '@/components/back-button';
import { GroupAvatar, RoleBadge } from '@/components/group';
import { ReportSheet } from '@/components/report-sheet';
import { SectionHeader } from '@/components/social';
import { AppText, Avatar, Button, Card, Screen } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { api, errorMessage, useApi } from '@/net/api';
import { pickImage, uploadImage } from '@/net/media';
import { useGameServer } from '@/state/game-server';
import { avatarColor } from '@/utils/avatar';

type Confirm = { title: string; text: string; label: string; color: string; run: () => Promise<unknown> } | null;

/** Infos du groupe : photo, nom, participants et rôles, invitations, exclusions, départ, suppression. */
export default function GroupInfoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { playerId } = useGameServer();
  const group = useApi<GroupDetail>(`/api/groups/${id}`);
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [transferring, setTransferring] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const g = group.data;
  const rights = groupRights(g?.myRole ?? 'member');

  useEffect(() => {
    if (g) setName(g.name);
  }, [g?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setMessage(null);
    try {
      await fn();
      if (ok) setMessage({ ok: true, text: ok });
      return true;
    } catch (e) {
      setMessage({ ok: false, text: errorMessage(e) });
      return false;
    }
  };

  if (group.error) {
    return (
      <Screen>
        <BackButton />
        <AppText muted>Ce groupe n’est plus disponible.</AppText>
      </Screen>
    );
  }

  const changePhoto = () =>
    run(async () => {
      const picked = await pickImage('library', { square: true });
      if (!picked) return;
      const media = await uploadImage<MediaView>(picked, '/api/media?purpose=group');
      await api('PATCH', `/api/groups/${id}`, { avatarMediaId: media.id });
    });

  const memberActions = (m: GroupMemberView) => {
    const actions: { label: string; color?: string; onPress: () => void }[] = [];
    const who = m.user.pseudo;
    if (rights.manageAdmins && m.role !== 'creator') {
      actions.push(
        m.role === 'admin'
          ? { label: 'Retirer les droits d’admin', onPress: () => run(() => api('PUT', `/api/groups/${id}/members/${m.user.id}/role`, { role: 'member' })) }
          : { label: 'Nommer administrateur', onPress: () => run(() => api('PUT', `/api/groups/${id}/members/${m.user.id}/role`, { role: 'admin' })) },
      );
    }
    if (rights.canRemove(m.role)) {
      actions.push({
        label: 'Retirer du groupe',
        color: Colors.wrong,
        onPress: () =>
          setConfirm({
            title: `Retirer ${who} ?`,
            text: `${who} quittera le groupe. Il pourra être réinvité plus tard.`,
            label: 'Retirer',
            color: Colors.wrong,
            run: () => api('DELETE', `/api/groups/${id}/members/${m.user.id}`),
          }),
      });
      for (const [label, hours] of [
        ['Exclure 24 h', 24],
        ['Exclure 7 jours', 24 * 7],
        ['Exclure définitivement', null],
      ] as const) {
        actions.push({
          label,
          color: Colors.wrong,
          onPress: () =>
            setConfirm({
              title: `${label} : ${who} ?`,
              text:
                hours === null
                  ? `${who} sera retiré et ne pourra plus être invité dans ce groupe, sauf si l’exclusion est levée. Ce n’est pas un bannissement de Qu1z.`
                  : `${who} sera retiré et ne pourra pas être réinvité avant la fin de l’exclusion.`,
              label: 'Exclure',
              color: Colors.wrong,
              run: () => api('POST', `/api/groups/${id}/exclusions`, { userId: m.user.id, hours }),
            }),
        });
      }
    }
    return actions;
  };

  return (
    <Screen>
      <BackButton />
      {g && (
        <>
          <View style={styles.head}>
            <GroupAvatar id={g.id} name={g.name} uri={g.avatar} size={96} />
            {rights.edit && (
              <Button label="Changer la photo" variant="outline" color={Colors.text} onPress={changePhoto} />
            )}
            {rights.edit ? (
              <View style={styles.nameRow}>
                <TextInput value={name} onChangeText={setName} maxLength={MAX_GROUP_NAME_LENGTH} accessibilityLabel="Nom du groupe" style={styles.input} />
                <Button
                  label="Renommer"
                  disabled={!name.trim() || name.trim() === g.name}
                  onPress={() => run(() => api('PATCH', `/api/groups/${id}`, { name }), 'Groupe renommé.')}
                />
              </View>
            ) : (
              <AppText variant="title">{g.name}</AppText>
            )}
            <AppText muted>
              {g.members.length} membre{g.members.length > 1 ? 's' : ''} · ton rôle : {g.myRole === 'creator' ? 'créateur' : g.myRole === 'admin' ? 'administrateur' : 'membre'}
            </AppText>
          </View>
          {message && <AppText color={message.ok ? Colors.correct : Colors.wrong}>{message.text}</AppText>}

          {confirm && (
            <Card style={{ borderColor: confirm.color, borderWidth: 1 }}>
              <AppText variant="label">{confirm.title}</AppText>
              <AppText muted>{confirm.text}</AppText>
              <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                <Button label="Annuler" variant="outline" color={Colors.text} onPress={() => setConfirm(null)} style={{ flex: 1 }} />
                <Button
                  label={confirm.label}
                  color={confirm.color}
                  onPress={async () => {
                    const c = confirm;
                    setConfirm(null);
                    setSelected(null);
                    await run(c.run);
                  }}
                  style={{ flex: 1 }}
                />
              </View>
            </Card>
          )}

          <SectionHeader
            title="Participants"
            action={
              rights.invite ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push({ pathname: '/messages/group/[id]/invite', params: { id } })}
                  style={{ padding: Spacing.xs }}>
                  <AppText variant="label" color={Colors.player}>
                    + Inviter
                  </AppText>
                </Pressable>
              ) : undefined
            }
          />
          {transferring && (
            <AppText color={Colors.gold}>Choisis le nouveau créateur du groupe. Tu deviendras membre.</AppText>
          )}
          {g.members.map((m) => {
            const actions = m.user.id === playerId ? [] : memberActions(m);
            return (
              <View key={m.user.id}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${m.user.pseudo}, ${m.role}`}
                  onPress={() => {
                    if (transferring && m.user.id !== playerId) {
                      setConfirm({
                        title: `Transférer le groupe à ${m.user.pseudo} ?`,
                        text: `${m.user.pseudo} deviendra le créateur du groupe et tu deviendras membre.`,
                        label: 'Transférer',
                        color: Colors.gold,
                        run: () => api('POST', `/api/groups/${id}/transfer`, { userId: m.user.id }),
                      });
                      setTransferring(false);
                    } else if (actions.length) setSelected(selected === m.user.id ? null : m.user.id);
                    else router.push({ pathname: '/player/[id]', params: { id: m.user.id } });
                  }}
                  style={[styles.member, transferring && m.user.id !== playerId && styles.transferTarget]}>
                  <Avatar name={m.user.pseudo} color={avatarColor(m.user.id)} uri={m.user.avatar} size={44} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <AppText variant="label" numberOfLines={1}>
                        {m.user.pseudo}
                        {m.user.id === playerId ? ' (toi)' : ''}
                      </AppText>
                      <RoleBadge role={m.role} />
                    </View>
                    <AppText variant="caption" color={m.blockedByMe ? Colors.wrong : Colors.gold}>
                      {m.blockedByMe ? 'Bloqué : ses messages te sont masqués' : (m.user.title ?? `Niveau ${m.user.level}`)}
                    </AppText>
                  </View>
                </Pressable>
                {selected === m.user.id && (
                  <View style={styles.actions}>
                    <Button
                      label="Voir le profil"
                      variant="outline"
                      color={Colors.text}
                      onPress={() => router.push({ pathname: '/player/[id]', params: { id: m.user.id } })}
                    />
                    {actions.map((a) => (
                      <Button key={a.label} label={a.label} variant="outline" color={a.color ?? Colors.text} onPress={a.onPress} />
                    ))}
                  </View>
                )}
              </View>
            );
          })}

          {g.invitations.length > 0 && (
            <>
              <SectionHeader title={`Invitations en attente · ${g.invitations.length}`} />
              {g.invitations.map((i) => (
                <View key={i.id} style={styles.member}>
                  <Avatar name={i.invitee.pseudo} color={avatarColor(i.invitee.id)} uri={i.invitee.avatar} size={36} />
                  <AppText style={{ flex: 1 }}>
                    {i.invitee.pseudo}
                    <AppText variant="caption" muted>
                      {'  '}par {i.inviter.pseudo}
                    </AppText>
                  </AppText>
                  <Button label="Annuler" variant="outline" color={Colors.textMuted} onPress={() => run(() => api('DELETE', `/api/groups/${id}/invitations/${i.id}`))} />
                </View>
              ))}
            </>
          )}

          {g.exclusions.length > 0 && (
            <>
              <SectionHeader title="Exclusions" />
              {g.exclusions.map((e) => (
                <View key={e.user.id} style={styles.member}>
                  <Avatar name={e.user.pseudo} color={avatarColor(e.user.id)} uri={e.user.avatar} size={36} />
                  <View style={{ flex: 1 }}>
                    <AppText>{e.user.pseudo}</AppText>
                    <AppText variant="caption" muted>
                      {e.until ? `Jusqu’au ${new Date(e.until).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}` : 'Définitive'}
                    </AppText>
                  </View>
                  <Button label="Lever" variant="outline" color={Colors.text} onPress={() => run(() => api('DELETE', `/api/groups/${id}/exclusions/${e.user.id}`))} />
                </View>
              ))}
            </>
          )}

          <SectionHeader title="Groupe" />
          <ReportSheet target={reporting ? { type: 'group', id: g.id, label: `le groupe « ${g.name} »` } : null} onClose={() => setReporting(false)} />
          <Button label="Signaler le groupe" variant="outline" color={Colors.textMuted} onPress={() => setReporting(true)} />
          {g.myRole === 'creator' ? (
            <>
              {g.members.length > 1 && (
                <Button
                  label={transferring ? 'Annuler le transfert' : 'Transférer le rôle de créateur'}
                  variant="outline"
                  color={Colors.gold}
                  onPress={() => setTransferring(!transferring)}
                />
              )}
              <AppText variant="caption" muted>
                Pour quitter le groupe, transfère d’abord ton rôle de créateur à un autre membre.
              </AppText>
              <Button
                label="Supprimer le groupe"
                color={Colors.wrong}
                onPress={() =>
                  setConfirm({
                    title: `Supprimer « ${g.name} » ?`,
                    text: 'Le groupe sera fermé pour tous les membres, qui perdront l’accès à la conversation. Cette action est définitive.',
                    label: 'Supprimer définitivement',
                    color: Colors.wrong,
                    run: async () => {
                      await api('DELETE', `/api/groups/${id}`, { confirm: true });
                      router.replace('/messages');
                    },
                  })
                }
              />
            </>
          ) : (
            <Button
              label="Quitter le groupe"
              color={Colors.wrong}
              onPress={() =>
                setConfirm({
                  title: 'Quitter le groupe ?',
                  text: 'Tu n’auras plus accès à la conversation. Il faudra une nouvelle invitation pour revenir.',
                  label: 'Quitter',
                  color: Colors.wrong,
                  run: async () => {
                    await api('POST', `/api/groups/${id}/leave`);
                    router.replace('/messages');
                  },
                })
              }
            />
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { alignItems: 'center', gap: Spacing.sm },
  nameRow: { gap: Spacing.sm, width: '100%' },
  input: { width: '100%', color: Colors.text, fontSize: 18, fontWeight: '700', backgroundColor: Colors.surface, borderRadius: Radius.sm, paddingHorizontal: Spacing.sm, paddingVertical: 10 },
  member: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 6, borderRadius: Radius.sm },
  transferTarget: { backgroundColor: Colors.surface, paddingHorizontal: Spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, paddingLeft: 52, paddingBottom: Spacing.sm },
});
