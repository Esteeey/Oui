import { api } from '@/net/api';

function applicationServerKey(key: string): Uint8Array {
  const decoded = atob(key.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(decoded, (c) => c.charCodeAt(0));
}

export function webPushAvailable(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/** L’activation est appelée depuis un bouton utilisateur, conformément aux règles de permission des navigateurs. */
export async function enableWebPush(): Promise<void> {
  if (!webPushAvailable()) throw new Error('Ce navigateur ne prend pas en charge les notifications push.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Autorise les notifications dans les réglages du navigateur.');
  const { publicKey } = await api<{ publicKey: string }>('GET', '/api/me/web-push-key');
  if (!publicKey) throw new Error('Le serveur Web Push n’est pas configuré.');
  const registration = await navigator.serviceWorker.register('/sw.js');
  const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey(publicKey) as BufferSource });
  await api('PUT', '/api/me/web-push', { subscription: subscription.toJSON() });
}
