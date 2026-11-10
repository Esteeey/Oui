import { getTheme, type CategoryId } from '@qu1z/shared';

/**
 * Couverture de chaque thème : la MÊME image sert sur la page du thème et sur l'écran de résultats.
 * Illustrations originales de Qu1z (voir content/covers).
 */
const COVERS: Record<string, number> = {
  'cg-melange': require('@/assets/covers/cg-melange.jpg'),
  'geo-capitales': require('@/assets/covers/geo-capitales.jpg'),
  'geo-drapeaux': require('@/assets/covers/geo-drapeaux.jpg'),
  'sci-essentiels': require('@/assets/covers/sci-essentiels.jpg'),
  'cine-grands-films': require('@/assets/covers/cine-grands-films.jpg'),
  'sports-jo': require('@/assets/covers/sports-jo.jpg'),
  'music-hits': require('@/assets/covers/music-hits.png'),
  'gaming-cult': require('@/assets/covers/gaming-cult.png'),
  'food-world': require('@/assets/covers/food-world.png'),
  'tech-inventions': require('@/assets/covers/tech-inventions.png'),
};

/** Repli illustré pour que chaque thème intégré ait une couverture liée à son sujet. */
const CATEGORY_COVERS: Record<CategoryId, number> = {
  'culture-generale': require('@/assets/covers/cg-melange.jpg'),
  cinema: require('@/assets/covers/cine-grands-films.jpg'),
  series: require('@/assets/covers/cine-grands-films.jpg'),
  'jeux-video': require('@/assets/covers/gaming-cult.png'),
  sports: require('@/assets/covers/sports-jo.jpg'),
  clubs: require('@/assets/covers/sports-jo.jpg'),
  musique: require('@/assets/covers/music-hits.png'),
  histoire: require('@/assets/covers/cg-melange.jpg'),
  geographie: require('@/assets/covers/geo-capitales.jpg'),
  sciences: require('@/assets/covers/sci-essentiels.jpg'),
  automobile: require('@/assets/covers/tech-inventions.png'),
  gastronomie: require('@/assets/covers/food-world.png'),
  'animaux-nature': require('@/assets/covers/sci-essentiels.jpg'),
  technologie: require('@/assets/covers/tech-inventions.png'),
  'mode-luxe': require('@/assets/covers/cine-grands-films.jpg'),
  'litterature-bd': require('@/assets/covers/cg-melange.jpg'),
  'culture-pop': require('@/assets/covers/cine-grands-films.jpg'),
  marques: require('@/assets/covers/tech-inventions.png'),
};

export function themeCover(themeId: string): number | string | null {
  const theme = getTheme(themeId);
  return theme?.coverUrl ?? COVERS[themeId] ?? (theme ? CATEGORY_COVERS[theme.categoryId] : null);
}
