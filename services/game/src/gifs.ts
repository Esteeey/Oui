import type { GifView } from '@qu1z/shared';

import { SocialError } from './social';

/** Catalogue de GIF externe. Sans clé d'API, les GIF sont simplement indisponibles dans l'application. */
export interface GifProvider {
  readonly name: string;
  search(query: string, limit: number): Promise<GifView[]>;
  trending(limit: number): Promise<GifView[]>;
  /** Hôtes autorisés pour les adresses de GIF envoyées dans un message. */
  readonly hosts: RegExp;
}

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new SocialError(502, 'gif_provider_error');
  return res.json();
}

/** GIPHY (clé : GIPHY_API_KEY). Classement « pg-13 » maximum. */
export class GiphyProvider implements GifProvider {
  readonly name = 'giphy';
  readonly hosts = /^(media\d*|i)\.giphy\.com$/;
  constructor(private readonly key: string) {}

  private map(items: any[]): GifView[] {
    return items
      .map((g) => {
        const full = g.images?.downsized_medium ?? g.images?.original;
        const preview = g.images?.fixed_width_downsampled ?? g.images?.fixed_width ?? full;
        if (!full?.url) return null;
        return { id: String(g.id), url: full.url, previewUrl: preview.url, width: Number(full.width), height: Number(full.height), title: String(g.title ?? '') };
      })
      .filter((g): g is GifView => g !== null);
  }

  async search(q: string, limit: number) {
    const p = new URLSearchParams({ api_key: this.key, q, limit: String(limit), rating: 'pg-13', lang: 'fr' });
    return this.map((await getJson(`https://api.giphy.com/v1/gifs/search?${p}`)).data ?? []);
  }

  async trending(limit: number) {
    const p = new URLSearchParams({ api_key: this.key, limit: String(limit), rating: 'pg-13' });
    return this.map((await getJson(`https://api.giphy.com/v1/gifs/trending?${p}`)).data ?? []);
  }
}

/** Tenor (clé : TENOR_API_KEY). Filtre de contenu « medium ». */
export class TenorProvider implements GifProvider {
  readonly name = 'tenor';
  readonly hosts = /^media\d*\.tenor\.com$/;
  constructor(private readonly key: string) {}

  private map(items: any[]): GifView[] {
    return items
      .map((g) => {
        const full = g.media_formats?.mediumgif ?? g.media_formats?.gif;
        const preview = g.media_formats?.tinygif ?? full;
        if (!full?.url) return null;
        return { id: String(g.id), url: full.url, previewUrl: preview.url, width: Number(full.dims?.[0]), height: Number(full.dims?.[1]), title: String(g.content_description ?? '') };
      })
      .filter((g): g is GifView => g !== null);
  }

  private params(extra: Record<string, string>) {
    return new URLSearchParams({ key: this.key, client_key: 'qu1z', contentfilter: 'medium', locale: 'fr_FR', media_filter: 'mediumgif,gif,tinygif', ...extra });
  }

  async search(q: string, limit: number) {
    return this.map((await getJson(`https://tenor.googleapis.com/v2/search?${this.params({ q, limit: String(limit) })}`)).results ?? []);
  }

  async trending(limit: number) {
    return this.map((await getJson(`https://tenor.googleapis.com/v2/featured?${this.params({ limit: String(limit) })}`)).results ?? []);
  }
}

export function gifProviderFromEnv(env = process.env): GifProvider | null {
  if (env.GIPHY_API_KEY) return new GiphyProvider(env.GIPHY_API_KEY);
  if (env.TENOR_API_KEY) return new TenorProvider(env.TENOR_API_KEY);
  return null;
}

/** Valide un GIF envoyé par le client : adresse https d'un hôte du fournisseur, dimensions raisonnables. */
export function validateGif(provider: GifProvider | null, raw: unknown): { id: string; url: string; width: number; height: number } {
  if (!provider) throw new SocialError(503, 'gifs_unavailable');
  if (!raw || typeof raw !== 'object') throw new SocialError(400, 'invalid_gif');
  const g = raw as Record<string, unknown>;
  const id = String(g.id ?? '');
  const url = String(g.url ?? '');
  const width = Number(g.width);
  const height = Number(g.height);
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new SocialError(400, 'invalid_gif');
  }
  if (parsed.protocol !== 'https:' || !provider.hosts.test(parsed.hostname) || url.length > 500) throw new SocialError(400, 'invalid_gif');
  if (!id || id.length > 64 || !Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 2000 || height > 2000) {
    throw new SocialError(400, 'invalid_gif');
  }
  return { id, url, width, height };
}
