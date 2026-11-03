import { MEDALS, levelFromXp, type EarnedMedal } from '@qu1z/shared';
import type { ComponentProps } from 'react';
import type Ionicons from '@expo/vector-icons/Ionicons';

import { bestWinStreak, type DuelRecord, type ThemeStats } from '@/state/progress';

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  unlocked: boolean;
}

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Médailles enregistrées par le serveur : toutes les médailles (verrouillées si pas encore gagnées), puis les podiums de saison. */
export function medalBadges(earned: EarnedMedal[]): Badge[] {
  const got = new Set(earned.map((m) => m.id));
  const podiums = earned
    .filter((m) => m.season)
    .sort((a, b) => b.earnedAt - a.earnedAt)
    .map((m): Badge => ({
      id: m.id,
      name: `Podium ${m.season!.name}`,
      description: `${m.season!.rank === 1 ? '1ʳᵉ' : `${m.season!.rank}ᵉ`} place de la saison`,
      icon: 'medal',
      unlocked: true,
    }));
  return [...MEDALS.map((m) => ({ ...m, icon: m.icon as IconName, unlocked: got.has(m.id) })), ...podiums];
}

/** Médailles calculées d'après l'historique local, si le serveur est injoignable. */
export function computeBadges(history: DuelRecord[], stats: Record<string, ThemeStats>): Badge[] {
  const answers = history.flatMap((d) => d.player);
  return [
    { id: 'premier-duel', name: 'Premier duel', description: 'Jouer un duel', icon: 'flag', unlocked: history.length > 0 },
    { id: 'victoire', name: 'Première victoire', description: 'Gagner un duel', icon: 'trophy', unlocked: history.some((d) => d.outcome === 'win') },
    { id: 'sans-faute', name: 'Sans-faute', description: '7 bonnes réponses sur 7', icon: 'star', unlocked: history.some((d) => d.player.every((a) => a.correct)) },
    { id: 'eclair', name: 'Éclair', description: 'Bonne réponse en moins d’une seconde', icon: 'flash', unlocked: answers.some((a) => a.correct && a.responseMs < 1000) },
    { id: 'serie', name: 'En feu', description: '3 victoires d’affilée', icon: 'flame', unlocked: bestWinStreak(history) >= 3 },
    { id: 'explorateur', name: 'Explorateur', description: 'Jouer dans 3 thèmes', icon: 'compass', unlocked: Object.keys(stats).length >= 3 },
    { id: 'passionne', name: 'Passionné', description: 'Atteindre le niveau 5 dans un thème', icon: 'ribbon', unlocked: Object.values(stats).some((s) => levelFromXp(s.xp).level >= 5) },
    { id: 'revanche', name: 'Duelliste', description: 'Battre un vrai joueur', icon: 'people', unlocked: history.some((d) => d.opponentId && d.outcome === 'win') },
  ];
}
