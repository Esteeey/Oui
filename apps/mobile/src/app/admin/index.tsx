import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { GAME_SOUNDS, type AppealSummary, type ReportSummary, type SoundOverride } from '@qu1z/shared';

import { AdminScreen, Hint, SectionLabel, adminStyles, type IconName } from '@/components/admin-ui';
import { Tap } from '@/components/tap';
import { AppText } from '@/components/ui';
import { Colors, Fonts, Radius, Shadow, Spacing } from '@/constants/theme';
import { useApi } from '@/net/api';

const ANNOUNCE = '/admin/announce' as Href;

/** Panneau d'administration (rôle admin) : ce qui attend une action d'abord, puis les outils. */
export default function AdminScreenHome() {
  const me = useApi<{ role: string }>('/api/me');
  const admin = me.data?.role === 'admin';
  const reports = useApi<{ reports: ReportSummary[] }>(admin ? '/api/mod/reports?status=open' : null);
  const appeals = useApi<{ appeals: AppealSummary[] }>(admin ? '/api/mod/appeals' : null);
  const sounds = useApi<{ sounds: SoundOverride[] }>(admin ? '/api/admin/sounds' : null);

  if (me.data && !admin) {
    return (
      <AdminScreen title="Administration">
        <AppText muted>Accès réservé aux administrateurs.</AppText>
      </AdminScreen>
    );
  }

  const open = reports.data?.reports;
  const priority = open?.filter((r) => r.priority).length ?? 0;
  const pending = appeals.data?.appeals;
  const moderation = (tab: string): Href => ({ pathname: '/moderation', params: { tab } });

  return (
    <AdminScreen title="Administration">
      <View style={adminStyles.stack}>
        <SectionLabel>À traiter</SectionLabel>
        <View style={styles.pair}>
          <Counter value={open?.length} label={open?.length === 1 ? 'Signalement' : 'Signalements'} hint={priority ? `${priority} prioritaire${priority > 1 ? 's' : ''}` : 'Ouverts'} href={moderation('reports')} />
          <Counter value={pending?.length} label={pending?.length === 1 ? 'Appel' : 'Appels'} hint="En attente" href={moderation('appeals')} />
        </View>
      </View>

      <View style={adminStyles.stack}>
        <SectionLabel>Outils</SectionLabel>
        <View style={styles.pair}>
          <Tool icon="albums-outline" label="Thèmes" hint="Créer un thème et ses questions" href={'/admin/themes/new' as Href} />
          <Tool icon="musical-notes-outline" label="Sons" hint={sounds.data ? `${sounds.data.sounds.length} personnalisé${sounds.data.sounds.length > 1 ? 's' : ''} sur ${GAME_SOUNDS.length}` : 'Écouter et remplacer'} href="/admin/sounds" />
        </View>
        <View style={styles.pair}>
          <Tool icon="sparkles-outline" label="Animations" hint="Invitation en duel" href={'/admin/animations' as Href} />
          <Tool icon="shield-checkmark-outline" label="Journal" hint="Actions de l’équipe" href={moderation('log')} />
        </View>
      </View>

      <Tap accessibilityRole="button" onPress={() => router.push(ANNOUNCE)} style={styles.announce}>
        <View style={[styles.icon, styles.announceIcon]}>
          <Ionicons name="megaphone-outline" size={22} color={Colors.onAccent} />
        </View>
        <View style={adminStyles.grow}>
          <AppText color={Colors.onAccent} style={adminStyles.strong}>Envoyer une annonce</AppText>
          <Hint color="#CFC7E4">À tous les joueurs</Hint>
        </View>
        <Ionicons name="chevron-forward" size={18} color={Colors.onAccent} />
      </Tap>
    </AdminScreen>
  );
}

function Counter({ value, label, hint, href }: { value: number | undefined; label: string; hint: string; href: Href }) {
  return (
    <Tap accessibilityRole="button" accessibilityLabel={`${value ?? ''} ${label}, ${hint}`} onPress={() => router.push(href)} style={styles.tile}>
      <AppText color={Colors.accentInk} style={styles.number}>{value ?? '…'}</AppText>
      <AppText style={adminStyles.strong}>{label}</AppText>
      <Hint>{hint}</Hint>
    </Tap>
  );
}

function Tool({ icon, label, hint, href }: { icon: IconName; label: string; hint: string; href: Href }) {
  return (
    <Tap accessibilityRole="button" onPress={() => router.push(href)} style={[styles.tile, styles.tool]}>
      <View style={styles.icon}>
        <Ionicons name={icon} size={22} color={Colors.violetInk} />
      </View>
      <AppText style={adminStyles.strong}>{label}</AppText>
      <Hint>{hint}</Hint>
    </Tap>
  );
}

const styles = StyleSheet.create({
  pair: { flexDirection: 'row', gap: 10 },
  tile: { flex: 1, minHeight: 104, padding: 14, gap: 2, borderRadius: Radius.md, backgroundColor: Colors.surface, ...Shadow },
  tool: { minHeight: 124, gap: 6 },
  number: { fontFamily: Fonts.extraBold, fontSize: 34, lineHeight: 42, fontVariant: ['tabular-nums'] },
  icon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surfaceRaised },
  announce: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm + 4, minHeight: 72, padding: 14, borderRadius: Radius.md, backgroundColor: Colors.ink },
  announceIcon: { backgroundColor: 'rgba(255,255,255,0.14)' },
});
