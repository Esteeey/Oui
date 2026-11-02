import { router } from 'expo-router';
import { Pressable } from 'react-native';

import { AppText } from '@/components/ui';

export function BackButton({ label = '← Retour' }: { label?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      hitSlop={12}
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      style={({ pressed }) => ({ alignSelf: 'flex-start', opacity: pressed ? 0.6 : 1 })}>
      <AppText variant="label" muted>
        {label}
      </AppText>
    </Pressable>
  );
}
