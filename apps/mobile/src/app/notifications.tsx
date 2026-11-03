import { Redirect } from 'expo-router';

/** Ancienne adresse des notifications (liens et notifications push) : elles sont désormais dans l'onglet Activité. */
export default function NotificationsRedirect() {
  return <Redirect href="/activity" />;
}
