import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { PhotoCropDialog } from '@/components/photo-crop-dialog';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, router, useLocalSearchParams, type ErrorBoundaryProps } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  getCategory,
  getTheme,
  levelFromXp,
  questionsOf,
  themeTitleForLevel,
  type ChallengeView,
  type PostView,
  type ThemeInfo,
} from '@qu1z/shared';

import { Composer } from '@/components/composer';
import { LeaderboardPanel } from '@/components/leaderboard-panel';
import { PlayMenuDialog } from '@/components/play-menu-dialog';
import { UserRow } from '@/components/player-row';
import { PostCard } from '@/components/post-card';
import { OutcomeBar } from '@/components/profile-view';
import { DivisionBadge } from '@/components/social';
import { AppText, Button, Card, ProgressBar, Stat } from '@/components/ui';
import { Colors, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { themeCover } from '@/game/theme-covers';
import { mediaUri } from '@/net/media';
import { api, apiBase, errorMessage, TOKEN_KEY, useApi } from '@/net/api';
import { useThemeStats } from '@/state/progress';
import { useGameServer } from '@/state/game-server';
import { formatCount } from '@/utils/format';
import { Tap } from '@/components/tap';
import { pickImage, type PickedImage } from '@/net/media';

/** Page de thème, comme la maquette validée : haut bleu nuit traversé d'une vague rose, puis fond clair. */
const Page = {
  background: '#F6F5F8',
  surface: '#FFFFFF',
  soft: '#F7F3F5',
  pink: '#E8146C',
  navy: '#0B1630',
  play: ['#F52A7E', '#E0105E'],
} as const;

/** Hauteur du haut sombre (sous la barre d'état), jusque sous les boutons. */
const HERO_HEIGHT = 450;
const ICON_SIZE = 112;

type Tab = 'feed' | 'quiz' | 'challenges' | 'ranking';
const TABS: { value: Tab; label: string }[] = [
  { value: 'feed', label: "Fil d'actualité" },
  { value: 'quiz', label: 'Quiz' },
  { value: 'challenges', label: 'Défis' },
  { value: 'ranking', label: 'Classement' },
];

export default function ThemeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { refreshThemeCatalog } = useGameServer();
  const insets = useSafeAreaInsets();
  const theme = getTheme(id);
  const stats = useThemeStats(id);
  const questionCoverage = useApi<{ seenQuestions: number }>(theme ? '/api/me/themes/' + theme.id + '/question-progress' : null);
  const totalQuestions = theme ? questionsOf(theme.id).length || (theme.questionCount ?? 0) : 0;
  const seenQuestions = questionCoverage.data?.seenQuestions ?? 0;
  const questionProgress = totalQuestions > 0 ? Math.min(seenQuestions / totalQuestions, 1) : 0;
  const info = useApi<{ themes: ThemeInfo[] }>('/api/themes');
  const themeInfo = info.data?.themes.find((t) => t.themeId === theme?.id);
  const subscribed = themeInfo?.subscribed ?? false;
  // Le fil n'est chargé (et visible) qu'une fois le thème suivi.
  const posts = useApi<{ posts: PostView[] }>(theme && subscribed ? `/api/themes/${theme.id}/posts` : null);
  const [tab, setTab] = useState<Tab>('feed');
  const [playMenuOpen, setPlayMenuOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [assetEditorOpen, setAssetEditorOpen] = useState(false);
  const [iconDraft, setIconDraft] = useState<PickedImage | null>(null);
  const [coverDraft, setCoverDraft] = useState<PickedImage | null>(null);
  const [pendingThemeImage, setPendingThemeImage] = useState<{ kind: 'icon' | 'cover'; image: PickedImage } | null>(null);
  const [assetBusy, setAssetBusy] = useState(false);
  const [assetMessage, setAssetMessage] = useState<string | null>(null);
  const me = useApi<{ role: string }>('/api/me');
  const canEditThemeImages = me.data?.role === 'admin';
  if (!theme) return <Redirect href="/" />;
  const category = getCategory(theme.categoryId)!;
  const toggleSubscription = () =>
    api(subscribed ? 'DELETE' : 'PUT', `/api/themes/${theme.id}/subscription`).catch(() => {});
  const editThemeImages = () => {
    setMenuOpen(false);
    setIconDraft(null);
    setCoverDraft(null);
    setAssetMessage(null);
    setAssetEditorOpen(true);
  };
  const chooseThemeImage = async (kind: 'icon' | 'cover') => {
    try {
      const image = await pickImage('library', { allowsEditing: false });
      if (image) setPendingThemeImage({ kind, image });
    } catch (error) {
      setAssetMessage(errorMessage(error));
    }
  };
  const saveThemeImages = async () => {
    if (!iconDraft && !coverDraft) return setAssetMessage('Choisis au moins une image à remplacer.');
    setAssetBusy(true);
    setAssetMessage(null);
    try {
      const token = await AsyncStorage.getItem(TOKEN_KEY);
      if (!token) throw new Error('not_connected');
      for (const [kind, image] of [['icon', iconDraft], ['cover', coverDraft]] as const) {
        if (!image) continue;
        const blob = await (await fetch(image.uri)).blob();
        const response = await fetch(`${apiBase()}/api/admin/themes/${theme.id}/${kind}`, {
          method: 'PUT',
          headers: { authorization: `Bearer ${token}`, 'content-type': image.mimeType ?? blob.type ?? 'application/octet-stream' },
          body: blob,
        });
        const result = await response.json().catch(() => ({})) as { error?: string };
        if (!response.ok) throw new Error(result.error ?? 'error');
      }
      await refreshThemeCatalog();
      setAssetEditorOpen(false);
      setIconDraft(null);
      setCoverDraft(null);
      setAssetMessage(null);
    } catch (error) {
      setAssetMessage(errorMessage(error));
    } finally {
      setAssetBusy(false);
    }
  };
  const openLeaderboard = () => router.push({ pathname: '/leaderboard', params: { theme: theme.id } });
  const duel = (mode?: 'pvp') =>
    router.push({ pathname: '/duel/[themeId]', params: mode ? { themeId: theme.id, mode } : { themeId: theme.id } });

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl }} showsVerticalScrollIndicator={false}>
        <HeroBackground themeId={theme.id} height={HERO_HEIGHT + insets.top} />
        <View style={[styles.column, { paddingTop: insets.top + 120 }]}>
          <View style={styles.hero}>
            <View style={[styles.icon, { backgroundColor: category.color }]}>
              <LinearGradient colors={['rgba(255,255,255,0.3)', 'rgba(255,255,255,0)']} style={StyleSheet.absoluteFill} />
              {theme.iconUrl ? <Image source={{ uri: mediaUri(theme.iconUrl) ?? theme.iconUrl }} contentFit="cover" style={StyleSheet.absoluteFill} /> : <AppText style={styles.iconEmoji}>{category.icon}</AppText>}
            </View>
            <AppText style={styles.name}>{theme.name}</AppText>
            <AppText style={styles.tagline}>{theme.description}</AppText>

            <View style={styles.actions}>
              <Tap accessibilityRole="button" accessibilityLabel="Ouvrir le menu de jeu" onPress={() => setPlayMenuOpen(true)} style={styles.playWrap}>
                <LinearGradient colors={Page.play} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.play}>
                  <Ionicons name="play" size={20} color="#FFFFFF" />
                  <AppText style={styles.playLabel}>Jouer</AppText>
                </LinearGradient>
              </Tap>
              <SoftButton icon={<Ionicons name="trophy-outline" size={21} color={Colors.text} />} label="Classement" onPress={() => setTab('ranking')} grow={1.15} />
              <SoftButton
                icon={<Ionicons name={subscribed ? 'checkmark' : 'add'} size={22} color={Colors.text} />}
                label={subscribed ? 'Suivi' : 'Suivre'}
                onPress={toggleSubscription}
                grow={0.9}
              />
            </View>

            <View style={styles.questionProgress}>
              <View style={styles.questionProgressHeading}>
                <View style={styles.questionProgressLabel}>
                  <Ionicons name="help-circle-outline" size={20} color={Page.pink} />
                  <AppText style={styles.questionLabel}>Questions rencontrées</AppText>
                </View>
                <AppText style={styles.questionCount}>
                  {questionCoverage.data ? formatCount(seenQuestions) : '–'} / {formatCount(totalQuestions)}
                </AppText>
              </View>
              <View
                style={styles.questionTrack}
                accessible
                accessibilityLabel={`${seenQuestions} questions distinctes rencontrées sur ${totalQuestions} questions disponibles`}>
                <View style={[styles.questionFill, { width: (Math.round(questionProgress * 100) + '%') }]} />
              </View>
            </View>
          </View>

          <View style={styles.tabs} accessibilityRole="tablist">
            {TABS.map((t) => {
              const active = t.value === tab;
              return (
                <Tap key={t.value} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => setTab(t.value)} style={styles.tab}>
                  <AppText style={[styles.tabLabel, active && styles.tabLabelActive]} numberOfLines={1}>
                    {t.label}
                  </AppText>
                  {active && <View style={styles.underline} />}
                </Tap>
              );
            })}
          </View>

          <View style={styles.body}>
            {tab === 'feed' &&
              (subscribed ? (
                <FeedTab themeId={theme.id} themeName={theme.name} posts={posts.data?.posts ?? []} />
              ) : (
                <LockedFeed loading={!info.data} onFollow={toggleSubscription} />
              ))}
            {tab === 'quiz' && <QuizTab themeId={theme.id} categoryColor={category.color} onDuel={duel} onOpenPlay={() => setPlayMenuOpen(true)} />}
            {tab === 'challenges' && <ChallengesTab themeId={theme.id} />}
            {tab === 'ranking' && (
              <>
                <LeaderboardPanel themeId={theme.id} limit={10} />
                <Button label="Voir tout le classement" variant="outline" color={Colors.text} onPress={openLeaderboard} />
              </>
            )}
          </View>
        </View>
      </ScrollView>

      <View style={[styles.topBar, { top: insets.top + Spacing.sm }]}>
        <Tap accessibilityRole="button" accessibilityLabel="Retour" hitSlop={12} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={styles.topButton}>
          <Ionicons name="chevron-back" size={28} color="#FFFFFF" />
        </Tap>
        <Tap accessibilityRole="button" accessibilityLabel="Plus d'options" hitSlop={12} onPress={() => setMenuOpen((o) => !o)} style={styles.topButton}>
          <Ionicons name="ellipsis-horizontal" size={26} color="#FFFFFF" />
        </Tap>
      </View>
      {menuOpen && (
        <View style={[styles.menu, { top: insets.top + 56 }]}>
          <MenuItem
            label="Classement complet"
            onPress={() => {
              setMenuOpen(false);
              openLeaderboard();
            }}
          />
          <MenuItem
            label="Duel d'entraînement (bot)"
            onPress={() => {
              setMenuOpen(false);
              duel();
            }}
          />
          <MenuItem
            label={subscribed ? 'Ne plus suivre ce thème' : 'Suivre ce thème'}
            onPress={() => {
              setMenuOpen(false);
              toggleSubscription();
            }}
          />
          {canEditThemeImages && <MenuItem label="Modifier l’icône et la couverture" onPress={editThemeImages} />}
        </View>
      )}
      <Modal visible={assetEditorOpen && !pendingThemeImage} transparent animationType="fade" onRequestClose={() => setAssetEditorOpen(false)}>
        <View style={styles.modalShade}>
          <View style={styles.assetEditor}>
            <AppText variant="heading">Images du thème</AppText>
            <AppText variant="caption" muted>Choisis une nouvelle icône ou couverture. Chaque aperçu sera visible avant l’enregistrement.</AppText>
            <View style={styles.assetChoices}>
              <View style={styles.assetChoice}>
                <AppText variant="label">Icône carrée</AppText>
                {(iconDraft?.uri || theme.iconUrl) ? <Image source={{ uri: iconDraft?.uri ?? (mediaUri(theme.iconUrl) ?? undefined) }} contentFit="cover" style={styles.assetIconPreview} /> : <View style={styles.assetIconPreview} />}
                <Button small label={iconDraft ? 'Changer' : 'Choisir'} variant="outline" onPress={() => void chooseThemeImage('icon')} />
              </View>
              <View style={[styles.assetChoice, { flex: 1 }]}>
                <AppText variant="label">Couverture</AppText>
                {(coverDraft?.uri || theme.coverUrl) ? <Image source={{ uri: coverDraft?.uri ?? (mediaUri(theme.coverUrl) ?? undefined) }} contentFit="cover" style={styles.assetCoverPreview} /> : <View style={styles.assetCoverPreview} />}
                <Button small label={coverDraft ? 'Changer' : 'Choisir'} variant="outline" onPress={() => void chooseThemeImage('cover')} />
              </View>
            </View>
            {assetMessage && <AppText color={Colors.wrong}>{assetMessage}</AppText>}
            <View style={styles.assetActions}>
              <Button small label="Annuler" variant="outline" onPress={() => setAssetEditorOpen(false)} />
              <Button small label={assetBusy ? 'Enregistrement…' : 'Enregistrer'} disabled={assetBusy} onPress={() => void saveThemeImages()} />
            </View>
          </View>
        </View>
      </Modal>
      <PhotoCropDialog
        visible={!!pendingThemeImage}
        image={pendingThemeImage?.image ?? null}
        subtitle={pendingThemeImage?.kind === 'icon' ? 'Icône du thème « ' + theme.name + ' »' : 'Couverture du thème « ' + theme.name + ' »'}
        aspect={pendingThemeImage?.kind === 'cover' ? [3, 1] : [1, 1]}
        busy={assetBusy}
        onCancel={() => !assetBusy && setPendingThemeImage(null)}
        onConfirm={(image) => {
          if (pendingThemeImage?.kind === 'icon') setIconDraft(image);
          if (pendingThemeImage?.kind === 'cover') setCoverDraft(image);
          setPendingThemeImage(null);
        }}
      />
      <PlayMenuDialog
        themeId={theme.id}
        themeName={theme.name}
        visible={playMenuOpen}
        onClose={() => setPlayMenuOpen(false)}
        onPlay={(mode) => duel(mode)}
      />
    </View>
  );
}

/** Évite qu'une erreur de chargement du thème ne laisse un écran noir sans action possible. */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <View style={styles.errorScreen}>
      <AppText variant="heading">Ce thème ne s’est pas chargé</AppText>
      <AppText muted style={{ textAlign: 'center' }}>
        Vérifie ta connexion puis réessaie.
      </AppText>
      <AppText muted style={styles.errorDetail} selectable>
        {error.message}
      </AppText>
      <Button label="Réessayer" onPress={() => void retry()} />
    </View>
  );
}

/**
 * Haut de la page : bleu nuit, points décoratifs, image du thème en haut à droite, vague rose qui
 * descend vers la gauche, puis fondu vers le fond clair sous les boutons.
 */
function HeroBackground({ themeId, height }: { themeId: string; height: number }) {
  const cover = themeCover(themeId);
  // Les require() d'assets sont des nombres sur natif, mais Metro Web peut fournir un objet
  // { uri, ... }. Seules les URL dynamiques doivent passer par mediaUri().
  const coverSource = typeof cover === 'string' ? { uri: mediaUri(cover) ?? cover } : cover;
  return (
    <View pointerEvents="none" style={[styles.heroBg, { height }]}>
      {coverSource !== null && <Image source={coverSource} contentFit="cover" style={StyleSheet.absoluteFill} accessibilityIgnoresInvertColors />}
      <LinearGradient
        colors={['rgba(5,10,24,0.18)', 'rgba(5,10,24,0.34)', Page.background]}
        locations={[0, 0.58, 1]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}
function SoftButton({ icon, label, onPress, grow }: { icon: ReactNode; label: string; onPress: () => void; grow: number }) {
  return (
    <Tap accessibilityRole="button" onPress={onPress} style={[styles.soft, { flex: grow }]}>
      {icon}
      <AppText style={styles.softLabel} numberOfLines={1}>
        {label}
      </AppText>
    </Tap>
  );
}

function MenuItem({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Tap accessibilityRole="menuitem" onPress={onPress} style={styles.menuItem}>
      <AppText variant="label">{label}</AppText>
    </Tap>
  );
}

/** Fil cadenassé : visible seulement par les abonnés du thème. */
function LockedFeed({ loading, onFollow }: { loading: boolean; onFollow: () => void }) {
  if (loading) return null;
  return (
    <View style={styles.locked}>
      <View style={styles.lockIcon}>
        <Ionicons name="lock-closed" size={30} color={Page.pink} />
      </View>
      <AppText style={styles.lockedTitle}>Fil réservé aux abonnés</AppText>
      <AppText muted style={{ textAlign: 'center' }}>
        Suis ce thème pour voir toutes ses publications, publier des photos et des stickers, aimer et commenter.
      </AppText>
      <Tap accessibilityRole="button" onPress={onFollow} style={styles.lockedButton}>
        <LinearGradient colors={Page.play} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.lockedButtonFill}>
          <Ionicons name="add" size={22} color="#FFFFFF" />
          <AppText style={styles.playLabel}>Suivre ce thème</AppText>
        </LinearGradient>
      </Tap>
    </View>
  );
}

function FeedTab({ themeId, themeName, posts }: { themeId: string; themeName: string; posts: PostView[] }) {
  return (
    <>
      <Composer target={{ kind: 'theme', themeId }} placeholder={`Écris dans le fil « ${themeName} »…`} />
      {posts.map((post) => (
        <PostCard key={post.id} post={post} showTheme={false} />
      ))}
      {posts.length === 0 && (
        <AppText muted style={{ textAlign: 'center' }}>
          Personne n'a encore publié ici.
        </AppText>
      )}
    </>
  );
}

function QuizTab({ themeId, categoryColor, onDuel, onOpenPlay }: { themeId: string; categoryColor: string; onDuel: (mode?: 'pvp') => void; onOpenPlay: () => void }) {
  const stats = useThemeStats(themeId);
  const level = levelFromXp(stats.xp);
  const precision = stats.answered ? Math.round((stats.correct / stats.answered) * 100) : 0;
  const avgTime = stats.correct ? (stats.totalCorrectResponseMs / stats.correct / 1000).toFixed(1) : '–';
  return (
    <>
      <Card>
        <View style={styles.levelRow}>
          <AppText variant="heading">Niveau {level.level}</AppText>
          <AppText variant="label" color={categoryColor}>
            {themeTitleForLevel(themeId, level.level)}
          </AppText>
        </View>
        <ProgressBar progress={level.progress} color={Page.pink} />
        <AppText variant="caption" muted>
          {level.current} / {level.needed} XP avant le niveau {level.level + 1}
        </AppText>
        <DivisionBadge rating={stats.rating} />
      </Card>
      <Card style={{ flexDirection: 'row' }}>
        <Stat label="Duels" value={String(stats.duels)} />
        <Stat label="Victoires" value={String(stats.wins)} />
        <Stat label="Précision" value={`${precision} %`} />
        <Stat label="Temps moyen" value={avgTime === '–' ? avgTime : `${avgTime} s`} />
      </Card>
      <Card>
        <OutcomeBar wins={stats.wins} draws={stats.draws} losses={stats.duels - stats.wins - stats.draws} />
      </Card>
      <Button label="Jouer" color={Page.pink} onPress={onOpenPlay} />
      <Button label="Duel d'entraînement (bot)" variant="outline" color={Colors.text} onPress={() => onDuel()} />
      <AppText variant="caption" muted style={{ textAlign: 'center' }}>
        {questionsOf(themeId).length || getTheme(themeId)?.questionCount} questions · 7 par duel · 10 s par question
      </AppText>
    </>
  );
}

function ChallengesTab({ themeId }: { themeId: string }) {
  const challenges = useApi<{ challenges: ChallengeView[] }>('/api/challenges');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const list = (challenges.data?.challenges ?? []).filter((c) => c.themeId === themeId);
  const act = (path: string) => {
    setMessage(null);
    api('POST', path).catch((e) => setMessage({ ok: false, text: errorMessage(e) }));
  };
  return (
    <>
      {message && <AppText color={message.ok ? Colors.correct : Colors.wrong}>{message.text}</AppText>}
      {list.map((c) =>
        c.incoming ? (
          <UserRow
            key={c.id}
            user={c.from}
            subtitle={c.kind === 'rematch' ? 'Te propose une revanche' : 'Te défie'}
            right={
              <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                <Button label="Refuser" variant="outline" color={Colors.textMuted} onPress={() => act(`/api/challenges/${c.id}/decline`)} />
                <Button label="Jouer" color={Page.pink} onPress={() => act(`/api/challenges/${c.id}/accept`)} />
              </View>
            }
          />
        ) : (
          <UserRow
            key={c.id}
            user={c.to}
            subtitle="Défi envoyé · en attente"
            right={<Button label="Annuler" variant="outline" color={Colors.textMuted} onPress={() => act(`/api/challenges/${c.id}/cancel`)} />}
          />
        ),
      )}
      {list.length === 0 && (
        <View style={styles.note}>
          <AppText muted style={{ textAlign: 'center' }}>
            Aucun défi sur ce thème. Défie un joueur depuis son profil ou depuis le classement.
          </AppText>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Page.background },
  errorScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md, padding: Spacing.lg, backgroundColor: Page.background },
  errorDetail: { maxWidth: 520, textAlign: 'center', fontSize: 12 },
  heroBg: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: Page.navy, overflow: 'hidden' },
  column: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  hero: { alignItems: 'center', paddingHorizontal: Spacing.md },
  icon: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    boxShadow: '0 8px 22px rgba(0, 0, 0, 0.35)',
  },
  iconEmoji: { fontSize: 60, lineHeight: 72 },
  name: { marginTop: Spacing.md, paddingTop: 2, fontSize: 30, lineHeight: 40, fontWeight: '800', letterSpacing: -0.6, color: '#FFFFFF', textAlign: 'center' },
  tagline: { marginTop: Spacing.xs, fontSize: 17, color: 'rgba(255,255,255,0.88)', textAlign: 'center' },
  actions: { flexDirection: 'row', gap: Spacing.xs, marginTop: Spacing.md, alignSelf: 'stretch' },
  playWrap: { flex: 1.1, borderRadius: 26, boxShadow: '0 8px 18px rgba(232, 20, 108, 0.38)' },
  play: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.xs, height: 40, borderRadius: 22 },
  playLabel: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  soft: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    height: 40,
    paddingHorizontal: Spacing.sm,
    borderRadius: 26,
    backgroundColor: Page.soft,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
    boxShadow: '0 4px 12px rgba(18, 26, 51, 0.12)',
  },
  softLabel: { fontSize: 14, fontWeight: '700', color: Colors.text },
  questionProgress: {
    alignSelf: 'stretch',
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    gap: Spacing.xs,
    backgroundColor: Page.surface,
    borderRadius: Radius.md,
    boxShadow: '0 4px 16px rgba(18, 26, 51, 0.08)',
  },
  questionProgressHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  questionProgressLabel: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  questionLabel: { fontSize: 14, color: Colors.text, fontWeight: '700' },
  questionCount: { fontSize: 15, color: Colors.text, fontWeight: '800' },
  questionTrack: { height: 4, borderRadius: Radius.pill, overflow: 'hidden', backgroundColor: '#E8E7EC' },
  questionFill: { height: '100%', borderRadius: Radius.pill, backgroundColor: Page.pink },
  tabs: {
    flexDirection: 'row',
    marginTop: Spacing.lg,
    marginHorizontal: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#E6E3E8',
  },
  tab: { flexGrow: 1, alignItems: 'center', paddingHorizontal: 2, paddingBottom: Spacing.sm + 2 },
  tabLabel: { fontSize: 15, fontWeight: '700', color: '#9A97A0' },
  tabLabelActive: { color: '#0F0F14', fontWeight: '800' },
  underline: { position: 'absolute', bottom: -1, left: 6, right: 6, height: 4, borderRadius: 2, backgroundColor: Page.pink },
  body: { gap: Spacing.md, padding: Spacing.md },
  note: { backgroundColor: Page.surface, borderRadius: Radius.md, padding: Spacing.md, boxShadow: '0 2px 12px rgba(18, 26, 51, 0.06)' },
  levelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  locked: {
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Page.surface,
    borderRadius: Radius.md,
    padding: Spacing.lg,
    boxShadow: '0 4px 16px rgba(18, 26, 51, 0.08)',
  },
  lockIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FDE7F0' },
  lockedTitle: { fontSize: 19, fontWeight: '800', color: '#0F0F14', textAlign: 'center' },
  lockedButton: { alignSelf: 'stretch', marginTop: Spacing.sm, borderRadius: 26, boxShadow: '0 8px 18px rgba(232, 20, 108, 0.3)' },
  lockedButtonFill: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, height: 52, borderRadius: 26 },
  topBar: { position: 'absolute', left: Spacing.md, right: Spacing.md, flexDirection: 'row', justifyContent: 'space-between' },
  topButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(5, 10, 24, 0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  menu: {
    position: 'absolute',
    right: Spacing.md,
    backgroundColor: Page.surface,
    borderRadius: Radius.sm,
    paddingVertical: Spacing.xs,
    boxShadow: '0 8px 24px rgba(18, 26, 51, 0.18)',
  },
  menuItem: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 4 },
  modalShade: { flex: 1, justifyContent: 'center', padding: Spacing.md, backgroundColor: 'rgba(10, 12, 25, 0.56)' },
  assetEditor: { width: '100%', maxWidth: 520, alignSelf: 'center', gap: Spacing.sm, padding: Spacing.md, backgroundColor: Page.surface, borderRadius: Radius.md },
  assetChoices: { flexDirection: 'row', gap: Spacing.md, alignItems: 'flex-start' },
  assetChoice: { gap: Spacing.xs, alignItems: 'flex-start' },
  assetIconPreview: { width: 88, height: 88, borderRadius: 16, backgroundColor: Colors.surfaceRaised },
  assetCoverPreview: { width: '100%', height: 88, borderRadius: 12, backgroundColor: Colors.surfaceRaised },
  assetActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.sm, marginTop: Spacing.xs },
});
