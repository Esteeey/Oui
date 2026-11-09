import { router } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Switch, TextInput, View } from 'react-native';

import { COUNTRIES, DECORS, MAX_BIO_LENGTH, NEARBY_KM, REGIONS_FR, countryFlag, countryName, type DecorId, type PublicProfile } from '@qu1z/shared';

import { Chip, SectionHeader } from '@/components/social';
import { TitleDecor } from '@/components/title-decor';
import { PhotoCropDialog } from '@/components/photo-crop-dialog';
import { AppText, Avatar, Button, Card, Screen } from '@/components/ui';
import { Colors, Gradients, Radius, Spacing } from '@/constants/theme';
import { api, errorMessage, useApi } from '@/net/api';
import { forgetLocation, shareApproxLocation } from '@/net/location';
import { mediaUri, pickImage, uploadImage, type PickedImage } from '@/net/media';
import { avatarColor } from '@/utils/avatar';
import { useGameServer } from '@/state/game-server';
import { Tap } from '@/components/tap';

/** Réglages du profil : pseudo, bio, titre équipé, confidentialité, joueurs bloqués. */
export default function ProfileSettingsScreen() {
  const { playerId } = useGameServer();
  const me = useApi<PublicProfile>(playerId ? `/api/users/${playerId}` : null);
  const account = useApi<{ titles: string[]; decors: DecorId[]; role: string }>('/api/me');
  const [pseudo, setPseudo] = useState('');
  const [bio, setBio] = useState('');
  const [city, setCity] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pickCountry, setPickCountry] = useState(false);
  const [pickRegion, setPickRegion] = useState(false);
  const [regionText, setRegionText] = useState('');
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    if (me.data) {
      setPseudo(me.data.pseudo);
      setBio(me.data.bio);
      setCity(me.data.city ?? '');
    }
  }, [me.data?.pseudo, me.data?.bio, me.data?.city]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const [pendingPhoto, setPendingPhoto] = useState<{ kind: 'avatar' | 'cover'; image: PickedImage } | null>(null);
  const PICTURES = {
    avatar: { aspect: [1, 1] as [number, number], done: 'Photo de profil mise à jour.', removed: 'Photo de profil retirée.' },
    cover: { aspect: [1, 1] as [number, number], done: 'Photo de couverture mise à jour.', removed: 'Photo de couverture retirée.' },
  };
  const changePhoto = async (kind: 'avatar' | 'cover', source: 'library' | 'camera') => {
    setMessage(null);
    try {
      const picked = await pickImage(source, { aspect: PICTURES[kind].aspect, allowsEditing: false });
      if (!picked) return;
      setPendingPhoto({ kind, image: picked });
    } catch (e) {
      setMessage({ ok: false, text: errorMessage(e) });
    } finally {
      setPhotoBusy(null);
    }
  };
  const savePhoto = async (image: PickedImage) => {
    if (!pendingPhoto) return;
    const kind = pendingPhoto.kind;
    setPhotoBusy(kind);
    setMessage(null);
    try {
      await uploadImage(image, `/api/me/${kind}`);
      setMessage({ ok: true, text: PICTURES[kind].done });
      setPendingPhoto(null);
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
        small
        label={photoBusy === kind ? 'Envoi…' : 'Galerie'}
        variant="outline"
        color={Colors.text}
        disabled={!!photoBusy}
        onPress={() => changePhoto(kind, 'library')}
      />
      {Platform.OS !== 'web' && (
        <Button small label="Appareil photo" variant="outline" color={Colors.text} disabled={!!photoBusy} onPress={() => changePhoto(kind, 'camera')} />
      )}
      {current && <Button small label="Retirer" variant="outline" color={Colors.wrong} onPress={() => removePhoto(kind)} />}
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
              <Image source={{ uri: mediaUri(p?.cover)! }} style={StyleSheet.absoluteFill} contentFit="contain" accessibilityLabel="Ma photo de couverture" />
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
          Biographie
        </AppText>
        <TextInput
          value={bio}
          onChangeText={setBio}
          maxLength={MAX_BIO_LENGTH}
          multiline
          accessibilityLabel="Biographie"
          placeholder="Quelques mots sur toi…"
          placeholderTextColor={Colors.textMuted}
          style={[styles.input, { minHeight: 70 }]}
        />
        <Button small label="Enregistrer" onPress={() => save({ pseudo, bio })} disabled={!p || (pseudo === p.pseudo && bio === p.bio)} />
        {message && <AppText color={message.ok ? Colors.correct : Colors.wrong}>{message.text}</AppText>}
      </Card>

      <SectionHeader title="Titre affiché" />
      <View style={styles.chips}>
        <Chip style={styles.profileChip} label="Aucun" active={!p?.title} onPress={() => save({ equippedTitle: null })} />
        {(account.data?.titles ?? []).map((t) => (
          <Chip style={styles.profileChip} key={t} label={t} color={Colors.gold} active={p?.title === t} onPress={() => save({ equippedTitle: t })} />
        ))}
      </View>
      <AppText variant="caption" muted>
        Chaque thème a ses 5 titres, débloqués aux niveaux 1, 10, 25, 50 et 100 de ce thème.
      </AppText>

      <SectionHeader title="Décor du titre" />
      <Card style={{ gap: Spacing.sm, alignItems: 'center' }}>
        {DECORS.map((d) => {
          const unlocked = account.data?.decors?.includes(d.id) ?? false;
          const active = p?.decor === d.id;
          return (
            <Tap
              key={d.id}
              accessibilityRole="button"
              accessibilityLabel={`Décor ${d.name}`}
              accessibilityState={{ selected: active, disabled: !unlocked }}
              disabled={!unlocked}
              onPress={() => save({ equippedDecor: d.id }).then(() => me.refresh())}
              style={[styles.decor, active && styles.decorActive]}>
              <View style={!unlocked && styles.decorLocked}>
                <TitleDecor decor={d.id} width={270} label={p?.title ?? p?.autoTitle ?? 'Ton titre'} />
              </View>
              {!unlocked && (
                <AppText variant="caption" color={Colors.onAccent}>
                  {d.unlock.kind === 'account' ? `Compte niveau ${d.unlock.level}` : `Niveau ${d.unlock.level} dans un thème`}
                </AppText>
              )}
            </Tap>
          );
        })}
      </Card>

      {!!p?.banners?.length && (
        <>
          <SectionHeader title="Banderole affichée" />
          <View style={styles.chips}>
            {p.banners.map((b, i) => (
              <Chip
                style={styles.profileChip}
                key={b.key}
                label={b.season ? `${b.themeName} · ${b.season}` : b.themeName}
                color={Colors.gold}
                active={i === 0}
                onPress={() => save({ equippedBanner: b.key }).then(() => me.refresh())}
              />
            ))}
          </View>
          <AppText variant="caption" muted>
            Les autres banderoles se voient en swipant sur celle de ton profil.
          </AppText>
        </>
      )}

      <SectionHeader title="Pays" />
      <Card style={{ gap: Spacing.sm }}>
        <Tap accessibilityRole="button" onPress={() => setPickCountry((v) => !v)} style={styles.toggle}>
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="label">{p?.country ? `${countryFlag(p.country)} ${countryName(p.country)}` : 'Aucun pays choisi'}</AppText>
            <AppText variant="caption" muted>
              Facultatif. Utilisé pour le classement « Pays » ; il apparaît publiquement avec ta ville quand tu renseignes celle-ci.
            </AppText>
          </View>
          <AppText variant="label" color={Colors.accentInk}>
            {pickCountry ? 'Fermer' : 'Modifier'}
          </AppText>
        </Tap>
        {pickCountry && (
          <View style={styles.chips}>
            <Chip style={styles.profileChip} label="Aucun" active={!p?.country} onPress={() => save({ country: null }).then(() => setPickCountry(false))} />
            {COUNTRIES.map((c) => (
              <Chip
                style={styles.profileChip}
                key={c.code}
                label={`${countryFlag(c.code)} ${c.name}`}
                active={p?.country === c.code}
                onPress={() => save({ country: c.code }).then(() => setPickCountry(false))}
              />
            ))}
          </View>
        )}
      </Card>

      <SectionHeader title="Ville affichée sur ton profil" />
      <Card style={{ gap: Spacing.sm }}>
        <AppText variant="caption" muted>Facultatif. Ta ville sera affichée à côté du pays choisi sur ton profil.</AppText>
        <TextInput value={city} onChangeText={setCity} maxLength={60} placeholder="Ex. Marseille" placeholderTextColor={Colors.textMuted} accessibilityLabel="Ville affichée sur le profil" style={styles.input} />
        <Button small label="Enregistrer la ville" onPress={() => save({ city: city.trim() || null }).then(() => me.refresh())} disabled={!p || city.trim() === (p.city ?? '')} />
      </Card>

      <SectionHeader title="Région pour le classement" />
      <Card style={{ gap: Spacing.sm }}>
        <Tap accessibilityRole="button" onPress={() => setPickRegion((v) => !v)} style={styles.toggle}>
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="label">{p?.region ?? 'Aucune région choisie'}</AppText>
            <AppText variant="caption" muted>
              Facultatif. Sert uniquement au classement « Région » avec les joueurs de ton pays.
            </AppText>
          </View>
          <AppText variant="label" color={Colors.accentInk}>
            {pickRegion ? 'Fermer' : 'Modifier'}
          </AppText>
        </Tap>
        {pickRegion && (
          <View style={styles.chips}>
            <Chip style={styles.profileChip} label="Aucune" active={!p?.region} onPress={() => save({ region: null }).then(() => (setPickRegion(false), me.refresh()))} />
            {p?.country === 'FR' || !p?.country ? (
              REGIONS_FR.map((r) => (
                <Chip style={styles.profileChip} key={r} label={r} active={p?.region === r} onPress={() => save({ region: r }).then(() => (setPickRegion(false), me.refresh()))} />
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
          <AppText variant="label" color={Colors.goldInk}>
            Panneau de modération
          </AppText>
          <AppText muted>›</AppText>
        </Tap>
      )}
      {account.data?.role === 'admin' && (
        <Tap accessibilityRole="button" onPress={() => router.push('/admin')} style={styles.link}>
          <AppText variant="label" color={Colors.goldInk}>
            Panneau d’administration
          </AppText>
          <AppText muted>›</AppText>
        </Tap>
      )}
      <PhotoCropDialog
        visible={!!pendingPhoto}
        image={pendingPhoto?.image ?? null}
        subtitle={pendingPhoto?.kind === 'cover' ? 'Photo de couverture du profil' : 'Photo de profil'}
        aspect={[1, 1]}
        busy={!!photoBusy}
        onCancel={() => !photoBusy && setPendingPhoto(null)}
        onConfirm={(image) => void savePhoto(image)}
        renderPreview={(preparedImage) => (
          <View style={styles.profileReview}>
            <View style={styles.profileReviewCover}>
              {pendingPhoto?.kind === 'cover' ? (
                <Image source={{ uri: preparedImage.uri }} style={StyleSheet.absoluteFill} contentFit="contain" accessibilityLabel="Nouvelle photo de couverture sur le profil" />
              ) : p?.cover ? (
                <Image source={{ uri: mediaUri(p.cover)! }} style={StyleSheet.absoluteFill} contentFit="contain" accessibilityLabel="Couverture actuelle du profil" />
              ) : (
                <LinearGradient colors={Gradients.banner} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
              )}
              <LinearGradient colors={['rgba(9,16,36,0.05)', 'rgba(9,16,36,0.65)']} style={StyleSheet.absoluteFill} />
              <View style={styles.profileReviewTag}><AppText variant="caption" color={Colors.onAccent}>APERÇU</AppText></View>
            </View>
            <View style={styles.profileReviewIdentity}>
              <View style={styles.profileReviewAvatar}>
                {pendingPhoto?.kind === 'avatar' ? (
                  <Image source={{ uri: preparedImage.uri }} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel="Nouvelle photo de profil" />
                ) : p?.avatar ? (
                  <Image source={{ uri: mediaUri(p.avatar)! }} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel="Photo de profil actuelle" />
                ) : (
                  <AppText variant="heading" color={Colors.onAccent}>{(p?.pseudo ?? 'T').slice(0, 1).toUpperCase()}</AppText>
                )}
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <AppText variant="heading" numberOfLines={1}>{p?.pseudo ?? 'Ton profil'}</AppText>
                <AppText variant="caption" muted>{pendingPhoto?.kind === 'avatar' ? 'Nouvelle photo de profil' : 'Nouvelle photo de couverture'}</AppText>
              </View>
            </View>
          </View>
        )}
      />
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
  cover: { aspectRatio: 1, borderRadius: Radius.sm, overflow: 'hidden', backgroundColor: Colors.surfaceRaised },
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
  profileChip: { paddingHorizontal: 12, paddingVertical: 6 },
  decor: { alignItems: 'center', gap: 2, padding: 6, borderRadius: Radius.sm, borderWidth: 2, borderColor: 'transparent', backgroundColor: Colors.navy },
  decorActive: { borderColor: Colors.accent },
  decorLocked: { opacity: 0.35 },
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
  profileReview: { width: '100%', overflow: 'hidden', borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, backgroundColor: Colors.surface },
  profileReviewCover: { height: 170, overflow: 'hidden', backgroundColor: Colors.navy },
  profileReviewTag: { position: 'absolute', top: Spacing.sm, left: Spacing.sm, paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.pill, backgroundColor: 'rgba(18,26,51,0.66)' },
  profileReviewIdentity: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingBottom: Spacing.md },
  profileReviewAvatar: { width: 72, height: 72, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', marginTop: -28, borderWidth: 3, borderColor: Colors.surface, borderRadius: 36, backgroundColor: Colors.accent },
  profileReviewNote: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.md, textAlign: 'center' },
});
