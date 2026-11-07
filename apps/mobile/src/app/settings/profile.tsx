import { router } from 'expo-router';
import { Image } from 'expo-image';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, PanResponder, Platform, StyleSheet, Switch, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { COUNTRIES, MAX_BIO_LENGTH, NEARBY_KM, REGIONS_FR, countryFlag, countryName, type PublicProfile } from '@qu1z/shared';

import { Chip, SectionHeader } from '@/components/social';
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
  const account = useApi<{ titles: string[]; role: string }>('/api/me');
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
              Facultatif. Utilisé pour le classement « Pays » ; il apparaît publiquement avec ta ville quand tu renseignes celle-ci.
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

      <SectionHeader title="Ville affichée sur ton profil" />
      <Card style={{ gap: Spacing.sm }}>
        <AppText variant="caption" muted>Facultatif. Ta ville sera affichée à côté du pays choisi, dans une pastille sur ton profil.</AppText>
        <TextInput value={city} onChangeText={setCity} maxLength={60} placeholder="Ex. Marseille" placeholderTextColor={Colors.textMuted} accessibilityLabel="Ville affichée sur le profil" style={styles.input} />
        <Button label="Enregistrer la ville" onPress={() => save({ city: city.trim() || null }).then(() => me.refresh())} disabled={!p || city.trim() === (p.city ?? '')} />
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
      <CropPhotoDialog
        visible={!!pendingPhoto}
        kind={pendingPhoto?.kind ?? 'avatar'}
        image={pendingPhoto?.image ?? null}
        onCancel={() => !photoBusy && setPendingPhoto(null)}
        onConfirm={(image) => void savePhoto(image)}
        busy={!!photoBusy}
        profileName={p?.pseudo ?? 'Ton profil'}
        avatarUri={mediaUri(p?.avatar)}
        coverUri={mediaUri(p?.cover)}
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

function CropPhotoDialog({
  visible,
  kind,
  image,
  onCancel,
  onConfirm,
  busy,
  profileName,
  avatarUri,
  coverUri,
}: {
  visible: boolean;
  kind: 'avatar' | 'cover';
  image: PickedImage | null;
  onCancel: () => void;
  onConfirm: (image: PickedImage) => void;
  busy: boolean;
  profileName: string;
  avatarUri: string | null;
  coverUri: string | null;
}) {
  const { width, height } = useWindowDimensions();
  const [sliderWidth, setSliderWidth] = useState(1);
  const aspect = 1;
  const frameWidth = Math.min(Math.max(200, width - 96), 340, Math.min(280, height * 0.34) * aspect);
  const frameHeight = frameWidth / aspect;
  const baseScale = image ? Math.max(frameWidth / image.width, frameHeight / image.height) : 1;
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [cropping, setCropping] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [preparedImage, setPreparedImage] = useState<PickedImage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const panStart = useRef({ x: 0, y: 0 });
  const sliderStartX = useRef(0);
  const scale = baseScale * zoom;
  const maxX = image ? Math.max(0, (image.width * scale - frameWidth) / 2) : 0;
  const maxY = image ? Math.max(0, (image.height * scale - frameHeight) / 2) : 0;
  const offsetX = Math.max(-maxX, Math.min(maxX, offset.x));
  const offsetY = Math.max(-maxY, Math.min(maxY, offset.y));
  const sliderPanResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (event) => {
      sliderStartX.current = event.nativeEvent.pageX - event.nativeEvent.locationX;
      setZoom(1 + Math.max(0, Math.min(1, event.nativeEvent.locationX / sliderWidth)) * 2);
    },
    onPanResponderMove: (event) => {
      const position = (event.nativeEvent.pageX - sliderStartX.current) / sliderWidth;
      setZoom(1 + Math.max(0, Math.min(1, position)) * 2);
    },
  }), [sliderWidth]);
  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) + Math.abs(gesture.dy) > 3,
    onPanResponderGrant: () => { panStart.current = { x: offsetX, y: offsetY }; },
    onPanResponderMove: (_, gesture) => {
      setOffset({
        x: Math.max(-maxX, Math.min(maxX, panStart.current.x + gesture.dx)),
        y: Math.max(-maxY, Math.min(maxY, panStart.current.y + gesture.dy)),
      });
    },
  }), [maxX, maxY, offsetX, offsetY]);

  useEffect(() => {
    if (!visible) return;
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setShowProfile(false);
    setPreparedImage(null);
    setError(null);
  }, [visible, image?.uri]);

  const confirmCrop = async () => {
    if (!image || cropping) return;
    setCropping(true);
    setError(null);
    try {
      const cropWidth = frameWidth / scale;
      const cropHeight = frameHeight / scale;
      const originX = Math.max(0, Math.min(image.width - cropWidth, (image.width - cropWidth) / 2 - offsetX / scale));
      const originY = Math.max(0, Math.min(image.height - cropHeight, (image.height - cropHeight) / 2 - offsetY / scale));
      const x = Math.floor(originX);
      const y = Math.floor(originY);
      const result = await manipulateAsync(image.uri, [{ crop: {
        originX: x,
        originY: y,
        width: Math.max(1, Math.min(image.width - x, Math.floor(cropWidth))),
        height: Math.max(1, Math.min(image.height - y, Math.floor(cropHeight))),
      } }], { compress: 0.9, format: SaveFormat.JPEG });
      setPreparedImage({ uri: result.uri, width: result.width, height: result.height, mimeType: 'image/jpeg' });
      setShowProfile(true);
    } catch {
      setError('Impossible de préparer cette image. Essaie-en une autre.');
    } finally {
      setCropping(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false} statusBarTranslucent onRequestClose={onCancel}>
      <SafeAreaView style={styles.cropScreen} edges={['top', 'bottom']}>
        <View style={styles.cropDialog}>
          <View style={styles.cropHeader}>
            <View style={{ flex: 1 }}>
              <AppText variant="heading" color={Colors.onAccent}>{showProfile ? 'Aperçu du profil' : 'Ajuster la photo'}</AppText>
              <AppText variant="caption" color="#B6C0D7">{showProfile ? 'Vérifie le rendu avant de valider' : kind === 'avatar' ? 'Photo de profil' : 'Photo de couverture'}</AppText>
            </View>
            <Tap accessibilityRole="button" accessibilityLabel={showProfile ? 'Quitter l’aperçu' : 'Fermer le recadrage'} onPress={onCancel} style={styles.cropClose}>
              <AppText variant="heading" color={Colors.onAccent}>×</AppText>
            </Tap>
          </View>
          {!showProfile && <View style={styles.cropHint}>
            <AppText variant="caption" color={Colors.onAccent}>Déplace la photo dans le cadre</AppText>
          </View>}
          {!showProfile && <>
          {image && (
            <View style={[styles.cropFrame, { width: frameWidth, height: frameHeight }]} {...panResponder.panHandlers}>
              <Image
                source={{ uri: image.uri }}
                contentFit="fill"
                style={{
                  position: 'absolute',
                  width: image.width * scale,
                  height: image.height * scale,
                  left: (frameWidth - image.width * scale) / 2 + offsetX,
                  top: (frameHeight - image.height * scale) / 2 + offsetY,
                }}
              />
              <View pointerEvents="none" style={styles.cropGrid}>
                <View style={[styles.cropGridVertical, { left: '33.333%' }]} />
                <View style={[styles.cropGridVertical, { left: '66.666%' }]} />
                <View style={[styles.cropGridHorizontal, { top: '33.333%' }]} />
                <View style={[styles.cropGridHorizontal, { top: '66.666%' }]} />
              </View>
              <View pointerEvents="none" style={styles.cropOutline} />
            </View>
          )}
          <View style={styles.zoomSection}>
            <View style={styles.zoomHeading}>
              <AppText variant="label" color={Colors.onAccent}>Ajuster le zoom</AppText>
              <AppText variant="label" color={Colors.onAccent}>{Math.round(zoom * 100)} %</AppText>
            </View>
            <View style={styles.zoomSliderRow}>
              <Tap accessibilityRole="button" accessibilityLabel="Dézoomer" disabled={zoom <= 1} onPress={() => setZoom((z) => Math.max(1, z - 0.1))} style={styles.zoomButton}>
                <AppText variant="heading" color={Colors.onAccent}>−</AppText>
              </Tap>
              <View
                style={styles.zoomSliderHitArea}
                onLayout={(event) => setSliderWidth(Math.max(1, event.nativeEvent.layout.width))}
                {...sliderPanResponder.panHandlers}>
                <View style={styles.zoomSliderTrack}>
                  <View style={[styles.zoomSliderFill, { width: `${((zoom - 1) / 2) * 100}%` }]} />
                  <View style={[styles.zoomSliderThumb, { left: `${((zoom - 1) / 2) * 100}%` }]} />
                </View>
              </View>
              <Tap accessibilityRole="button" accessibilityLabel="Zoomer" disabled={zoom >= 3} onPress={() => setZoom((z) => Math.min(3, z + 0.1))} style={styles.zoomButton}>
                <AppText variant="heading" color={Colors.onAccent}>+</AppText>
              </Tap>
            </View>
            <View style={styles.zoomFooter}>
              <AppText variant="caption" color="#B6C0D7">Glisse vers la gauche pour dézoomer</AppText>
              <Tap accessibilityRole="button" accessibilityLabel="Réinitialiser le cadrage" onPress={() => { setZoom(1); setOffset({ x: 0, y: 0 }); }}>
                <AppText variant="caption" color={Colors.onAccent}>Réinitialiser</AppText>
              </Tap>
            </View>
          </View>
          </>}
          {showProfile && preparedImage && (
            <View style={styles.profileReview}>
              <View style={[styles.profileReviewCover, { height: Math.min(360, height * 0.44) }]}>
                {kind === 'cover' ? (
                  <Image source={{ uri: preparedImage.uri }} style={StyleSheet.absoluteFill} contentFit="contain" accessibilityLabel="Nouvelle photo de couverture sur le profil" />
                ) : coverUri ? (
                  <Image source={{ uri: coverUri }} style={StyleSheet.absoluteFill} contentFit="contain" accessibilityLabel="Couverture actuelle du profil" />
                ) : (
                  <LinearGradient colors={Gradients.banner} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                )}
                <LinearGradient colors={['rgba(9,16,36,0.05)', 'rgba(9,16,36,0.65)']} style={StyleSheet.absoluteFill} />
                <View style={styles.profileReviewTag}><AppText variant="caption" color={Colors.onAccent}>APERÇU</AppText></View>
              </View>
              <View style={styles.profileReviewIdentity}>
                <View style={styles.profileReviewAvatar}>
                  {kind === 'avatar' ? (
                    <Image source={{ uri: preparedImage.uri }} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel="Nouvelle photo de profil" />
                  ) : avatarUri ? (
                    <Image source={{ uri: avatarUri }} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel="Photo de profil actuelle" />
                  ) : (
                    <AppText variant="heading" color={Colors.onAccent}>{profileName.slice(0, 1).toUpperCase()}</AppText>
                  )}
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <AppText variant="heading" numberOfLines={1}>{profileName}</AppText>
                  <AppText variant="caption" muted>{kind === 'avatar' ? 'Nouvelle photo de profil' : 'Nouvelle photo de couverture'}</AppText>
                </View>
              </View>
              <AppText variant="caption" muted style={styles.profileReviewNote}>La photo ne sera enregistrée qu’après validation.</AppText>
            </View>
          )}
          {error && <AppText variant="caption" color={Colors.wrong}>{error}</AppText>}
          <View style={styles.cropActions}>
            <Button label={showProfile ? 'Quitter' : 'Annuler'} variant="outline" color={Colors.onAccent} disabled={busy || cropping} onPress={onCancel} style={{ flex: 0.8 }} />
            <Button
              label={showProfile ? busy ? 'Enregistrement…' : 'Valider' : cropping ? 'Préparation…' : 'Voir le profil'}
              color={Colors.accent}
              disabled={busy || cropping}
              onPress={() => showProfile && preparedImage ? onConfirm(preparedImage) : void confirmCrop()}
              style={{ flex: 1.3 }}
            />
          </View>
        </View>
      </SafeAreaView>
    </Modal>
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
  cropScreen: { flex: 1, backgroundColor: '#0D1426' },
  cropDialog: { flex: 1, width: '100%', maxWidth: 520, alignSelf: 'center', justifyContent: 'space-between', gap: Spacing.md, paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: Spacing.md },
  cropHeader: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  cropClose: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: '#202B42' },
  cropHint: { alignSelf: 'stretch', alignItems: 'center', paddingVertical: 10, paddingHorizontal: Spacing.sm, borderRadius: Radius.pill, backgroundColor: '#202B42' },
  cropFrame: { maxWidth: '100%', overflow: 'hidden', borderRadius: Radius.md, backgroundColor: '#080B13', alignSelf: 'center' },
  cropGrid: { ...StyleSheet.absoluteFill, overflow: 'hidden' },
  cropGridVertical: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(255,255,255,0.38)' },
  cropGridHorizontal: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.38)' },
  cropOutline: { ...StyleSheet.absoluteFill, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.86)', borderRadius: Radius.md },
  zoomSection: { width: '100%', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.md, backgroundColor: '#171F34' },
  zoomHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  zoomSliderRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  zoomButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: '#27334D' },
  zoomSliderHitArea: { flex: 1, height: 42, justifyContent: 'center' },
  zoomSliderTrack: { height: 6, borderRadius: 3, backgroundColor: '#3A465E', justifyContent: 'center' },
  zoomSliderFill: { height: 6, borderRadius: 3, backgroundColor: Colors.accent },
  zoomSliderThumb: { position: 'absolute', width: 20, height: 20, marginLeft: -10, borderWidth: 3, borderColor: Colors.surface, borderRadius: 10, backgroundColor: Colors.accent },
  zoomFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  profileReview: { width: '100%', overflow: 'hidden', borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, backgroundColor: Colors.surface },
  profileReviewCover: { height: 170, overflow: 'hidden', backgroundColor: Colors.navy },
  profileReviewTag: { position: 'absolute', top: Spacing.sm, left: Spacing.sm, paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.pill, backgroundColor: 'rgba(18,26,51,0.66)' },
  profileReviewIdentity: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingBottom: Spacing.md },
  profileReviewAvatar: { width: 72, height: 72, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', marginTop: -28, borderWidth: 3, borderColor: Colors.surface, borderRadius: 36, backgroundColor: Colors.accent },
  profileReviewNote: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.md, textAlign: 'center' },
  cropActions: { width: '100%', flexDirection: 'row', gap: Spacing.sm },
});
