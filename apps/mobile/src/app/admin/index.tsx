import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';

import type { AppealSummary, ReportSummary, SoundOverride } from '@qu1z/shared';

import { SectionHeader } from '@/components/social';
import { AppText, Screen } from '@/components/ui';
import { Colors, Radius, Shadow, Spacing } from '@/constants/theme';
import { useApi } from '@/net/api';
import { Tap } from '@/components/tap';

/** Panneau d'administration (rôle admin) : point d'entrée vers les outils de l'équipe. */
export default function AdminScreen() {
  const me = useApi<{ role: string }>('/api/me');
  const admin = me.data?.role === 'admin';
  const reports = useApi<{ reports: ReportSummary[] }>(admin ? '/api/mod/reports?status=open' : null);
  const appeals = useApi<{ appeals: AppealSummary[] }>(admin ? '/api/mod/appeals' : null);
  const sounds = useApi<{ sounds: SoundOverride[] }>(admin ? '/api/admin/sounds' : null);

  if (me.data && !admin) {
    return (
      <Screen back title="Administration">
        <AppText muted>Accès réservé aux administrateurs.</AppText>
      </Screen>
    );
  }

  const count = (n: number | undefined, one: string, many: string) => (n === undefined ? '…' : `${n} ${n > 1 ? many : one}`);

  return (
    <Screen back title="Administration">
      <View style={styles.stats}>
        <Stat value={count(reports.data?.reports.length, 'signalement ouvert', 'signalements ouverts')} />
        <Stat value={count(appeals.data?.appeals.length, 'appel en attente', 'appels en attente')} />
        <Stat value={count(sounds.data?.sounds.length, 'son personnalisé', 'sons personnalisés')} />
      </View>

      <View style={{ gap: Spacing.sm }}>
        <SectionHeader title="Jeu" />
        <Entry icon="albums-outline" label="Thèmes et questions" hint="Créer un thème, ses questions et ses photos" href={'/admin/themes/new' as Href} />
        <Entry icon="musical-notes-outline" label="Sons du jeu" hint="Écouter, remplacer ou rétablir chaque son et musique" href="/admin/sounds" />
      </View>
      <View style={{ gap: Spacing.sm }}>
        <SectionHeader title="Communauté" />
        <Entry icon="shield-checkmark-outline" label="Modération" hint="Signalements, appels et journal des actions" href="/moderation" />
        <Entry
          icon="megaphone-outline"
          label="Annonce officielle"
          hint="Envoyer un message à tous les joueurs"
          href={{ pathname: '/moderation', params: { tab: 'announce' } }}
        />
      </View>
    </Screen>
  );
}

function Stat({ value }: { value: string }) {
  return (
    <View style={styles.stat}>
      <AppText variant="label">{value}</AppText>
    </View>
  );
}

function Entry({ icon, label, hint, href }: { icon: ComponentProps<typeof Ionicons>['name']; label: string; hint: string; href: Href }) {
  return (
    <Tap accessibilityRole="button" onPress={() => router.push(href)} style={styles.row}>
      <Ionicons name={icon} size={22} color={Colors.accent} />
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="label">{label}</AppText>
        <AppText variant="caption" muted>
          {hint}
        </AppText>
      </View>
      <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
    </Tap>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  stat: { flexGrow: 1, backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.md, ...Shadow },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm + 4,
    minHeight: 56,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    ...Shadow,
  },
});
