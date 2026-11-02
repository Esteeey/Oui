import type { ThemeInfo } from '@qu1z/shared';

import { useApi } from '@/net/api';

/** Abonnés réels de chaque thème et mes abonnements, depuis le serveur. */
export function useThemeInfos(): Map<string, ThemeInfo> {
  const { data } = useApi<{ themes: ThemeInfo[] }>('/api/themes');
  return new Map((data?.themes ?? []).map((t) => [t.themeId, t]));
}

export function subscribersLabel(info: ThemeInfo | undefined): string {
  if (!info) return '';
  const n = info.subscribers.toLocaleString('fr-FR').replace(/ | /g, ' ');
  return `${n} abonné${info.subscribers > 1 ? 's' : ''}${info.subscribed ? ' · abonné ✓' : ''}`;
}
