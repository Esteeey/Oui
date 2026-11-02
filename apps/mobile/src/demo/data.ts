import { INITIAL_RATING, THEMES, divisionFor, getTheme } from '@qu1z/shared';

/**
 * Données de démonstration du prototype : joueurs fictifs, fil d'actualité, défis.
 * Elles seront remplacées par les données du serveur. L'interface l'indique clairement.
 */

export interface DemoPlayer {
  id: string;
  name: string;
  color: string;
  country: string;
  bio: string;
  online: boolean;
  /** Thèmes mis en avant sur le profil. */
  showcase: string[];
}

export const PLAYERS: DemoPlayer[] = [
  { id: 'lina', name: 'Lina', color: '#FF8FB1', country: '🇫🇷', bio: 'Cinéphile, imbattable sur les années 90.', online: true, showcase: ['cine-grands-films', 'cg-melange'] },
  { id: 'malik', name: 'Malik', color: '#7AB8FF', country: '🇧🇪', bio: 'Je connais toutes les capitales. Toutes.', online: true, showcase: ['geo-capitales', 'sports-jo'] },
  { id: 'chloe', name: 'Chloé', color: '#B68CFF', country: '🇨🇦', bio: 'Étudiante en biologie.', online: false, showcase: ['sci-essentiels'] },
  { id: 'yanis', name: 'Yanis', color: '#FFB547', country: '🇫🇷', bio: 'Sport le matin, quiz le soir.', online: false, showcase: ['sports-jo', 'geo-capitales'] },
  { id: 'ines', name: 'Inès', color: '#5FE3D0', country: '🇨🇭', bio: 'Collectionneuse de sans-faute.', online: true, showcase: ['cg-melange', 'sci-essentiels'] },
  { id: 'theo', name: 'Théo', color: '#9BE15D', country: '🇫🇷', bio: 'Toujours partant pour une revanche.', online: false, showcase: ['cine-grands-films'] },
  { id: 'sarah', name: 'Sarah', color: '#FF7A59', country: '🇲🇦', bio: 'Géographie et voyages.', online: false, showcase: ['geo-capitales'] },
  { id: 'hugo', name: 'Hugo', color: '#E7C26B', country: '🇫🇷', bio: 'Fan de JO depuis 2024.', online: true, showcase: ['sports-jo'] },
];

export const INITIAL_FRIENDS = ['lina', 'malik', 'chloe', 'yanis', 'ines'];
export const INITIAL_REQUESTS = ['hugo', 'sarah'];

export interface Challenge {
  id: string;
  fromId: string;
  themeId: string;
  ago: string;
}

export const INITIAL_CHALLENGES: Challenge[] = [
  { id: 'ch-1', fromId: 'lina', themeId: 'cine-grands-films', ago: 'il y a 12 min' },
  { id: 'ch-2', fromId: 'malik', themeId: 'geo-capitales', ago: 'il y a 2 h' },
];

export type FeedEvent =
  | { kind: 'win'; opponent: string; score: number; opponentScore: number }
  | { kind: 'level'; level: number }
  | { kind: 'division'; division: string }
  | { kind: 'perfect' }
  | { kind: 'badge'; badge: string };

export interface FeedItem {
  id: string;
  playerId: string;
  themeId: string;
  ago: string;
  likes: number;
  event: FeedEvent;
}

export const FEED: FeedItem[] = [
  { id: 'f1', playerId: 'lina', themeId: 'cine-grands-films', ago: '8 min', likes: 4, event: { kind: 'perfect' } },
  { id: 'f2', playerId: 'malik', themeId: 'geo-capitales', ago: '25 min', likes: 2, event: { kind: 'division', division: divisionFor(demoRating('malik', 'geo-capitales')).name } },
  { id: 'f3', playerId: 'ines', themeId: 'sci-essentiels', ago: '1 h', likes: 6, event: { kind: 'win', opponent: 'Théo', score: 612, opponentScore: 540 } },
  { id: 'f4', playerId: 'yanis', themeId: 'sports-jo', ago: '3 h', likes: 1, event: { kind: 'level', level: 12 } },
  { id: 'f5', playerId: 'chloe', themeId: 'sci-essentiels', ago: 'hier', likes: 3, event: { kind: 'badge', badge: 'Éclair' } },
  { id: 'f6', playerId: 'lina', themeId: 'cg-melange', ago: 'hier', likes: 5, event: { kind: 'win', opponent: 'Malik', score: 575, opponentScore: 571 } },
];

export interface DemoNotification {
  id: string;
  icon: 'flash' | 'people' | 'trophy' | 'heart';
  text: string;
  ago: string;
}

export const NOTIFICATIONS: DemoNotification[] = [
  { id: 'n1', icon: 'flash', text: 'Lina te défie en Grands films.', ago: '12 min' },
  { id: 'n2', icon: 'people', text: 'Hugo veut devenir ton ami.', ago: '40 min' },
  { id: 'n3', icon: 'flash', text: 'Malik te défie en Capitales du monde.', ago: '2 h' },
  { id: 'n4', icon: 'trophy', text: 'Le tournoi de la semaine commence vendredi.', ago: 'hier' },
  { id: 'n5', icon: 'heart', text: 'Inès et 2 autres ont applaudi ton dernier duel.', ago: 'hier' },
];

export function getPlayer(id: string): DemoPlayer | undefined {
  return PLAYERS.find((p) => p.id === id);
}

/** Petit hachage stable pour générer des statistiques de démonstration reproductibles. */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function demoRating(playerId: string, themeId: string): number {
  const bonus = getPlayer(playerId)?.showcase.includes(themeId) ? 350 : 0;
  return INITIAL_RATING + bonus + (hash(playerId + themeId) % 450) - 100;
}

export function demoXp(playerId: string, themeId: string): number {
  const bonus = getPlayer(playerId)?.showcase.includes(themeId) ? 6000 : 0;
  return bonus + (hash(themeId + playerId) % 3500);
}

export function demoGlobalRating(playerId: string): number {
  const ratings = THEMES.map((t) => demoRating(playerId, t.id)).sort((a, b) => b - a);
  return Math.round((ratings[0] + ratings[1] + ratings[2]) / 3);
}

export function themeName(themeId: string): string {
  return getTheme(themeId)?.name ?? themeId;
}

/** Bilan de démonstration (victoires, nuls, défaites) d'un joueur fictif. */
export function demoRecord(playerId: string): { wins: number; draws: number; losses: number } {
  const duels = 800 + (hash(playerId) % 4200);
  const winRate = 0.48 + (hash(playerId + 'w') % 20) / 100;
  const drawRate = 0.03 + (hash(playerId + 'd') % 5) / 100;
  const wins = Math.round(duels * winRate);
  const draws = Math.round(duels * drawRate);
  return { wins, draws, losses: duels - wins - draws };
}
