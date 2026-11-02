import type { ImageSource } from 'expo-image';

/**
 * Illustrations embarquées dans l'application, par clé de question (`Question.image`).
 * Les drapeaux sont des dessins originaux de Qu1z. Plus tard, le serveur pourra
 * aussi fournir des photos par adresse `https://`.
 */
const LOCAL_IMAGES: Record<string, number> = {
  'flags/allemagne': require('@/assets/questions/flags/allemagne.png'),
  'flags/autriche': require('@/assets/questions/flags/autriche.png'),
  'flags/bangladesh': require('@/assets/questions/flags/bangladesh.png'),
  'flags/belgique': require('@/assets/questions/flags/belgique.png'),
  'flags/danemark': require('@/assets/questions/flags/danemark.png'),
  'flags/finlande': require('@/assets/questions/flags/finlande.png'),
  'flags/grece': require('@/assets/questions/flags/grece.png'),
  'flags/irlande': require('@/assets/questions/flags/irlande.png'),
  'flags/italie': require('@/assets/questions/flags/italie.png'),
  'flags/japon': require('@/assets/questions/flags/japon.png'),
  'flags/pologne': require('@/assets/questions/flags/pologne.png'),
  'flags/suede': require('@/assets/questions/flags/suede.png'),
  'flags/suisse': require('@/assets/questions/flags/suisse.png'),
  'flags/ukraine': require('@/assets/questions/flags/ukraine.png'),
};

export function questionImageSource(image: string | undefined): ImageSource | number | null {
  if (!image) return null;
  if (image.startsWith('https://')) return { uri: image };
  return LOCAL_IMAGES[image] ?? null;
}
