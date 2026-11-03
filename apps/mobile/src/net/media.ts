import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';

import { MEDIA_MAX_BYTES, type MediaView } from '@qu1z/shared';

import { ApiError, apiBase, invalidateAll, TOKEN_KEY } from '@/net/api';

/** Adresse affichable d'un média : les chemins `/media/…` sont servis par le serveur de jeu. */
export function mediaUri(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.startsWith('/') ? `${apiBase()}${url}` : url;
}

export interface PickedImage {
  uri: string;
  width: number;
  height: number;
  mimeType?: string;
}

/**
 * Choisit une photo dans la galerie ou en prend une avec l'appareil photo.
 * Renvoie `null` si le joueur annule ; lève une erreur `permission` si l'accès est refusé.
 */
export async function pickImage(
  source: 'library' | 'camera',
  options: { square?: boolean; aspect?: [number, number] } = {},
): Promise<PickedImage | null> {
  const aspect = options.aspect ?? (options.square ? ([1, 1] as [number, number]) : undefined);
  const permission =
    source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new ApiError(0, 'permission');
  const pickerOptions: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    quality: 0.85,
    allowsEditing: !!aspect,
    aspect,
    exif: false,
  };
  const result =
    source === 'camera' ? await ImagePicker.launchCameraAsync(pickerOptions) : await ImagePicker.launchImageLibraryAsync(pickerOptions);
  if (result.canceled || !result.assets[0]) return null;
  const a = result.assets[0];
  return { uri: a.uri, width: a.width, height: a.height, mimeType: a.mimeType };
}

/**
 * Envoie une image au serveur (corps brut). Le serveur vérifie le type sur le contenu,
 * supprime les métadonnées (EXIF, position) et redimensionne.
 */
export async function uploadImage<T = MediaView>(image: PickedImage, path: string): Promise<T> {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  if (!token) throw new ApiError(401, 'not_connected');
  const blob = await (await fetch(image.uri)).blob();
  if (blob.size > MEDIA_MAX_BYTES) throw new ApiError(413, 'too_large');
  const res = await fetch(`${apiBase()}${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': image.mimeType ?? blob.type ?? 'application/octet-stream' },
    body: blob,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'error');
  invalidateAll();
  return data;
}
