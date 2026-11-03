/** Médailles : gagnées en jouant, enregistrées par le serveur et visibles sur le profil (selon sa confidentialité). */
export interface MedalInfo {
  id: string;
  name: string;
  description: string;
  /** Nom d'icône Ionicons. */
  icon: string;
}

export const MEDALS: MedalInfo[] = [
  { id: 'premier-duel', name: 'Premier duel', description: 'Jouer un duel', icon: 'flag' },
  { id: 'victoire', name: 'Première victoire', description: 'Gagner un duel', icon: 'trophy' },
  { id: 'sans-faute', name: 'Sans-faute', description: '7 bonnes réponses sur 7', icon: 'star' },
  { id: 'eclair', name: 'Éclair', description: 'Bonne réponse en moins d’une seconde', icon: 'flash' },
  { id: 'serie', name: 'En feu', description: '3 victoires d’affilée', icon: 'flame' },
  { id: 'explorateur', name: 'Explorateur', description: 'Jouer dans 3 thèmes', icon: 'compass' },
  { id: 'passionne', name: 'Passionné', description: 'Atteindre le niveau 5 dans un thème', icon: 'ribbon' },
  { id: 'revanche', name: 'Duelliste', description: 'Battre un vrai joueur', icon: 'people' },
];

/** Médaille gagnée ; `season` pour un podium de fin de saison (id de médaille « season:AAAA-MM »). */
export interface EarnedMedal {
  id: string;
  earnedAt: number;
  season?: { id: string; name: string; rank: number };
}

/** Joueurs récompensés à la fin de chaque saison. */
export const SEASON_PODIUM = 3;

export interface Season {
  /** « AAAA-MM ». */
  id: string;
  name: string;
  startsAt: number;
  endsAt: number;
}

const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

/** Saisons d'un mois calendaire (UTC) : le classement de saison compte l'XP gagnée pendant le mois. */
export function seasonOf(at: number): Season {
  const d = new Date(at);
  return seasonFromParts(d.getUTCFullYear(), d.getUTCMonth());
}

export function seasonById(id: string): Season | null {
  const m = /^(\d{4})-(\d{2})$/.exec(id);
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return null;
  return seasonFromParts(Number(m[1]), Number(m[2]) - 1);
}

function seasonFromParts(year: number, month: number): Season {
  return {
    id: `${year}-${String(month + 1).padStart(2, '0')}`,
    name: `${MONTHS[month]} ${year}`,
    startsAt: Date.UTC(year, month, 1),
    endsAt: Date.UTC(year, month + 1, 1),
  };
}
