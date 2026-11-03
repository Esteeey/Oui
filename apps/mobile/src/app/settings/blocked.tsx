import { useState } from 'react';
import { View } from 'react-native';

import type { UserSummary } from '@qu1z/shared';

import { UserRow } from '@/components/player-row';
import { AppText, Button, Card, Screen } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { api, useApi } from '@/net/api';

/** Joueurs bloqués, avec déblocage individuel confirmé. */
export default function BlockedScreen() {
  const list = useApi<{ blocked: { id: string; pseudo: string; since: number }[] }>('/api/blocks');
  const [confirm, setConfirm] = useState<string | null>(null);
  const blocked = list.data?.blocked ?? [];

  return (
    <Screen title="Joueurs bloqués" back>
      {list.data && blocked.length === 0 && <AppText muted>Tu n’as bloqué personne.</AppText>}
      {blocked.map((b) => {
        const user: UserSummary = { id: b.id, pseudo: b.pseudo, title: null, level: 1, avatar: null };
        return (
          <View key={b.id} style={{ gap: Spacing.sm }}>
            <UserRow
              user={user}
              subtitle="Bloqué"
              right={<Button label="Débloquer" variant="outline" color={Colors.text} onPress={() => setConfirm(b.id)} />}
            />
            {confirm === b.id && (
              <Card>
                <AppText>
                  Débloquer {b.pseudo} ? Les interactions redeviennent possibles, mais vos anciens abonnements ne sont pas recréés.
                </AppText>
                <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                  <Button label="Annuler" variant="outline" color={Colors.text} onPress={() => setConfirm(null)} style={{ flex: 1 }} />
                  <Button
                    label="Débloquer"
                    onPress={() => {
                      setConfirm(null);
                      api('DELETE', `/api/blocks/${b.id}`).catch(() => {});
                    }}
                    style={{ flex: 1 }}
                  />
                </View>
              </Card>
            )}
          </View>
        );
      })}
    </Screen>
  );
}
