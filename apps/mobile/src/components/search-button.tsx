import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable } from 'react-native';

import { Colors } from '@/constants/theme';

/** Loupe en haut à droite : ouvre la recherche globale (absente en mode jeu). */
export function SearchButton() {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Rechercher" hitSlop={10} onPress={() => router.push('/search')} style={{ padding: 4 }}>
      <Ionicons name="search" size={24} color={Colors.text} />
    </Pressable>
  );
}
