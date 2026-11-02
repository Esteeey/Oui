import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { BackButton } from '@/components/back-button';
import { DemoNote } from '@/components/social';
import { AppText, Screen } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { NOTIFICATIONS } from '@/demo/data';
import { useSocial } from '@/state/social';

const ICON_COLOR = { flash: Colors.opponent, people: Colors.player, trophy: Colors.gold, heart: Colors.wrong } as const;

export default function NotificationsScreen() {
  const { markNotificationsRead } = useSocial();
  useEffect(() => {
    markNotificationsRead();
  }, [markNotificationsRead]);

  return (
    <Screen>
      <BackButton />
      <AppText variant="title">Notifications</AppText>
      {NOTIFICATIONS.map((n) => (
        <View key={n.id} style={styles.row}>
          <View style={[styles.icon, { backgroundColor: ICON_COLOR[n.icon] }]}>
            <Ionicons name={n.icon} size={18} color={Colors.background} />
          </View>
          <AppText style={{ flex: 1 }}>{n.text}</AppText>
          <AppText variant="caption" muted>
            {n.ago}
          </AppText>
        </View>
      ))}
      <DemoNote>Notifications de démonstration.</DemoNote>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm + 4,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.sm + 4,
  },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
