import { Image } from 'expo-image';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { getCategory, getTheme } from '@qu1z/shared';

import { mediaUri } from '@/net/media';
import { useGameServer } from '@/state/game-server';
import { AppText } from '@/components/ui';

const THEME_ICONS: Record<string, number> = {
  'cg-melange': require('@/assets/theme-icons/cg-melange.png'),
  'geo-capitales': require('@/assets/theme-icons/geo-capitales.png'),
  'geo-drapeaux': require('@/assets/theme-icons/geo-drapeaux.png'),
  'sci-essentiels': require('@/assets/theme-icons/sci-essentiels.png'),
  'cine-grands-films': require('@/assets/theme-icons/cine-grands-films.png'),
  'sports-jo': require('@/assets/theme-icons/sports-jo.png'),
  'hist-grandes-dates': require('@/assets/theme-icons/hist-grandes-dates.png'),
  'nature-animaux': require('@/assets/theme-icons/nature-animaux.png'),
  'music-hits': require('@/assets/theme-icons/music-hits.png'),
  'gaming-cult': require('@/assets/theme-icons/gaming-cult.png'),
  'food-world': require('@/assets/theme-icons/food-world.png'),
  'tech-inventions': require('@/assets/theme-icons/tech-inventions.png'),
  'nature-faune': require('@/assets/theme-icons/nature-faune.png'),
  'culture-logique': require('@/assets/theme-icons/culture-logique.png'),
  'culture-celebrites': require('@/assets/theme-icons/culture-celebrites.png'),
  'culture-divertissement': require('@/assets/theme-icons/culture-divertissement.png'),
  'culture-familial': require('@/assets/theme-icons/culture-familial.png'),
  'histoire-antique': require('@/assets/theme-icons/histoire-antique.png'),
  'histoire-moderne': require('@/assets/theme-icons/histoire-moderne.png'),
  'loisirs-passe-temps': require('@/assets/theme-icons/loisirs-passe-temps.png'),
  'humanites': require('@/assets/theme-icons/humanites.png'),
  'litterature-auteurs': require('@/assets/theme-icons/litterature-auteurs.png'),
  'litterature-oeuvres': require('@/assets/theme-icons/litterature-oeuvres.png'),
  'cinema-acteurs': require('@/assets/theme-icons/cinema-acteurs.png'),
  'musique-artistes': require('@/assets/theme-icons/musique-artistes.png'),
  'musique-cultures': require('@/assets/theme-icons/musique-cultures.png'),
  'personnalites': require('@/assets/theme-icons/personnalites.png'),
  'mythes-religions': require('@/assets/theme-icons/mythes-religions.png'),
  'sports-equipes': require('@/assets/theme-icons/sports-equipes.png'),
  'logos-marques': require('@/assets/theme-icons/logos-marques.png'),
};

/** Icône illustrée de chaque thème, avec l’icône distante et l’émoji comme replis. */
export function ThemeIcon({ themeId, size = 36, style }: { themeId: string; size?: number; style?: StyleProp<ViewStyle> }) {
  const { catalogVersion } = useGameServer();
  void catalogVersion;
  const theme = getTheme(themeId);
  const category = theme ? getCategory(theme.categoryId) : undefined;
  const uri = mediaUri(theme?.iconUrl);
  const localIcon = THEME_ICONS[themeId];
  const radius = Math.round(size * 0.24);

  return (
    <View style={[styles.base, { width: size, height: size, borderRadius: radius }, style]}>
      {uri ? (
        <Image source={{ uri }} contentFit="cover" style={{ width: size, height: size, borderRadius: radius }} />
      ) : localIcon ? (
        <Image source={localIcon} contentFit="cover" style={{ width: size, height: size, borderRadius: radius }} />
      ) : (
        <AppText style={{ fontSize: size * 0.62, lineHeight: size * 0.9 }}>{category?.icon ?? '❓'}</AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 },
});
