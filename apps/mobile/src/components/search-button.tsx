import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';

import { Colors } from '@/constants/theme';
import { Tap } from '@/components/tap';

/** Loupe en haut à droite : ouvre la recherche globale (absente en mode jeu). */
export function SearchButton() {
  return (
    <Tap accessibilityRole="button" accessibilityLabel="Rechercher" hitSlop={10} onPress={() => router.push('/search')} style={{ padding: 4 }}>
      <Ionicons name="search" size={24} color={Colors.text} />
    </Tap>
  );
}
