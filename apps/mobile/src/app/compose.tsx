import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView } from 'react-native';

import { getCategory, getTheme, type PostTarget, type ThemeInfo } from '@qu1z/shared';

import { Composer } from '@/components/composer';
import { Chip } from '@/components/social';
import { AppText, Screen } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { useApi } from '@/net/api';

/** Publier depuis l'accueil : sur son mur, ou dans un thème auquel on est abonné. */
export default function ComposeScreen() {
  const themes = useApi<{ themes: ThemeInfo[] }>('/api/themes');
  const subscribed = (themes.data?.themes ?? []).filter((t) => t.subscribed);
  const [targetId, setTargetId] = useState<string>('profile');
  const target: PostTarget = targetId === 'profile' ? { kind: 'profile' } : { kind: 'theme', themeId: targetId };
  const themeName = targetId === 'profile' ? undefined : getTheme(targetId)?.name;

  return (
    <Screen title="Nouvelle publication" back="close">
      <AppText variant="label" muted>
        Publier sur
      </AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: Spacing.sm, alignItems: 'flex-start' }}>
        <Chip label="Mon mur" active={targetId === 'profile'} onPress={() => setTargetId('profile')} />
        {subscribed.map(({ themeId }) => {
          const theme = getTheme(themeId);
          if (!theme) return null;
          return (
            <Chip
              key={themeId}
              label={theme.name}
              color={getCategory(theme.categoryId)?.color ?? Colors.accent}
              active={targetId === themeId}
              onPress={() => setTargetId(themeId)}
            />
          );
        })}
      </ScrollView>
      <Composer
        key={targetId}
        target={target}
        autoFocus
        placeholder={themeName ? `Écris dans le fil « ${themeName} »…` : 'Quoi de neuf ?'}
        onPublished={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      />
      <AppText variant="caption" muted>
        Seul toi peux publier sur ton mur. Pour publier dans un thème, abonne-toi d’abord à ce thème.
      </AppText>
    </Screen>
  );
}
