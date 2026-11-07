import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { Platform } from 'react-native';

import { api } from '@/net/api';

const PUSH_KEY = 'qu1z.pushToken';

/** Notification reçue pendant que l'app est ouverte : affichée en bandeau (le serveur n'en envoie que hors de l'app). */
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}

/**
 * Enregistre l'appareil pour les notifications push (téléphone réel uniquement).
 * Deux canaux Android : les messages restent séparés des notifications communautaires.
 * Sans projet EAS configuré, l'enregistrement échoue sans gêner l'app.
 */
export async function registerForPush(): Promise<void> {
  if (Platform.OS === 'web' || !Device.isDevice) return;
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('messages', { name: 'Messages', importance: Notifications.AndroidImportance.HIGH });
      await Notifications.setNotificationChannelAsync('community', { name: 'Activité et annonces', importance: Notifications.AndroidImportance.DEFAULT });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    await api('PUT', '/api/me/push-tokens', { token, platform: Platform.OS === 'ios' ? 'ios' : 'android' });
    await AsyncStorage.setItem(PUSH_KEY, token);
  } catch (err) {
    console.warn('Notifications push indisponibles', err);
  }
}

export async function currentPushToken(): Promise<string | null> {
  return AsyncStorage.getItem(PUSH_KEY).catch(() => null);
}

/** Ouvre l'écran correspondant quand le joueur touche une notification push. */
export function listenToPushTaps(): () => void {
  if (Platform.OS === 'web') return () => {};
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as Record<string, string>;
    if (data.kind === 'message' && data.conversationId) router.push({ pathname: '/messages/[id]', params: { id: data.conversationId } });
    else if (data.kind === 'duel_invitation') {
      // Le fournisseur global récupère les invitations valides au hello et ouvre la modal sans changer de page.
    }
    else if (data.kind === 'message_request' || data.kind === 'group_invitation') router.push('/messages');
    else if (data.challengeId) router.push(`/defi/${data.challengeId}` as Href);
    else router.push('/notifications');
  });
  return () => sub.remove();
}
