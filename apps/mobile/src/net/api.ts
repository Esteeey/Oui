import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { gameServerUrl } from '@/net/game-connection';

export const TOKEN_KEY = 'qu1z.token';

/** Adresse HTTP du serveur, déduite de l'adresse WebSocket. */
export function apiBase(): string {
  return gameServerUrl().replace(/^ws/, 'http');
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

/** Appel authentifié à l'API (jeton du compte gardé sur l'appareil). */
export async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  if (!token) throw new ApiError(401, 'not_connected');
  const res = await fetch(`${apiBase()}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'error');
  invalidateIfMutation(method);
  return data;
}

/** Inscription ou connexion (seuls appels sans jeton) : renvoie le jeton du compte. */
export async function authRequest(path: '/api/auth/register' | '/api/auth/login', body: Record<string, string>): Promise<{ token: string; userId: string }> {
  const res = await fetch(`${apiBase()}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as { token: string; userId: string; error?: string };
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'error');
  return data;
}

// Après une action (POST, PUT, PATCH, DELETE), toutes les données affichées sont rechargées.
const listeners = new Set<() => void>();
function invalidateIfMutation(method: string): void {
  if (method !== 'GET') listeners.forEach((l) => l());
}

export function invalidateAll(): void {
  listeners.forEach((l) => l());
}

/** Lecture d'une ressource de l'API ; rechargée au retour sur l'écran et après chaque action. */
export function useApi<T>(path: string | null): {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  refresh: () => void;
} {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const current = useRef(path);
  current.current = path;

  const load = useCallback(() => {
    if (!path) return;
    setLoading(true);
    api<T>('GET', path)
      .then((d) => {
        if (current.current !== path) return;
        setData(d);
        setError(null);
      })
      .catch((e: unknown) => {
        if (current.current !== path) return;
        setError(e instanceof ApiError ? e : new ApiError(0, 'network'));
      })
      .finally(() => setLoading(false));
  }, [path]);

  useEffect(() => {
    setData(null);
    load();
    listeners.add(load);
    return () => {
      listeners.delete(load);
    };
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return { data, error, loading, refresh: load };
}

export const ERROR_MESSAGES: Record<string, string> = {
  invalid_pseudo: 'Pseudo invalide : 3 à 20 caractères, sans espace (lettres, chiffres, _ . -).',
  pseudo_taken: 'Ce pseudo est déjà pris.',
  invalid_country: 'Pays inconnu.',
  bio_too_long: 'La bio est trop longue.',
  title_locked: 'Ce titre n’est pas encore débloqué.',
  not_subscribed: 'Abonne-toi au thème pour y publier.',
  blocked: 'Action impossible avec ce joueur.',
  rate_limited: 'Trop d’actions d’un coup, réessaie dans un instant.',
  invalid_text: 'Le texte est vide ou trop long.',
  not_found: 'Introuvable.',
  private: 'Ce profil est privé.',
  hidden: 'Cette liste est masquée.',
  network: 'Serveur injoignable.',
  challenger_offline: 'Le joueur qui t’a défié n’est pas connecté. Réessaie plus tard.',
  busy: 'Tu es déjà en duel : termine-le avant de jouer ce défi.',
  not_connected_by_follow: 'Vous devez être abonnés l’un à l’autre (dans un sens au moins) pour vous défier.',
  forbidden: 'Action non autorisée.',
  already_requested: 'Tu as déjà envoyé une demande à ce joueur.',
  request_waiting_for_you: 'Ce joueur t’a déjà écrit : accepte sa demande dans tes messages.',
  too_many_requests: 'Trop de demandes envoyées à ce joueur ce mois-ci.',
  invalid_reply: 'Impossible de répondre à ce message.',
  invalid_emoji: 'Réaction invalide.',
  invalid_name: 'Nom de groupe vide ou trop long (50 caractères maximum).',
  already_member: 'Ce joueur fait déjà partie du groupe.',
  already_invited: 'Ce joueur a déjà une invitation en attente.',
  excluded: 'Ce joueur est exclu de ce groupe.',
  group_full: 'Le groupe est complet (100 membres maximum).',
  transfer_required: 'Transfère d’abord ton rôle de créateur à un autre membre.',
  last_member: 'Tu es le seul membre : supprime le groupe plutôt que de le quitter.',
  not_member: 'Ce joueur ne fait plus partie du groupe.',
  too_many_pins: 'Trop de messages épinglés (50 maximum).',
  invalid_message: 'Ce message ne peut pas être envoyé.',
  confirmation_required: 'Confirmation nécessaire.',
  suspended: 'Ton compte est suspendu : cette action est temporairement impossible.',
  banned: 'Ce compte a été banni.',
  already_reported: 'Tu as déjà signalé ce contenu. L’équipe de modération va l’examiner.',
  invalid_reason: 'Choisis un motif.',
  invalid_target: 'Ce contenu ne peut pas être signalé.',
  self: 'Action impossible sur toi-même.',
  already_appealed: 'Tu as déjà fait appel de cette sanction.',
  decision_required: 'Écris la décision communiquée au joueur.',
  already_decided: 'Cet appel a déjà été tranché.',
  invalid_duration: 'Durée invalide.',
  invalid_level: 'Niveau de sanction invalide.',
  invalid_restrictions: 'Choisis au moins une restriction.',
  email_required: 'Confirme ton adresse e-mail (Profil → Réglages → Compte et e-mail) pour utiliser la messagerie, les publications et les groupes.',
  invalid_email: 'Adresse e-mail invalide.',
  invalid_code: 'Code incorrect ou expiré. Demande un nouveau code.',
  email_banned: 'Cette adresse e-mail ne peut pas être utilisée.',
  already_verified: 'Cette adresse est déjà confirmée sur ton compte.',
  email_taken: 'Cette adresse est déjà utilisée par un autre compte.',
  invalid_credentials: 'Adresse e-mail ou mot de passe incorrect.',
  weak_password: 'Le mot de passe doit faire au moins 8 caractères.',
  email_required_to_logout: 'Confirme d’abord ton adresse e-mail, sinon tu perdrais ton compte.',
  email_failed: 'L’e-mail n’a pas pu être envoyé. Réessaie.',
  invalid_push_token: 'Notifications push indisponibles sur cet appareil.',
  unsupported_format: 'Format non pris en charge : JPEG, PNG, WebP ou GIF uniquement.',
  too_large: 'Fichier trop lourd (8 Mo maximum).',
  empty_file: 'Fichier vide.',
  too_many_frames: 'Ce GIF est trop long.',
  invalid_media: 'Cette image ne peut pas être envoyée.',
  invalid_sticker: 'Sticker inconnu.',
  invalid_gif: 'Ce GIF ne peut pas être envoyé.',
  gifs_unavailable: 'Les GIF ne sont pas encore disponibles.',
  gif_provider_error: 'Le catalogue de GIF ne répond pas.',
  permission: 'Autorise l’accès dans les réglages de ton téléphone pour continuer.',
};

export function errorMessage(e: unknown): string {
  return e instanceof ApiError ? (ERROR_MESSAGES[e.code] ?? 'Une erreur est survenue.') : 'Une erreur est survenue.';
}
