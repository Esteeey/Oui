import type { Category, CategoryId, Theme } from './types';

export const CATEGORIES: Category[] = [
  { id: 'culture-generale', name: 'Culture générale', description: 'Un peu de tout pour tester ta culture générale au quotidien.', icon: '🧠', color: '#FF8A3D' },
  { id: 'cinema', name: 'Cinéma', description: 'Films, réalisateurs et acteurs qui ont marqué le grand écran.', icon: '🎬', color: '#FC0266' },
  { id: 'series', name: 'Séries TV', description: 'Personnages, intrigues et grands moments des séries.', icon: '📺', color: '#B66DFF' },
  { id: 'jeux-video', name: 'Jeux vidéo', description: 'Consoles, studios et jeux qui ont marqué les joueurs.', icon: '🎮', color: '#5B8CFF' },
  { id: 'sports', name: 'Sports', description: 'Tous les quiz autour du sport : compétitions, clubs, records et athlètes.', icon: '🏅', color: '#2FCB7A' },
  { id: 'clubs', name: 'Clubs de foot', description: 'Un quiz par grand club : joueurs, trophées et légendes.', icon: '⚽', color: '#3DBE5B' },
  { id: 'musique', name: 'Musique', description: 'Artistes, tubes et genres musicaux du monde entier.', icon: '🎵', color: '#FC0266' },
  { id: 'histoire', name: 'Histoire', description: 'Grandes dates, civilisations et personnages de l’histoire.', icon: '🏛️', color: '#D9A35B' },
  { id: 'geographie', name: 'Géographie', description: 'Capitales, drapeaux et pays du monde entier.', icon: '🌍', color: '#2BB8D9' },
  { id: 'sciences', name: 'Sciences', description: 'Corps humain, chimie, physique et espace.', icon: '🔬', color: '#4FD1C5' },
  { id: 'automobile', name: 'Automobile', description: 'Constructeurs, modèles et sport automobile.', icon: '🏎️', color: '#FF6B4A' },
  { id: 'gastronomie', name: 'Gastronomie', description: 'Spécialités, ingrédients et traditions culinaires.', icon: '🍽️', color: '#FFB547' },
  { id: 'animaux-nature', name: 'Animaux et nature', description: 'Animaux, records et merveilles du monde vivant.', icon: '🌿', color: '#7BD34F' },
  { id: 'technologie', name: 'Technologie et informatique', description: 'Inventions, informatique et outils du quotidien.', icon: '💻', color: '#6C7CFF' },
  { id: 'mode-luxe', name: 'Mode et luxe', description: 'Créateurs, maisons et grands noms de la mode.', icon: '👜', color: '#E7C26B' },
  { id: 'litterature-bd', name: 'Littérature et BD', description: 'Auteurs, romans et héros de bande dessinée.', icon: '📚', color: '#C9845A' },
  { id: 'culture-pop', name: 'Culture pop', description: 'Célébrités, divertissement et tendances populaires.', icon: '⚡', color: '#FFD23F' },
  { id: 'marques', name: 'Logos et marques', description: 'Logos et marques à reconnaître d’un coup d’œil.', icon: '🏷️', color: '#67D5C6' },
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
    id: 'geo-drapeaux',
    categoryId: 'geographie',
    name: 'Drapeaux du monde',
    description: 'Reconnaître un pays à son drapeau, y compris les sosies.',
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
  // Thèmes de démonstration du mode duel (20 questions chacun, temps de lecture réglé question par question).
  {
    id: 'hist-grandes-dates',
    categoryId: 'histoire',
    name: 'Histoire',
    description: 'Grandes dates et grands personnages, de l’Antiquité au XXe siècle.',
  },
  {
    id: 'nature-animaux',
    categoryId: 'animaux-nature',
    name: 'Le monde animal',
    description: 'Records, curiosités et habitudes des animaux.',
  },
  {
    id: 'music-hits',
    categoryId: 'musique',
    name: 'Hits et artistes',
    description: 'Chansons, albums et artistes qui ont marqué la musique.',
  },
  {
    id: 'gaming-cult',
    categoryId: 'jeux-video',
    name: 'Jeux vidéo cultes',
    description: 'Consoles, studios et jeux qui ont marqué plusieurs générations.',
  },
  {
    id: 'food-world',
    categoryId: 'gastronomie',
    name: 'Saveurs du monde',
    description: 'Spécialités, ingrédients et traditions culinaires.',
  },
  {
    id: 'tech-inventions',
    categoryId: 'technologie',
    name: 'Inventions et technologie',
    description: 'Les idées et outils qui ont transformé notre quotidien.',
  },
  { id: "nature-faune", categoryId: "animaux-nature", name: "Faune remarquable", description: "Animaux, comportements et records du monde vivant.", questionCount: 100 },
  { id: "culture-logique", categoryId: "culture-generale", name: "Logique et énigmes", description: "Questions de raisonnement et casse-têtes.", questionCount: 100 },
  { id: "culture-celebrites", categoryId: "culture-pop", name: "Célébrités", description: "Personnalités célèbres du monde entier.", questionCount: 100 },
  { id: "culture-divertissement", categoryId: "culture-pop", name: "Divertissement", description: "Loisirs, spectacles et culture populaire.", questionCount: 100 },
  { id: "culture-familial", categoryId: "culture-generale", name: "Quiz en famille", description: "Questions accessibles à partager en famille.", questionCount: 100 },
  { id: "histoire-antique", categoryId: "histoire", name: "Antiquité et civilisations", description: "Civilisations et repères de l’Antiquité.", questionCount: 100 },
  { id: "histoire-moderne", categoryId: "histoire", name: "Repères historiques", description: "Dates et événements qui ont marqué l’histoire.", questionCount: 100 },
  { id: "loisirs-passe-temps", categoryId: "culture-pop", name: "Loisirs et passe-temps", description: "Activités, jeux et loisirs du quotidien.", questionCount: 100 },
  { id: "humanites", categoryId: "culture-generale", name: "Arts et humanités", description: "Arts, idées et grandes figures de la pensée.", questionCount: 100 },
  { id: "litterature-auteurs", categoryId: "litterature-bd", name: "Auteurs et littérature", description: "Écrivains et repères littéraires.", questionCount: 100 },
  { id: "litterature-oeuvres", categoryId: "litterature-bd", name: "Œuvres littéraires", description: "Romans, personnages et œuvres célèbres.", questionCount: 100 },
  { id: "cinema-acteurs", categoryId: "cinema", name: "Acteurs et cinéma", description: "Acteurs, rôles et histoire du cinéma.", questionCount: 100 },
  { id: "musique-artistes", categoryId: "musique", name: "Artistes et musique", description: "Musiciens, chansons et albums.", questionCount: 100 },
  { id: "musique-cultures", categoryId: "musique", name: "Cultures musicales", description: "Genres, instruments et traditions musicales.", questionCount: 100 },
  { id: "personnalites", categoryId: "culture-pop", name: "Personnalités", description: "Figures connues et parcours remarquables.", questionCount: 100 },
  { id: "mythes-religions", categoryId: "histoire", name: "Mythes et religions", description: "Récits mythologiques et traditions religieuses.", questionCount: 100 },
  { id: "sports-equipes", categoryId: "sports", name: "Sports et équipes", description: "Compétitions, équipes et disciplines sportives.", questionCount: 100 },
  { id: "sports-football", categoryId: "sports", name: "Football", description: "Clubs, joueurs, records et grandes finales.", questionCount: 100 },
  { id: "musique-one-direction", categoryId: "musique", name: "One Direction", description: "Albums, tubes, carrières solo et histoire du groupe.", questionCount: 100 },
  { id: "series-game-of-thrones", categoryId: "series", name: "Game of Thrones", description: "Maisons, personnages et grands moments de la série.", questionCount: 100 },
  { id: "logos-marques", categoryId: "marques", name: "Logos des marques", description: "Reconnais une marque à son logo.", questionCount: 100 },
  { id: "club-psg", categoryId: "clubs", name: "Paris Saint-Germain", description: "Joueurs, trophées et grandes soirées du club parisien.", questionCount: 100 },
  { id: "club-om", categoryId: "clubs", name: "Olympique de Marseille", description: "Légendes, Vélodrome et histoire du club phocéen.", questionCount: 100 },
  { id: "club-ol", categoryId: "clubs", name: "Olympique lyonnais", description: "Les années de domination, les joueurs et l’histoire du club.", questionCount: 100 },
  { id: "club-real-madrid", categoryId: "clubs", name: "Real Madrid", description: "Bernabéu, Galactiques et Ligues des champions.", questionCount: 100 },
  { id: "club-barcelone", categoryId: "clubs", name: "FC Barcelone", description: "Camp Nou, La Masia et grandes époques du Barça.", questionCount: 100 },
  { id: "club-man-united", categoryId: "clubs", name: "Manchester United", description: "Old Trafford, ses légendes et ses titres.", questionCount: 100 },
  { id: "club-man-city", categoryId: "clubs", name: "Manchester City", description: "L’Etihad, les joueurs et la montée vers les sommets.", questionCount: 100 },
  { id: "club-liverpool", categoryId: "clubs", name: "Liverpool", description: "Anfield, ses entraîneurs et ses soirées européennes.", questionCount: 100 },
  { id: "club-arsenal", categoryId: "clubs", name: "Arsenal", description: "Highbury, Emirates et les Invincibles.", questionCount: 100 },
  { id: "club-chelsea", categoryId: "clubs", name: "Chelsea", description: "Stamford Bridge, ses buteurs et ses trophées.", questionCount: 100 },
  { id: "club-bayern", categoryId: "clubs", name: "Bayern Munich", description: "Le géant bavarois, ses records et ses légendes.", questionCount: 100 },
  { id: "club-juventus", categoryId: "clubs", name: "Juventus", description: "Turin, ses champions et ses Scudetti.", questionCount: 100 },
  { id: "manga-anime", categoryId: "litterature-bd", name: "Manga et animé", description: "Auteurs, héros et grandes séries japonaises.", questionCount: 100 },
  { id: "series-cultes", categoryId: "series", name: "Séries cultes", description: "Les séries qui ont marqué plusieurs générations.", questionCount: 100 },
  { id: "rap-francais", categoryId: "musique", name: "Rap français", description: "Rappeurs, albums et tubes du rap français.", questionCount: 100 },
  { id: "auto-f1", categoryId: "automobile", name: "Automobile et F1", description: "Constructeurs, modèles, pilotes et grandes courses.", questionCount: 100 },
  { id: "marvel-dc", categoryId: "culture-pop", name: "Marvel et DC", description: "Super-héros, films et bandes dessinées.", questionCount: 100 },
  { id: "monde-arabo-musulman", categoryId: "histoire", name: "Monde arabo-musulman", description: "Histoire, savants, villes et cultures du monde arabo-musulman.", questionCount: 100 },
];

export function registerTheme(theme: Theme): void {
  const index = THEMES.findIndex((item) => item.id === theme.id);
  if (index < 0) THEMES.push(theme); else THEMES[index] = theme;
}

export function getCategory(id: string): Category | undefined {
  return CATEGORIES.find((c) => c.id === id);
}

export function getTheme(id: string): Theme | undefined {
  return THEMES.find((t) => t.id === id);
}

export function themesOf(categoryId: CategoryId): Theme[] {
  return THEMES.filter((t) => t.categoryId === categoryId);
}
