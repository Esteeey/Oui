import { INITIAL_RATING, THEMES, divisionFor, getTheme } from '@qu1z/shared';

import { minutesAgo } from '@/utils/time';

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
  /** Horodatage (ms). */
  at: number;
  likes: number;
  event: FeedEvent;
}

export const FEED: FeedItem[] = [
  { id: 'f1', playerId: 'lina', themeId: 'cine-grands-films', at: minutesAgo(8), likes: 4, event: { kind: 'perfect' } },
  { id: 'f2', playerId: 'malik', themeId: 'geo-capitales', at: minutesAgo(25), likes: 2, event: { kind: 'division', division: divisionFor(demoRating('malik', 'geo-capitales')).name } },
  { id: 'f3', playerId: 'ines', themeId: 'sci-essentiels', at: minutesAgo(65), likes: 6, event: { kind: 'win', opponent: 'Théo', score: 612, opponentScore: 540 } },
  { id: 'f4', playerId: 'yanis', themeId: 'sports-jo', at: minutesAgo(190), likes: 1, event: { kind: 'level', level: 12 } },
  { id: 'f5', playerId: 'chloe', themeId: 'sci-essentiels', at: minutesAgo(1500), likes: 3, event: { kind: 'badge', badge: 'Éclair' } },
  { id: 'f6', playerId: 'lina', themeId: 'cg-melange', at: minutesAgo(1620), likes: 5, event: { kind: 'win', opponent: 'Malik', score: 575, opponentScore: 571 } },
];

/** Abonnements de départ : personnes suivies et thèmes. */
export const INITIAL_FOLLOWING = ['lina', 'malik', 'chloe', 'yanis', 'ines'];
export const INITIAL_THEME_SUBSCRIPTIONS = ['cine-grands-films', 'geo-capitales'];

/**
 * Publication écrite.
 * - `profile` : sur le mur de son auteur (seul l'auteur publie sur son mur).
 * - `theme` : dans le fil d'un thème (il faut y être abonné pour publier).
 */
export type PostTarget = { kind: 'profile' } | { kind: 'theme'; themeId: string };

export interface Post {
  id: string;
  /** `null` = le joueur lui-même. */
  authorId: string | null;
  target: PostTarget;
  text: string;
  at: number;
  likes: number;
}

export const INITIAL_POSTS: Post[] = [
  { id: 'p1', authorId: 'lina', target: { kind: 'theme', themeId: 'cine-grands-films' }, text: 'Question du jour pour les cinéphiles : votre film préféré de 1994 ? Pour moi c’est « Léon », sans hésiter.', at: minutesAgo(15), likes: 9 },
  { id: 'p2', authorId: 'malik', target: { kind: 'profile' }, text: 'Enfin Platine en Capitales du monde ! Merci à tous ceux qui m’ont battu sur Canberra, je ne me ferai plus avoir.', at: minutesAgo(30), likes: 14 },
  { id: 'p3', authorId: 'sarah', target: { kind: 'theme', themeId: 'geo-capitales' }, text: 'Astuce : la capitale du Nigeria n’est pas Lagos mais Abuja depuis 1991. Je vois encore beaucoup de monde tomber dans le piège !', at: minutesAgo(70), likes: 21 },
  { id: 'p4', authorId: 'ines', target: { kind: 'profile' }, text: 'Troisième sans-faute de la semaine. Qui veut tenter de m’arrêter en Sciences ?', at: minutesAgo(120), likes: 7 },
  { id: 'p5', authorId: 'theo', target: { kind: 'theme', themeId: 'cine-grands-films' }, text: 'On organise un tournoi entre amis ce week-end sur le thème Grands films. Qui est partant ?', at: minutesAgo(240), likes: 5 },
  { id: 'p6', authorId: 'hugo', target: { kind: 'theme', themeId: 'sports-jo' }, text: 'Petit rappel : un marathon fait 42,195 km. Ne me remerciez pas pour le point gagné.', at: minutesAgo(300), likes: 3 },
  { id: 'p7', authorId: 'chloe', target: { kind: 'profile' }, text: 'Révisions de bio terminées, place aux duels !', at: minutesAgo(600), likes: 4 },
  { id: 'p8', authorId: 'yanis', target: { kind: 'theme', themeId: 'sports-jo' }, text: 'Qui se souvient de la ville hôte des JO de 2012 sans chercher ?', at: minutesAgo(1400), likes: 2 },
  { id: 'p9', authorId: 'malik', target: { kind: 'theme', themeId: 'geo-capitales' }, text: 'Berne, pas Zurich. Je le répète chaque semaine.', at: minutesAgo(2000), likes: 11 },
];

export interface Comment {
  id: string;
  postId: string;
  /** `null` = le joueur lui-même. */
  authorId: string | null;
  text: string;
  at: number;
}

export const INITIAL_COMMENTS: Comment[] = [
  { id: 'c1', postId: 'p1', authorId: 'theo', text: '« Pulp Fiction », évidemment !', at: minutesAgo(12) },
  { id: 'c2', postId: 'p1', authorId: 'ines', text: '« Forrest Gump » pour moi.', at: minutesAgo(9) },
  { id: 'c3', postId: 'p2', authorId: 'lina', text: 'Bravo ! Prochaine étape : Diamant.', at: minutesAgo(25) },
  { id: 'c4', postId: 'p3', authorId: 'malik', text: 'Je me suis fait avoir la semaine dernière…', at: minutesAgo(60) },
  { id: 'c5', postId: 'p3', authorId: 'yanis', text: 'Merci pour l’astuce !', at: minutesAgo(45) },
  { id: 'c6', postId: 'p4', authorId: 'chloe', text: 'Défi accepté.', at: minutesAgo(100) },
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

/** Nombre d'abonnés de démonstration d'un thème (hors le joueur). */
export function demoThemeSubscribers(themeId: string): number {
  return 300 + (hash('subs' + themeId) % 4700);
}
