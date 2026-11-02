import { levelFromXp } from '@qu1z/shared';
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
    { id: 'revanche', name: 'Revanche', description: 'Battre un ami', icon: 'people', unlocked: history.some((d) => d.opponentId && d.outcome === 'win') },
  ];
}
