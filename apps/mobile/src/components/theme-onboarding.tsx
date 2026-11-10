import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CATEGORIES, themesOf, type ThemeInfo } from '@qu1z/shared';

import { Tap } from '@/components/tap';
import { ThemeIcon } from '@/components/theme-icon';
import { AppText, Button } from '@/components/ui';
import { Colors, Fonts, MaxContentWidth, Radius, Shadow, Spacing } from '@/constants/theme';
import { api, errorMessage, useApi } from '@/net/api';
import { useGameServer } from '@/state/game-server';
import { useProgress } from '@/state/progress';

const MIN_THEMES = 3;
const doneKey = (playerId: string) => `qu1z.onboarding.themes.${playerId}`;

/**
 * Premier lancement : un nouveau joueur (aucun thème suivi, aucun duel joué) choisit d'abord ses thèmes,
 * pour que son accueil ne soit pas vide. Proposé une seule fois par compte et par appareil.
 */
export function OnboardingGate({ children }: { children: ReactNode }) {
  const { playerId, profile } = useGameServer();
  const { stats } = useProgress();
  const info = useApi<{ themes: ThemeInfo[] }>(playerId ? '/api/themes' : null);
  const [seen, setSeen] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setSeen(null);
    setOpen(false);
    if (!playerId) return;
    AsyncStorage.getItem(doneKey(playerId))
      .then((value) => setSeen(value === '1'))
      .catch(() => setSeen(true));
  }, [playerId]);

  const isNew =
    !!playerId && !!profile && seen === false && !!info.data && !info.data.themes.some((t) => t.subscribed) && !Object.values(stats).some((s) => s.xp > 0);
  useEffect(() => {
    if (isNew) setOpen(true);
  }, [isNew]);

  const finish = () => {
    if (playerId) AsyncStorage.setItem(doneKey(playerId), '1').catch(() => {});
    setSeen(true);
    setOpen(false);
  };

  return open ? <ThemeOnboarding onDone={finish} /> : children;
}

function ThemeOnboarding({ onDone }: { onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const groups = CATEGORIES.map((category) => ({ category, themes: themesOf(category.id) })).filter((g) => g.themes.length > 0);
  const missing = Math.max(MIN_THEMES - picked.length, 0);

  const toggle = (themeId: string) => setPicked((list) => (list.includes(themeId) ? list.filter((id) => id !== themeId) : [...list, themeId]));
  const confirm = async () => {
    if (busy || missing > 0) return;
    setBusy(true);
    setError(null);
    try {
      for (const themeId of picked) await api('PUT', `/api/themes/${themeId}/subscription`);
      onDone();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + Spacing.md }]}>
      <View style={styles.column}>
        <View style={styles.header}>
          <AppText style={styles.title}>Choisis tes thèmes</AppText>
          <AppText style={styles.subtitle}>Suis au moins {MIN_THEMES} thèmes : ils rempliront ton accueil et tu pourras y jouer tout de suite.</AppText>
        </View>
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {groups.map(({ category, themes }) => (
            <View key={category.id} style={styles.group}>
              <AppText style={styles.category}>{category.name}</AppText>
              <View style={styles.grid}>
                {themes.map((theme) => {
                  const selected = picked.includes(theme.id);
                  return (
                    <Tap
                      key={theme.id}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected }}
                      accessibilityLabel={theme.name}
                      onPress={() => toggle(theme.id)}
                      style={[styles.tile, selected && styles.tileOn]}>
                      <ThemeIcon themeId={theme.id} size={54} />
                      <AppText style={styles.name} numberOfLines={2}>
                        {theme.name}
                      </AppText>
                      {selected && (
                        <View style={styles.check}>
                          <Ionicons name="checkmark" size={13} color={Colors.onAccent} />
                        </View>
                      )}
                    </Tap>
                  );
                })}
              </View>
            </View>
          ))}
        </ScrollView>
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, Spacing.md) }]}>
          {error && (
            <AppText variant="caption" color={Colors.wrong} style={{ textAlign: 'center' }}>
              {error}
            </AppText>
          )}
          <Button
            label={busy ? 'Un instant…' : missing > 0 ? `Encore ${missing} thème${missing > 1 ? 's' : ''}` : `Continuer avec ${picked.length} thèmes`}
            disabled={busy || missing > 0}
            onPress={() => void confirm()}
          />
          <Tap accessibilityRole="button" disabled={busy} onPress={onDone} style={styles.later}>
            <AppText style={styles.laterText}>Plus tard</AppText>
          </Tap>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background, alignItems: 'center' },
  column: { flex: 1, width: '100%', maxWidth: MaxContentWidth },
  header: { paddingHorizontal: Spacing.md, gap: 4, paddingBottom: Spacing.sm },
  title: { fontFamily: Fonts.extraBold, fontSize: 26, lineHeight: 34, color: Colors.text },
  subtitle: { fontFamily: Fonts.regular, fontSize: 14, lineHeight: 20, color: Colors.textMuted },
  list: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.lg, gap: Spacing.md },
  group: { gap: Spacing.sm },
  category: { fontFamily: Fonts.bold, fontSize: 15, lineHeight: 20, color: Colors.text },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: {
    width: '31.5%',
    minHeight: 112,
    alignItems: 'center',
    gap: 6,
    padding: 8,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: 'transparent',
    ...Shadow,
  },
  tileOn: { borderColor: Colors.accent },
  name: { fontFamily: Fonts.semiBold, fontSize: 11.5, lineHeight: 15, color: Colors.text, textAlign: 'center' },
  check: { position: 'absolute', top: 5, right: 5, width: 20, height: 20, borderRadius: 10, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  footer: { paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, gap: 4, borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.background },
  later: { alignSelf: 'center', minHeight: 40, justifyContent: 'center', paddingHorizontal: Spacing.md },
  laterText: { fontFamily: Fonts.semiBold, fontSize: 14, lineHeight: 19, color: Colors.textMuted },
});
