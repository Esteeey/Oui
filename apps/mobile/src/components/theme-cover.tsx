import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { themeCover } from '@/game/theme-covers';

/** Couverture d'un thème, fondue vers la couleur du fond en bas. */
export function ThemeCover({
  themeId,
  height,
  fadeTo,
  children,
}: {
  themeId: string;
  height: number;
  fadeTo: string;
  children?: ReactNode;
}) {
  const source = themeCover(themeId);
  return (
    <View style={{ height, width: '100%', overflow: 'hidden', backgroundColor: fadeTo }}>
      {source !== null && (
        <Image source={source} contentFit="cover" style={StyleSheet.absoluteFill} accessibilityIgnoresInvertColors />
      )}
      <LinearGradient
        colors={['rgba(0,0,0,0.15)', 'rgba(0,0,0,0.35)', fadeTo]}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />
      {children}
    </View>
  );
}
