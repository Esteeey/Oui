import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Image } from 'expo-image';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { ScrollView, Share, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { getCategory, levelFromXp, questionsOf, themesOf, type CategoryId, type Theme } from '@qu1z/shared';

import { AppNavBar, useNavBarHeight } from '@/components/app-nav-bar';
import { LeaderboardPanel } from '@/components/leaderboard-panel';
import { PlayMenuDialog } from '@/components/play-menu-dialog';
import { Chip } from '@/components/social';
import { Tap } from '@/components/tap';
import { ThemeIcon } from '@/components/theme-icon';
import { AppText, Button } from '@/components/ui';
import { Colors, Fonts, MaxContentWidth, Radius, Shadow, Spacing } from '@/constants/theme';
import { categoryHero, themeCardArt } from '@/game/theme-covers';
import { useApi } from '@/net/api';
import { useProgress } from '@/state/progress';
import { useThemeInfos } from '@/state/themes';
import { formatCount } from '@/utils/format';

/** Proportions de la maquette : haut de page, dôme et icône, rapportés à la largeur. */
const HERO_RATIO = 330 / 923;
const DOME_RATIO = 80 / 923;
const ICON_RATIO = 195 / 923;
const ICON_BOTTOM_RATIO = 38 / 923;
const PINK = Colors.accent;
const LEVEL_PILL = '#DCD0F7';
const TRACK = '#D9D6E0';

type Tab = 'themes' | 'ranking' | 'about';
type Sort = 'name' | 'level' | 'popular';
const SORTS: { value: Sort; label: string }[] = [
  { value: 'name', label: 'A à Z' },
  { value: 'level', label: 'Mon niveau' },
  { value: 'popular', label: 'Populaires' },
];

const plural = (n: number, word: string) => `${formatCount(n)} ${word}${n > 1 ? 's' : ''}`;
const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function CategoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const category = getCategory(id);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const navHeight = useNavBarHeight();
  const { stats } = useProgress();
  const infos = useThemeInfos();
  const [tab, setTab] = useState<Tab>('themes');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('name');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [playing, setPlaying] = useState<Theme | null>(null);
  const [rankedThemeId, setRankedThemeId] = useState<string | null>(null);

  const themes = useMemo(() => (category ? themesOf(category.id as CategoryId) : []), [category]);
  const levelOf = (themeId: string) => levelFromXp(stats[themeId]?.xp ?? 0).level;
  const q = fold(query.trim());
  const shown = themes
    .filter((theme) => !q || fold(theme.name).includes(q) || fold(theme.description).includes(q))
    .sort((a, b) => {
      if (sort === 'level' && levelOf(a.id) !== levelOf(b.id)) return levelOf(b.id) - levelOf(a.id);
      const popularity = (infos.get(b.id)?.subscribers ?? 0) - (infos.get(a.id)?.subscribers ?? 0);
      if (sort === 'popular' && popularity) return popularity;
      return a.name.localeCompare(b.name, 'fr');
    });

  if (!category) return <Redirect href="/" />;

  const pageWidth = Math.min(width, MaxContentWidth);
  const heroHeight = pageWidth * HERO_RATIO + Math.max(insets.top - 30, 0);
  const iconSize = Math.round(pageWidth * ICON_RATIO);
  const iconTop = heroHeight - pageWidth * ICON_BOTTOM_RATIO - iconSize;
  /** Cumul des abonnés des thèmes de la catégorie : une catégorie ne se suit pas. */
  const subscribers = themes.reduce((sum, theme) => sum + (infos.get(theme.id)?.subscribers ?? 0), 0);
  const subscribersKnown = infos.size > 0;
  const bestLevel = themes.reduce((best, theme) => Math.max(best, levelOf(theme.id)), 1);
  const totalQuestions = themes.reduce((sum, theme) => sum + (questionsOf(theme.id).length || (theme.questionCount ?? 0)), 0);
  const unplayed = themes.filter((theme) => !(stats[theme.id]?.xp ?? 0));
  const rankedId = rankedThemeId ?? themes[0]?.id;

  const share = () => Share.share({ message: `Viens jouer aux quiz ${category.name} sur QuizX !` }).catch(() => {});
  const suggest = () => {
    const pool = unplayed.length ? unplayed : themes;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    if (pick) router.push({ pathname: '/theme/[id]', params: { id: pick.id } });
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ alignItems: 'center', paddingBottom: navHeight + Spacing.lg }} showsVerticalScrollIndicator={false}>
        <View style={{ width: pageWidth }}>
          <View style={{ height: heroHeight }}>
            <Image source={categoryHero(category.id)} contentFit="cover" style={StyleSheet.absoluteFill} accessibilityIgnoresInvertColors />
            <View style={[styles.dome, { height: pageWidth * DOME_RATIO }]} pointerEvents="none">
              <Svg width="100%" height="100%" viewBox="0 0 923 80" preserveAspectRatio="none">
                <Path d="M0 80 L0 70 Q461.5 -70 923 70 L923 80 Z" fill={Colors.background} />
              </Svg>
            </View>
            <View style={[styles.icon, { top: iconTop, width: iconSize, height: iconSize, borderRadius: iconSize * 0.25 }]}>
              <AppText style={{ fontSize: iconSize * 0.56, lineHeight: iconSize * 0.8 }}>{category.icon}</AppText>
            </View>
          </View>

          <View style={styles.body}>
            <View style={styles.titleRow}>
              <AppText style={styles.title} numberOfLines={1} adjustsFontSizeToFit>
                {category.name}
              </AppText>
              <MaterialIcons name="verified" size={25} color={PINK} accessibilityLabel="Catégorie officielle" />
            </View>
            <AppText style={styles.description}>{category.description}</AppText>

            <View style={styles.stats}>
              <Stat icon={<Ionicons name="people-outline" size={19} color={PINK} />} color={PINK} label={subscribersKnown ? plural(subscribers, 'abonné') : '–'} />
              <View style={styles.statDivider} />
              <Stat icon={<Ionicons name="bar-chart-outline" size={19} color={PINK} />} label={plural(themes.length, 'thème')} />
              <View style={styles.statDivider} />
              <Stat icon={<Ionicons name="ribbon-outline" size={19} color={PINK} />} label={`Niv. ${bestLevel}`} />
            </View>

            <View style={styles.tabs} accessibilityRole="tablist">
              <TabPill active={tab === 'themes'} grow={1.15} label={`Thèmes (${themes.length})`} icon="trophy-outline" onPress={() => setTab('themes')} />
              <TabPill active={tab === 'ranking'} grow={1.05} label="Classement" icon="trophy-outline" onPress={() => setTab('ranking')} />
              <TabPill active={tab === 'about'} grow={1} label="À propos" icon="information-circle-outline" onPress={() => setTab('about')} />
            </View>

            {tab === 'themes' && (
              <>
                <View style={styles.searchRow}>
                  <View style={styles.search}>
                    <Ionicons name="search-outline" size={19} color={Colors.text} />
                    <TextInput
                      value={query}
                      onChangeText={setQuery}
                      placeholder={`Rechercher un thème dans ${category.name}...`}
                      placeholderTextColor={Colors.text}
                      accessibilityLabel={`Rechercher un thème dans ${category.name}`}
                      style={styles.searchInput}
                    />
                  </View>
                  <Tap accessibilityRole="button" accessibilityLabel="Trier les thèmes" accessibilityState={{ expanded: filtersOpen }} onPress={() => setFiltersOpen((open) => !open)} style={styles.round}>
                    <Ionicons name="options-outline" size={21} color={Colors.text} />
                  </Tap>
                  <Tap accessibilityRole="button" accessibilityLabel="Me proposer un thème" onPress={suggest} style={styles.round}>
                    <Ionicons name="bulb-outline" size={21} color={PINK} />
                    {unplayed.length > 0 && <View style={styles.dot} />}
                  </Tap>
                </View>

                {filtersOpen && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 6 }}>
                    {SORTS.map((option) => (
                      <Chip key={option.value} label={option.label} active={sort === option.value} onPress={() => setSort(option.value)} />
                    ))}
                  </ScrollView>
                )}

                <View style={styles.list}>
                  {shown.map((theme) => (
                    <ThemeCard key={theme.id} theme={theme} level={levelOf(theme.id)} subscribers={infos.get(theme.id)?.subscribers ?? 0} onPlay={() => setPlaying(theme)} />
                  ))}
                </View>

                <AppText style={styles.footer}>{shown.length ? "D'autres thèmes arrivent bientôt dans cette catégorie." : 'Aucun thème ne correspond à ta recherche.'}</AppText>
              </>
            )}

            {tab === 'ranking' && rankedId && (
              <View style={styles.tabBody}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 6 }}>
                  {themes.map((theme) => (
                    <Chip key={theme.id} label={theme.name} active={rankedId === theme.id} onPress={() => setRankedThemeId(theme.id)} />
                  ))}
                </ScrollView>
                <LeaderboardPanel themeId={rankedId} limit={10} />
                <Button label="Voir tout le classement" variant="outline" color={Colors.text} onPress={() => router.push({ pathname: '/leaderboard', params: { theme: rankedId } })} />
              </View>
            )}

            {tab === 'about' && (
              <View style={styles.about}>
                <AppText style={styles.aboutText}>{category.description}</AppText>
                <AboutRow label="Thèmes" value={formatCount(themes.length)} />
                <AboutRow label="Questions" value={formatCount(totalQuestions)} />
                <AboutRow label="Abonnés" value={subscribersKnown ? formatCount(subscribers) : '–'} />
                <AboutRow label="Ton meilleur niveau" value={`Niv. ${bestLevel}`} />
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      <View style={[styles.topBar, { top: Math.max(insets.top + 6, 12), width: pageWidth }]} pointerEvents="box-none">
        <Tap accessibilityRole="button" accessibilityLabel="Retour" hitSlop={10} onPress={() => (router.canGoBack() ? router.back() : router.replace('/explore'))} style={styles.topButton}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </Tap>
        <Tap accessibilityRole="button" accessibilityLabel={`Partager ${category.name}`} hitSlop={10} onPress={share} style={styles.topButton}>
          <Ionicons name="share-social-outline" size={22} color={Colors.text} />
        </Tap>
      </View>

      <AppNavBar />
      <PlayMenuDialog
        themeId={playing?.id ?? ''}
        themeName={playing?.name ?? ''}
        visible={!!playing}
        onClose={() => setPlaying(null)}
        onPlay={(mode) => {
          if (!playing) return;
          const themeId = playing.id;
          setPlaying(null);
          router.push({ pathname: '/duel/[themeId]', params: mode ? { themeId, mode } : { themeId } });
        }}
      />
    </View>
  );
}

function Stat({ icon, label, color }: { icon: ReactNode; label: string; color?: string }) {
  return (
    <View style={styles.stat}>
      {icon}
      <AppText style={[styles.statLabel, color ? { color } : null]} numberOfLines={1}>
        {label}
      </AppText>
    </View>
  );
}

function TabPill({ active, grow, label, icon, onPress }: { active: boolean; grow: number; label: string; icon: 'trophy-outline' | 'information-circle-outline'; onPress: () => void }) {
  return (
    <Tap accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={onPress} style={[styles.tab, { flex: grow }, active && styles.tabActive]}>
      <Ionicons name={icon} size={17} color={active ? Colors.onAccent : Colors.text} />
      <AppText style={[styles.tabLabel, active && { color: Colors.onAccent }]} numberOfLines={1} adjustsFontSizeToFit>
        {label}
      </AppText>
    </Tap>
  );
}

function ThemeCard({ theme, level, subscribers, onPlay }: { theme: Theme; level: number; subscribers: number; onPlay: () => void }) {
  const coverage = useApi<{ seenQuestions: number }>(`/api/me/themes/${theme.id}/question-progress`);
  const total = questionsOf(theme.id).length || (theme.questionCount ?? 0);
  const seen = coverage.data?.seenQuestions ?? 0;
  const percent = total > 0 ? Math.min(Math.round((seen / total) * 100), 100) : 0;
  const art = themeCardArt(theme.id);
  return (
    <View style={styles.card}>
      {/* Zone cliquable derrière le contenu : un bouton ne peut pas en contenir un autre sur le site. */}
      <Tap accessibilityRole="button" accessibilityLabel={`${theme.name}, niveau ${level}`} onPress={() => router.push({ pathname: '/theme/[id]', params: { id: theme.id } })} style={[StyleSheet.absoluteFill, styles.cardHit]} />
      <View pointerEvents="none" style={styles.art}>{art ? <Image source={art} contentFit="cover" style={StyleSheet.absoluteFill} /> : <ThemeIcon themeId={theme.id} size={82} />}</View>
      <View pointerEvents="box-none" style={styles.cardBody}>
        <View pointerEvents="none" style={styles.cardTop}>
          <AppText style={styles.cardTitle} numberOfLines={1}>
            {theme.name}
          </AppText>
          <View style={styles.levelPill}>
            <AppText style={styles.levelText}>Niv. {level}</AppText>
          </View>
        </View>
        <View pointerEvents="box-none" style={styles.cardMiddle}>
          <View pointerEvents="none" style={styles.cardText}>
            <AppText style={styles.cardDescription} numberOfLines={2}>
              {theme.description}
            </AppText>
            <View style={styles.cardSubscribers}>
              <Ionicons name="people-outline" size={15} color={Colors.text} />
              <AppText style={styles.cardSubscribersText}>{plural(subscribers, 'abonné')}</AppText>
            </View>
          </View>
          <Tap accessibilityRole="button" accessibilityLabel={`Jouer à ${theme.name}`} onPress={onPlay} style={styles.play}>
            <Ionicons name="play" size={14} color={PINK} />
            <AppText style={styles.playLabel}>Jouer</AppText>
          </Tap>
        </View>
        <View pointerEvents="none" style={styles.progressRow} accessible accessibilityLabel={`${percent} % des questions rencontrées`}>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${percent}%` }]} />
          </View>
          <AppText style={styles.percent}>{percent} %</AppText>
        </View>
      </View>
    </View>
  );
}

function AboutRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.aboutRow}>
      <AppText style={styles.aboutLabel}>{label}</AppText>
      <AppText style={styles.aboutValue}>{value}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  dome: { position: 'absolute', left: 0, right: 0, bottom: -1 },
  icon: {
    position: 'absolute',
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PINK,
    borderWidth: 3,
    borderColor: Colors.surface,
    boxShadow: '0 6px 14px rgba(14, 15, 43, 0.22)',
  },
  body: { paddingHorizontal: 13, paddingTop: 6, gap: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  title: { fontFamily: Fonts.extraBold, fontSize: 25, lineHeight: 33, color: Colors.text, flexShrink: 1 },
  description: { fontFamily: Fonts.regular, fontSize: 13, lineHeight: 18, color: Colors.text, textAlign: 'center', paddingHorizontal: 44, marginTop: -8 },
  stats: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingTop: 2 },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  statLabel: { fontFamily: Fonts.bold, fontSize: 13, lineHeight: 18, color: Colors.text },
  statDivider: { width: 1, height: 22, backgroundColor: Colors.border },
  tabs: { flexDirection: 'row', gap: 7 },
  tab: { height: 34, borderRadius: Radius.pill, backgroundColor: Colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 6, ...Shadow },
  tabActive: { backgroundColor: PINK },
  tabLabel: { fontFamily: Fonts.bold, fontSize: 12.5, lineHeight: 17, color: Colors.text, flexShrink: 1 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  search: { flex: 1, height: 38, borderRadius: Radius.pill, backgroundColor: Colors.surface, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 13, ...Shadow },
  searchInput: { flex: 1, minWidth: 0, height: 38, padding: 0, fontFamily: Fonts.regular, fontSize: 13, color: Colors.text },
  round: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', ...Shadow },
  dot: { position: 'absolute', right: 1, bottom: 1, width: 8, height: 8, borderRadius: 4, backgroundColor: PINK },
  list: { gap: 5 },
  card: { flexDirection: 'row', gap: 12, backgroundColor: Colors.surface, borderRadius: 16, padding: 10, ...Shadow },
  cardHit: { borderRadius: 16 },
  art: { width: 87, height: 82, borderRadius: 13, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surfaceRaised, alignSelf: 'center' },
  cardBody: { flex: 1, minWidth: 0, gap: 2 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardTitle: { flex: 1, fontFamily: Fonts.extraBold, fontSize: 16, lineHeight: 21, color: Colors.text },
  levelPill: { backgroundColor: LEVEL_PILL, borderRadius: Radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  levelText: { fontFamily: Fonts.bold, fontSize: 10.5, lineHeight: 15, color: Colors.text },
  cardMiddle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardText: { flex: 1, minWidth: 0, gap: 2 },
  cardDescription: { fontFamily: Fonts.regular, fontSize: 11.5, lineHeight: 15, color: Colors.text },
  cardSubscribers: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardSubscribersText: { fontFamily: Fonts.regular, fontSize: 11.5, lineHeight: 15, color: Colors.text },
  play: { height: 27, paddingHorizontal: 13, borderRadius: Radius.pill, borderWidth: 1.3, borderColor: PINK, flexDirection: 'row', alignItems: 'center', gap: 5 },
  playLabel: { fontFamily: Fonts.bold, fontSize: 12.5, lineHeight: 17, color: PINK },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 },
  track: { flex: 1, height: 5, borderRadius: 3, backgroundColor: TRACK, overflow: 'hidden' },
  fill: { height: 5, minWidth: 6, borderRadius: 3, backgroundColor: PINK },
  percent: { fontFamily: Fonts.bold, fontSize: 11.5, lineHeight: 15, color: Colors.text, minWidth: 30, textAlign: 'right' },
  footer: { fontFamily: Fonts.regular, fontSize: 12.5, lineHeight: 17, color: Colors.text, textAlign: 'center', marginTop: 6 },
  tabBody: { gap: 10 },
  about: { backgroundColor: Colors.surface, borderRadius: 16, padding: Spacing.md, gap: 10, ...Shadow },
  aboutText: { fontFamily: Fonts.regular, fontSize: 14, lineHeight: 20, color: Colors.text },
  aboutRow: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.md },
  aboutLabel: { fontFamily: Fonts.regular, fontSize: 13.5, lineHeight: 19, color: Colors.textMuted },
  aboutValue: { fontFamily: Fonts.bold, fontSize: 13.5, lineHeight: 19, color: Colors.text },
  topBar: { position: 'absolute', alignSelf: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 13 },
  topButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', ...Shadow },
});
