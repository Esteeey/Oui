import type { Category, CategoryId, Theme } from './types';

export const CATEGORIES: Category[] = [
  { id: 'culture-generale', name: 'Culture générale', icon: '🧠', color: '#FF8A3D' },
  { id: 'cinema', name: 'Cinéma', icon: '🎬', color: '#FF5C7A' },
  { id: 'series', name: 'Séries TV', icon: '📺', color: '#B66DFF' },
  { id: 'jeux-video', name: 'Jeux vidéo', icon: '🎮', color: '#5B8CFF' },
  { id: 'sports', name: 'Sports', icon: '🏅', color: '#2FCB7A' },
  { id: 'musique', name: 'Musique', icon: '🎵', color: '#FF4FB8' },
  { id: 'histoire', name: 'Histoire', icon: '🏛️', color: '#D9A35B' },
  { id: 'geographie', name: 'Géographie', icon: '🌍', color: '#2BB8D9' },
  { id: 'sciences', name: 'Sciences', icon: '🔬', color: '#4FD1C5' },
  { id: 'automobile', name: 'Automobile', icon: '🏎️', color: '#FF6B4A' },
  { id: 'gastronomie', name: 'Gastronomie', icon: '🍽️', color: '#FFB547' },
  { id: 'animaux-nature', name: 'Animaux et nature', icon: '🌿', color: '#7BD34F' },
  { id: 'technologie', name: 'Technologie et informatique', icon: '💻', color: '#6C7CFF' },
  { id: 'mode-luxe', name: 'Mode et luxe', icon: '👜', color: '#E7C26B' },
  { id: 'litterature-bd', name: 'Littérature et BD', icon: '📚', color: '#C9845A' },
  { id: 'culture-pop', name: 'Culture pop', icon: '⚡', color: '#FFD23F' },
];

export const THEMES: Theme[] = [
  {
    id: 'cg-melange',
    categoryId: 'culture-generale',
    name: 'Le grand mélange',
    description: 'Un peu de tout, pour tester sa culture générale.',
  },
  {
    id: 'geo-capitales',
    categoryId: 'geographie',
    name: 'Capitales du monde',
    description: 'Les capitales, y compris les plus piégeuses.',
  },
  {
    id: 'sci-essentiels',
    categoryId: 'sciences',
    name: 'Les essentiels',
    description: 'Corps humain, chimie, physique et espace.',
  },
  {
    id: 'cine-grands-films',
    categoryId: 'cinema',
    name: 'Grands films',
    description: 'Réalisateurs, acteurs et films qui ont marqué le cinéma.',
  },
  {
    id: 'sports-jo',
    categoryId: 'sports',
    name: 'Jeux olympiques',
    description: 'Histoire, villes hôtes et records des JO.',
  },
];

export function getCategory(id: string): Category | undefined {
  return CATEGORIES.find((c) => c.id === id);
}

export function getTheme(id: string): Theme | undefined {
  return THEMES.find((t) => t.id === id);
}

export function themesOf(categoryId: CategoryId): Theme[] {
  return THEMES.filter((t) => t.categoryId === categoryId);
}
