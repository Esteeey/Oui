import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { SectionHeader } from '@/components/social';
import { AppText, Screen } from '@/components/ui';
import { Colors, Radius, Shadow, Spacing } from '@/constants/theme';

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
  return (
    <Screen title="Réglages" back>
      {SECTIONS.map((section) => (
        <View key={section.title} style={{ gap: Spacing.sm }}>
          <SectionHeader title={section.title} />
          {section.entries.map((e) => (
            <Pressable key={e.label} accessibilityRole="button" onPress={() => router.push(e.href)} style={styles.row}>
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
            </Pressable>
          ))}
        </View>
      ))}
    </Screen>
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
