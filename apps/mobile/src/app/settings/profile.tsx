import { router } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Switch, TextInput, View } from 'react-native';

import { COUNTRIES, MAX_BIO_LENGTH, NEARBY_KM, REGIONS_FR, countryFlag, countryName, type PublicProfile } from '@qu1z/shared';

import { Chip, SectionHeader } from '@/components/social';
import { AppText, Avatar, Button, Card, Screen } from '@/components/ui';
import { Colors, Gradients, Radius, Spacing } from '@/constants/theme';
import { api, errorMessage, useApi } from '@/net/api';
import { forgetLocation, shareApproxLocation } from '@/net/location';
import { mediaUri, pickImage, uploadImage } from '@/net/media';
import { avatarColor } from '@/utils/avatar';
import { useGameServer } from '@/state/game-server';
import { Tap } from '@/components/tap';

/** Réglages du profil : pseudo, bio, titre équipé, confidentialité, joueurs bloqués. */
export default function ProfileSettingsScreen() {
  const { playerId } = useGameServer();
  const me = useApi<PublicProfile>(playerId ? `/api/users/${playerId}` : null);
  const account = useApi<{ titles: string[]; role: string }>('/api/me');
  const [pseudo, setPseudo] = useState('');
  const [bio, setBio] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pickCountry, setPickCountry] = useState(false);
  const [pickRegion, setPickRegion] = useState(false);
  const [regionText, setRegionText] = useState('');
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    if (me.data) {
      setPseudo(me.data.pseudo);
      setBio(me.data.bio);
    }
  }, [me.data?.pseudo, me.data?.bio]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (patch: Record<string, unknown>) => {
    setMessage(null);
    try {
      await api('PATCH', '/api/me/profile', patch);
      setMessage({ ok: true, text: 'Enregistré.' });
    } catch (e) {
      setMessage({ ok: false, text: errorMessage(e) });
    }
  };

  const [photoBusy, setPhotoBusy] = useState<'avatar' | 'cover' | null>(null);
  const PICTURES = {
    avatar: { aspect: [1, 1] as [number, number], done: 'Photo de profil mise à jour.', removed: 'Photo de profil retirée.' },
    cover: { aspect: [3, 1] as [number, number], done: 'Photo de couverture mise à jour.', removed: 'Photo de couverture retirée.' },
  };
  const changePhoto = async (kind: 'avatar' | 'cover', source: 'library' | 'camera') => {
    setMessage(null);
    try {
      const picked = await pickImage(source, { aspect: PICTURES[kind].aspect });
      if (!picked) return;
      setPhotoBusy(kind);
      await uploadImage(picked, `/api/me/${kind}`);
      setMessage({ ok: true, text: PICTURES[kind].done });
    } catch (e) {
      setMessage({ ok: false, text: errorMessage(e) });
    } finally {
      setPhotoBusy(null);
    }
  };
  const removePhoto = async (kind: 'avatar' | 'cover') => {
    setMessage(null);
    try {
      await api('DELETE', `/api/me/${kind}`);
      setMessage({ ok: true, text: PICTURES[kind].removed });
    } catch (e) {
      setMessage({ ok: false, text: errorMessage(e) });
    }
  };
  const photoButtons = (kind: 'avatar' | 'cover', current: string | null | undefined) => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm }}>
      <Button
        label={photoBusy === kind ? 'Envoi…' : 'Galerie'}
        variant="outline"
        color={Colors.text}
        disabled={!!photoBusy}
        onPress={() => changePhoto(kind, 'library')}
      />
      {Platform.OS !== 'web' && (
        <Button label="Appareil photo" variant="outline" color={Colors.text} disabled={!!photoBusy} onPress={() => changePhoto(kind, 'camera')} />
      )}
      {current && <Button label="Retirer" variant="outline" color={Colors.wrong} onPress={() => removePhoto(kind)} />}
    </View>
  );

  const p = me.data;
  return (
    <Screen title="Mon profil" back>

      <Card style={{ gap: Spacing.md }}>
        <View style={styles.photoRow}>
          <Avatar name={p?.pseudo ?? '?'} color={playerId ? avatarColor(playerId) : Colors.accent} uri={p?.avatar} size={84} />
          <View style={{ flex: 1, gap: Spacing.sm }}>
            <AppText variant="label">Photo de profil</AppText>
            {photoButtons('avatar', p?.avatar)}
          </View>
        </View>
        <View style={{ gap: Spacing.sm }}>
          <AppText variant="label">Photo de couverture</AppText>
          <View style={styles.cover}>
            {mediaUri(p?.cover) ? (
              <Image source={{ uri: mediaUri(p?.cover)! }} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel="Ma photo de couverture" />
            ) : (
              <LinearGradient colors={Gradients.banner} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            )}
          </View>
          {photoButtons('cover', p?.cover)}
        </View>
        <AppText variant="caption" muted>
          JPEG, PNG, WebP ou GIF, 8 Mo maximum. La position et les infos de l’appareil sont retirées.
        </AppText>
      </Card>

      <Card>
        <AppText variant="label">Pseudo</AppText>
        <TextInput value={pseudo} onChangeText={setPseudo} maxLength={20} autoCapitalize="none" accessibilityLabel="Pseudo" style={styles.input} />
        <AppText variant="caption" muted>
          3 à 20 caractères, sans espace. Les autres te mentionnent avec @{pseudo || 'pseudo'}.
        </AppText>
        <AppText variant="label" style={{ marginTop: Spacing.sm }}>
          Bio
        </AppText>
        <TextInput
          value={bio}
          onChangeText={setBio}
          maxLength={MAX_BIO_LENGTH}
          multiline
          accessibilityLabel="Bio"
          style={[styles.input, { minHeight: 70 }]}
        />
        <Button label="Enregistrer" onPress={() => save({ pseudo, bio })} disabled={!p || (pseudo === p.pseudo && bio === p.bio)} />
        {message && <AppText color={message.ok ? Colors.correct : Colors.wrong}>{message.text}</AppText>}
      </Card>

      <SectionHeader title="Titre affiché" />
      <View style={styles.chips}>
        <Chip label="Aucun" active={!p?.title} onPress={() => save({ equippedTitle: null })} />
        {(account.data?.titles ?? []).map((t) => (
          <Chip key={t} label={t} color={Colors.gold} active={p?.title === t} onPress={() => save({ equippedTitle: t })} />
        ))}
      </View>
      <AppText variant="caption" muted>
        De nouveaux titres se débloquent en montant de niveau.
      </AppText>

      <SectionHeader title="Pays" />
      <Card style={{ gap: Spacing.sm }}>
        <Tap accessibilityRole="button" onPress={() => setPickCountry((v) => !v)} style={styles.toggle}>
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="label">{p?.country ? `${countryFlag(p.country)} ${countryName(p.country)}` : 'Aucun pays choisi'}</AppText>
            <AppText variant="caption" muted>
              Facultatif. Sert uniquement au classement « Pays » ; il n’est affiché sur ton profil pour personne.
            </AppText>
          </View>
          <AppText variant="label" color={Colors.accent}>
            {pickCountry ? 'Fermer' : 'Modifier'}
          </AppText>
        </Tap>
        {pickCountry && (
          <View style={styles.chips}>
            <Chip label="Aucun" active={!p?.country} onPress={() => save({ country: null }).then(() => setPickCountry(false))} />
            {COUNTRIES.map((c) => (
              <Chip
                key={c.code}
                label={`${countryFlag(c.code)} ${c.name}`}
                active={p?.country === c.code}
                onPress={() => save({ country: c.code }).then(() => setPickCountry(false))}
              />
            ))}
          </View>
        )}
      </Card>

      <SectionHeader title="Région" />
      <Card style={{ gap: Spacing.sm }}>
        <Tap accessibilityRole="button" onPress={() => setPickRegion((v) => !v)} style={styles.toggle}>
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="label">{p?.region ?? 'Aucune région choisie'}</AppText>
            <AppText variant="caption" muted>
              Facultatif. Sert uniquement au classement « Région » (avec les joueurs de ton pays) ; affichée pour personne.
            </AppText>
          </View>
          <AppText variant="label" color={Colors.accent}>
            {pickRegion ? 'Fermer' : 'Modifier'}
          </AppText>
        </Tap>
        {pickRegion && (
          <View style={styles.chips}>
            <Chip label="Aucune" active={!p?.region} onPress={() => save({ region: null }).then(() => (setPickRegion(false), me.refresh()))} />
            {p?.country === 'FR' || !p?.country ? (
              REGIONS_FR.map((r) => (
                <Chip key={r} label={r} active={p?.region === r} onPress={() => save({ region: r }).then(() => (setPickRegion(false), me.refresh()))} />
              ))
            ) : (
              <View style={{ flexDirection: 'row', gap: Spacing.sm, alignItems: 'center', width: '100%' }}>
                <TextInput
                  value={regionText}
                  onChangeText={setRegionText}
                  maxLength={60}
                  placeholder="Ta région, ta province, ton état…"
                  placeholderTextColor={Colors.textMuted}
                  style={[styles.input, { flex: 1 }]}
                />
                <Button
                  small
                  label="OK"
                  color={Colors.accent}
                  onPress={() => regionText.trim() && save({ region: regionText.trim() }).then(() => (setPickRegion(false), me.refresh()))}
                />
              </View>
            )}
          </View>
        )}
      </Card>

      <SectionHeader title="Position approximative" />
      <Card style={{ gap: Spacing.sm }}>
        <AppText variant="label">{p?.hasLocation ? 'Activée' : 'Désactivée'}</AppText>
        <AppText variant="caption" muted>
          Facultatif. Sert uniquement au classement « À proximité » (joueurs à moins de {NEARBY_KM} km). Arrondie à environ 10 km,
          jamais ta position exacte, et affichée pour personne.
        </AppText>
        <Button
          small
          label={locating ? '…' : p?.hasLocation ? 'Ne plus utiliser ma position' : 'Utiliser ma position approximative'}
          variant={p?.hasLocation ? 'outline' : undefined}
          color={p?.hasLocation ? Colors.textMuted : Colors.accent}
          onPress={async () => {
            setLocating(true);
            const error = p?.hasLocation ? await forgetLocation() : await shareApproxLocation();
            setLocating(false);
            setMessage(error ? { ok: false, text: error } : { ok: true, text: 'Enregistré.' });
            me.refresh();
          }}
        />
      </Card>

      <SectionHeader title="Confidentialité" />
      <Card style={{ gap: Spacing.md }}>
        <Toggle
          label="Profil privé"
          hint="Les nouveaux abonnés doivent être acceptés un par un. Seuls tes abonnés voient tes publications et statistiques."
          value={p?.isPrivate ?? false}
          onChange={(v) => save({ isPrivate: v })}
        />
        <Toggle label="Afficher ma liste d’abonnés" hint="Le nombre d’abonnés reste toujours visible." value={p?.showFollowers ?? true} onChange={(v) => save({ showFollowers: v })} />
        <Toggle label="Afficher ma liste d’abonnements" hint="Le nombre d’abonnements reste toujours visible." value={p?.showFollowing ?? true} onChange={(v) => save({ showFollowing: v })} />
      </Card>

      <Tap accessibilityRole="button" onPress={() => router.push('/account')} style={styles.link}>
        <AppText variant="label">Compte et e-mail</AppText>
        <AppText muted>›</AppText>
      </Tap>
      <Tap accessibilityRole="button" onPress={() => router.push('/settings/notifications')} style={styles.link}>
        <AppText variant="label">Notifications</AppText>
        <AppText muted>›</AppText>
      </Tap>
      <Tap accessibilityRole="button" onPress={() => router.push('/settings/blocked')} style={styles.link}>
        <AppText variant="label">Joueurs bloqués</AppText>
        <AppText muted>›</AppText>
      </Tap>
      <Tap accessibilityRole="button" onPress={() => router.push('/settings/sanctions')} style={styles.link}>
        <AppText variant="label">Mes sanctions</AppText>
        <AppText muted>›</AppText>
      </Tap>
      {(account.data?.role === 'moderator' || account.data?.role === 'admin') && (
        <Tap accessibilityRole="button" onPress={() => router.push('/moderation')} style={styles.link}>
          <AppText variant="label" color={Colors.gold}>
            Panneau de modération
          </AppText>
          <AppText muted>›</AppText>
        </Tap>
      )}
      {account.data?.role === 'admin' && (
        <Tap accessibilityRole="button" onPress={() => router.push('/admin')} style={styles.link}>
          <AppText variant="label" color={Colors.gold}>
            Panneau d’administration
          </AppText>
          <AppText muted>›</AppText>
        </Tap>
      )}
    </Screen>
  );
}

function Toggle({ label, hint, value, onChange }: { label: string; hint: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.toggle}>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="label">{label}</AppText>
        <AppText variant="caption" muted>
          {hint}
        </AppText>
      </View>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={label} trackColor={{ true: Colors.accent, false: Colors.border }} />
    </View>
  );
}

const styles = StyleSheet.create({
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  cover: { aspectRatio: 3, borderRadius: Radius.sm, overflow: 'hidden', backgroundColor: Colors.surfaceRaised },
  input: {
    color: Colors.text,
    fontSize: 16,
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm + 4,
    paddingVertical: 10,
    textAlignVertical: 'top',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  link: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    minHeight: 52,
  },
});
