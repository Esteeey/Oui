import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import type { ComponentProps } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { useMusicEnabled, useSoundEnabled } from '@/audio/sounds';
import { SectionHeader } from '@/components/social';
import { AppText, Screen } from '@/components/ui';
import { Colors, Radius, Shadow, Spacing } from '@/constants/theme';
import { useApi } from '@/net/api';
import { Tap } from '@/components/tap';

interface Entry {
  label: string;
  hint: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  href: Href;
  danger?: boolean;
}

const SECTIONS: { title: string; entries: Entry[] }[] = [
  {
    title: 'Profil',
    entries: [{ label: 'Profil et confidentialité', hint: 'Pseudo, photo, bio, pays, profil privé', icon: 'person-circle-outline', href: '/settings/profile' }],
  },
  {
    title: 'Notifications',
    entries: [{ label: 'Notifications', hint: 'Push par catégorie, aperçus des messages', icon: 'notifications-outline', href: '/settings/notifications' }],
  },
  {
    title: 'Compte et sécurité',
    entries: [
      { label: 'Compte et e-mail', hint: 'Protéger son compte, se connecter ailleurs, se déconnecter', icon: 'mail-outline', href: '/account' },
      { label: 'Joueurs bloqués', hint: 'Voir et débloquer', icon: 'ban-outline', href: '/settings/blocked' },
      { label: 'Mes sanctions', hint: 'Avertissements, suspensions et appels', icon: 'shield-outline', href: '/settings/sanctions' },
    ],
  },
  {
    title: 'Zone sensible',
    entries: [
      { label: 'Supprimer mon compte', hint: 'Effacer définitivement ton compte et tes données', icon: 'trash-outline', href: '/settings/delete-account', danger: true },
    ],
  },
];

/** Réglages : point d'entrée unique vers les écrans existants (profil, notifications, compte, blocages, sanctions). */
export default function SettingsScreen() {
  const me = useApi<{ role: string }>('/api/me');
  const role = me.data?.role;
  const staff: Entry[] = [
    ...(role === 'admin'
      ? [{ label: 'Panneau d’administration', hint: 'Sons du jeu, modération, annonces', icon: 'construct-outline', href: '/admin' } as Entry]
      : []),
    ...(role === 'admin' || role === 'moderator'
      ? [{ label: 'Panneau de modération', hint: 'Signalements, appels, journal', icon: 'shield-checkmark-outline', href: '/moderation' } as Entry]
      : []),
  ];
  const sections = staff.length ? [{ title: 'Équipe', entries: staff }, ...SECTIONS] : SECTIONS;
  return (
    <Screen title="Réglages" back>
      <View style={{ gap: Spacing.sm }}>
        <SectionHeader title="Jeu" />
        <SoundRow />
        <MusicRow />
      </View>
      {sections.map((section) => (
        <View key={section.title} style={{ gap: Spacing.sm }}>
          <SectionHeader title={section.title} />
          {section.entries.map((e) => (
            <Tap key={e.label} accessibilityRole="button" onPress={() => router.push(e.href)} style={styles.row}>
              <Ionicons name={e.icon} size={22} color={e.danger ? Colors.wrong : Colors.accent} />
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="label" color={e.danger ? Colors.wrong : undefined}>
                  {e.label}
                </AppText>
                <AppText variant="caption" muted>
                  {e.hint}
                </AppText>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
            </Tap>
          ))}
        </View>
      ))}
    </Screen>
  );
}

function SoundRow() {
  const [on, setOn] = useSoundEnabled();
  return (
    <View style={styles.row}>
      <Ionicons name={on ? 'volume-high-outline' : 'volume-mute-outline'} size={22} color={Colors.accent} />
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="label">Sons</AppText>
        <AppText variant="caption" muted>
          Sons du duel et de fin de partie
        </AppText>
      </View>
      <Switch value={on} onValueChange={setOn} accessibilityLabel="Sons" trackColor={{ true: Colors.accent, false: Colors.border }} />
    </View>
  );
}

function MusicRow() {
  const [on, setOn] = useMusicEnabled();
  return (
    <View style={styles.row}>
      <Ionicons name="musical-notes-outline" size={22} color={Colors.accent} />
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="label">Musique</AppText>
        <AppText variant="caption" muted>
          Musique de fond pendant les duels
        </AppText>
      </View>
      <Switch value={on} onValueChange={setOn} accessibilityLabel="Musique" trackColor={{ true: Colors.accent, false: Colors.border }} />
    </View>
  );
}

const styles = StyleSheet.create({
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
