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
};

export function themeCover(themeId: string): number | null {
  return COVERS[themeId] ?? null;
}
