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
  busy: 'L’un de vous est déjà en duel.',
  not_connected_by_follow: 'Vous devez être abonnés l’un à l’autre (dans un sens au moins) pour vous défier.',
  forbidden: 'Action non autorisée.',
};

export function errorMessage(e: unknown): string {
  return e instanceof ApiError ? (ERROR_MESSAGES[e.code] ?? 'Une erreur est survenue.') : 'Une erreur est survenue.';
}
