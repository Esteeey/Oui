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
  'logos/adidas': require('@/assets/questions/logos/adidas.png'),
  'logos/adobe': require('@/assets/questions/logos/adobe.png'),
  'logos/airbnb': require('@/assets/questions/logos/airbnb.png'),
  'logos/amazon': require('@/assets/questions/logos/amazon.png'),
  'logos/apple': require('@/assets/questions/logos/apple.png'),
  'logos/bmw': require('@/assets/questions/logos/bmw.png'),
  'logos/burger-king': require('@/assets/questions/logos/burger-king.png'),
  'logos/chanel': require('@/assets/questions/logos/chanel.png'),
  'logos/coca-cola': require('@/assets/questions/logos/coca-cola.png'),
  'logos/dhl': require('@/assets/questions/logos/dhl.png'),
  'logos/discord': require('@/assets/questions/logos/discord.png'),
  'logos/ebay': require('@/assets/questions/logos/ebay.png'),
  'logos/fedex': require('@/assets/questions/logos/fedex.png'),
  'logos/firefox': require('@/assets/questions/logos/firefox.png'),
  'logos/google': require('@/assets/questions/logos/google.png'),
  'logos/ikea': require('@/assets/questions/logos/ikea.png'),
  'logos/instagram': require('@/assets/questions/logos/instagram.png'),
  'logos/intel': require('@/assets/questions/logos/intel.png'),
  'logos/l-or-al': require('@/assets/questions/logos/l-or-al.png'),
  'logos/lacoste': require('@/assets/questions/logos/lacoste.png'),
  'logos/lego': require('@/assets/questions/logos/lego.png'),
  'logos/louis-vuitton': require('@/assets/questions/logos/louis-vuitton.png'),
  'logos/lufthansa': require('@/assets/questions/logos/lufthansa.png'),
  'logos/mastercard': require('@/assets/questions/logos/mastercard.png'),
  'logos/mcdonald-s': require('@/assets/questions/logos/mcdonald-s.png'),
  'logos/mercedes-benz': require('@/assets/questions/logos/mercedes-benz.png'),
  'logos/meta': require('@/assets/questions/logos/meta.png'),
  'logos/michelin': require('@/assets/questions/logos/michelin.png'),
  'logos/microsoft': require('@/assets/questions/logos/microsoft.png'),
  'logos/netflix': require('@/assets/questions/logos/netflix.png'),
  'logos/nike': require('@/assets/questions/logos/nike.png'),
  'logos/nintendo': require('@/assets/questions/logos/nintendo.png'),
  'logos/nvidia': require('@/assets/questions/logos/nvidia.png'),
  'logos/paypal': require('@/assets/questions/logos/paypal.png'),
  'logos/pepsi': require('@/assets/questions/logos/pepsi.png'),
  'logos/playstation': require('@/assets/questions/logos/playstation.png'),
  'logos/puma': require('@/assets/questions/logos/puma.png'),
  'logos/renault': require('@/assets/questions/logos/renault.png'),
  'logos/samsung': require('@/assets/questions/logos/samsung.png'),
  'logos/shell': require('@/assets/questions/logos/shell.png'),
  'logos/spotify': require('@/assets/questions/logos/spotify.png'),
  'logos/starbucks': require('@/assets/questions/logos/starbucks.png'),
  'logos/tesla': require('@/assets/questions/logos/tesla.png'),
  'logos/tiktok': require('@/assets/questions/logos/tiktok.png'),
  'logos/toyota': require('@/assets/questions/logos/toyota.png'),
  'logos/uber': require('@/assets/questions/logos/uber.png'),
  'logos/visa': require('@/assets/questions/logos/visa.png'),
  'logos/wikipedia': require('@/assets/questions/logos/wikipedia.png'),
  'logos/xbox': require('@/assets/questions/logos/xbox.png'),
  'logos/youtube': require('@/assets/questions/logos/youtube.png'),
};

export function questionImageSource(image: string | undefined): ImageSource | number | null {
  if (!image) return null;
  if (image.startsWith('https://')) return { uri: image };
  return LOCAL_IMAGES[image] ?? null;
}
