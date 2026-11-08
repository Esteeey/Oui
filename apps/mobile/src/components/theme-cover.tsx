import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { themeCover } from '@/game/theme-covers';
import { mediaUri } from '@/net/media';
import { useGameServer } from '@/state/game-server';

/** Couverture d'un thème, fondue vers la couleur du fond en bas. */
export function ThemeCover({
  themeId,
  height,
  fadeTo,
  dim = true,
  children,
}: {
  themeId: string;
  height: number;
  fadeTo: string;
  /** Voile sombre pour du texte blanc posé sur l'image ; `false` garde l'image claire. */
  dim?: boolean;
  children?: ReactNode;
}) {
  const { catalogVersion } = useGameServer();
  void catalogVersion;
  const rawSource = themeCover(themeId);
  const source = typeof rawSource === 'string' ? { uri: mediaUri(rawSource) ?? rawSource } : rawSource;
  return (
    <View style={{ height, width: '100%', overflow: 'hidden', backgroundColor: fadeTo }}>
      {source !== null && (
        <Image
          source={source}
          contentFit="cover"
          // Sans voile, le bas est déjà opaque : l'image s'arrête avant pour ne laisser aucun liseré au bord.
          style={[StyleSheet.absoluteFill, !dim && { bottom: height * 0.1 }]}
          accessibilityIgnoresInvertColors
        />
      )}
      <LinearGradient
        // Sans voile : fondu de la couleur du fond vers elle-même, pour ne pas griser l'image (fadeTo en #RRGGBB).
        colors={dim ? ['rgba(0,0,0,0.15)', 'rgba(0,0,0,0.35)', fadeTo] : [`${fadeTo}00`, `${fadeTo}00`, `${fadeTo}99`, fadeTo, fadeTo]}
        locations={dim ? [0, 0.55, 1] : [0, 0.35, 0.65, 0.9, 1]}
        style={StyleSheet.absoluteFill}
      />
      {children}
    </View>
  );
}
