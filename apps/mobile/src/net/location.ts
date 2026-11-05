import * as Location from 'expo-location';

import { ApiError, api, errorMessage } from '@/net/api';

/**
 * Enregistre la position APPROXIMATIVE du joueur pour le classement « À proximité » (le serveur l'arrondit à
 * environ 11 km). Demandée seulement quand le joueur appuie sur le bouton ; renvoie un message d'erreur ou null.
 */
export async function shareApproxLocation(): Promise<string | null> {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) return 'Autorise la localisation pour voir les joueurs autour de toi.';
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Lowest });
    await api('PATCH', '/api/me/profile', { location: { lat: position.coords.latitude, lon: position.coords.longitude } });
    return null;
  } catch (e) {
    return e instanceof ApiError ? errorMessage(e) : 'Position introuvable pour le moment.';
  }
}

export async function forgetLocation(): Promise<string | null> {
  try {
    await api('PATCH', '/api/me/profile', { location: null });
    return null;
  } catch (e) {
    return errorMessage(e);
  }
}
