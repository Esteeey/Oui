import type { Difficulty, Question } from './types';

/**
 * Premier jeu de questions, rédigé pour Qu1z (prototype).
 * Format : [énoncé, bonne réponse, leurre, leurre, leurre, difficulté].
 * À terme, les questions viendront de la base de données et du back-office.
 */
type Row = [string, string, string, string, string, Difficulty];

function build(themeId: string, rows: Row[]): Question[] {
  return rows.map(([text, a, b, c, d, difficulty], i) => ({
    id: `${themeId}-${String(i + 1).padStart(3, '0')}`,
    themeId,
    text,
    choices: [a, b, c, d],
    difficulty,
  }));
}

const cgMelange = build('cg-melange', [
  ['Combien de côtés possède un hexagone ?', '6', '5', '7', '8', 1],
  ['Quelle est la capitale du Canada ?', 'Ottawa', 'Toronto', 'Montréal', 'Vancouver', 2],
  ['Quel est le plus grand océan du monde ?', 'Pacifique', 'Atlantique', 'Indien', 'Arctique', 1],
  ['Qui a peint « La Joconde » ?', 'Léonard de Vinci', 'Michel-Ange', 'Raphaël', 'Botticelli', 1],
  ["Quel est le symbole chimique de l'or ?", 'Au', 'Ag', 'Or', 'Go', 2],
  ["En quelle année l'homme a-t-il marché sur la Lune pour la première fois ?", '1969', '1965', '1972', '1975', 2],
  ['Combien de minutes y a-t-il dans une journée ?', '1 440', '1 240', '1 600', '2 400', 2],
  ['Quelle langue est la plus parlée au Brésil ?', 'Le portugais', "L'espagnol", "L'anglais", 'Le français', 1],
  ['Quelle planète est surnommée « la planète rouge » ?', 'Mars', 'Vénus', 'Jupiter', 'Saturne', 1],
  ['Combien de cordes possède une guitare classique ?', '6', '4', '5', '8', 2],
  ['Quel pays a offert la statue de la Liberté aux États-Unis ?', 'La France', 'Le Royaume-Uni', "L'Espagne", "L'Italie", 2],
  ['Combien de pattes possède une araignée ?', '8', '6', '10', '12', 1],
]);

const geoCapitales = build('geo-capitales', [
  ["Quelle est la capitale de l'Australie ?", 'Canberra', 'Sydney', 'Melbourne', 'Perth', 2],
  ['Quelle est la capitale du Japon ?', 'Tokyo', 'Kyoto', 'Osaka', 'Yokohama', 1],
  ['Quelle est la capitale du Portugal ?', 'Lisbonne', 'Porto', 'Coimbra', 'Faro', 1],
  ['Quelle est la capitale du Maroc ?', 'Rabat', 'Casablanca', 'Marrakech', 'Fès', 2],
  ['Quelle est la capitale de la Turquie ?', 'Ankara', 'Istanbul', 'Izmir', 'Antalya', 2],
  ['Quelle est la capitale du Brésil ?', 'Brasília', 'Rio de Janeiro', 'São Paulo', 'Salvador', 2],
  ['Quelle est la capitale de la Norvège ?', 'Oslo', 'Bergen', 'Trondheim', 'Stavanger', 1],
  ["Quelle est la capitale de l'Égypte ?", 'Le Caire', 'Alexandrie', 'Louxor', 'Gizeh', 1],
  ['Quelle est la capitale de la Nouvelle-Zélande ?', 'Wellington', 'Auckland', 'Christchurch', 'Queenstown', 3],
  ['Quelle est la capitale de la Suisse ?', 'Berne', 'Zurich', 'Genève', 'Lausanne', 2],
  ['Quelle est la capitale du Nigeria ?', 'Abuja', 'Lagos', 'Kano', 'Ibadan', 3],
  ['Quelle est la capitale du Vietnam ?', 'Hanoï', 'Hô Chi Minh-Ville', 'Da Nang', 'Hué', 2],
]);

const sciEssentiels = build('sci-essentiels', [
  ["Combien d'os compte le squelette d'un adulte ?", '206', '186', '226', '256', 2],
  ['Quel gaz les plantes absorbent-elles pour la photosynthèse ?', 'Le dioxyde de carbone', "L'oxygène", "L'azote", "L'hydrogène", 1],
  ['Quelle est la vitesse approximative de la lumière dans le vide ?', '300 000 km/s', '30 000 km/s', '3 000 000 km/s', '300 km/s', 2],
  ["Quel organe produit l'insuline ?", 'Le pancréas', 'Le foie', 'Les reins', "L'estomac", 2],
  ["Quelle est la formule chimique de l'eau ?", 'H₂O', 'CO₂', 'O₂', 'H₂O₂', 1],
  ['Quelle planète est la plus proche du Soleil ?', 'Mercure', 'Vénus', 'Mars', 'La Terre', 1],
  ["À quelle température l'eau bout-elle au niveau de la mer ?", '100 °C', '90 °C', '110 °C', '120 °C', 1],
  ['Quel scientifique a formulé la théorie de la relativité ?', 'Albert Einstein', 'Isaac Newton', 'Niels Bohr', 'Marie Curie', 1],
  ['Combien de chromosomes possède une cellule humaine (hors cellules reproductrices) ?', '46', '23', '44', '48', 3],
  ['Quelle est la plus grosse planète du système solaire ?', 'Jupiter', 'Saturne', 'Neptune', 'Uranus', 1],
  ['Quel est le symbole chimique du fer ?', 'Fe', 'Fr', 'Fi', 'F', 2],
  ['Quelle partie de la cellule contient l\'ADN ?', 'Le noyau', 'La membrane', 'Le cytoplasme', 'La paroi', 2],
]);

const cineGrandsFilms = build('cine-grands-films', [
  ['Qui a réalisé « Titanic » (1997) ?', 'James Cameron', 'Steven Spielberg', 'Ridley Scott', 'Robert Zemeckis', 1],
  ['Quel festival de cinéma remet la Palme d\'or ?', 'Cannes', 'Venise', 'Berlin', 'Deauville', 1],
  ['En quelle année est sorti le premier « Jurassic Park » ?', '1993', '1990', '1996', '1999', 2],
  ['Qui a réalisé « Pulp Fiction » ?', 'Quentin Tarantino', 'Martin Scorsese', 'David Fincher', 'Guy Ritchie', 1],
  ['Quel acteur incarne Jack Sparrow dans « Pirates des Caraïbes » ?', 'Johnny Depp', 'Orlando Bloom', 'Brad Pitt', 'Keanu Reeves', 1],
  ['Qui a réalisé « Le Parrain » (1972) ?', 'Francis Ford Coppola', 'Martin Scorsese', 'Sergio Leone', 'Brian De Palma', 2],
  ['Quel film Pixar raconte l\'histoire d\'un rat qui rêve de devenir chef cuisinier ?', 'Ratatouille', 'Les Indestructibles', 'Là-haut', 'Coco', 1],
  ['Qui joue le rôle principal de « Forrest Gump » ?', 'Tom Hanks', 'Tom Cruise', 'Kevin Costner', 'Robin Williams', 1],
  ['Quel réalisateur français a tourné « Le Grand Bleu » et « Léon » ?', 'Luc Besson', 'Jean-Pierre Jeunet', 'Jacques Audiard', 'Mathieu Kassovitz', 2],
  ['Dans quelle ville se déroule « Le Fabuleux Destin d\'Amélie Poulain » ?', 'Paris', 'Lyon', 'Marseille', 'Bruxelles', 1],
  ['Qui a réalisé « Inception » (2010) ?', 'Christopher Nolan', 'Denis Villeneuve', 'Ridley Scott', 'James Cameron', 2],
  ['Quel acteur a reçu l\'Oscar du meilleur acteur pour « The Revenant » ?', 'Leonardo DiCaprio', 'Tom Hardy', 'Matt Damon', 'Brad Pitt', 2],
]);

const sportsJo = build('sports-jo', [
  ["Tous les combien d'années ont lieu les Jeux olympiques d'été ?", '4 ans', '2 ans', '3 ans', '5 ans', 1],
  ['Combien d\'anneaux figurent sur le drapeau olympique ?', '5', '4', '6', '7', 1],
  ["Quelle ville a accueilli les Jeux olympiques d'été de 2024 ?", 'Paris', 'Los Angeles', 'Tokyo', 'Londres', 1],
  ['Dans quel pays sont nés les Jeux olympiques antiques ?', 'La Grèce', "L'Italie", "L'Égypte", 'La Turquie', 1],
  ["Quelle ville a accueilli les Jeux olympiques d'été de 2012 ?", 'Londres', 'Pékin', 'Rio de Janeiro', 'Athènes', 2],
  ['Quelle est la distance officielle d\'un marathon ?', '42,195 km', '40 km', '45 km', '50 km', 2],
  ['Quel sprinteur détient le record du monde du 100 m ?', 'Usain Bolt', 'Carl Lewis', 'Asafa Powell', 'Yohan Blake', 1],
  ["Quelle ville accueillera les Jeux olympiques d'été de 2028 ?", 'Los Angeles', 'Brisbane', 'Madrid', 'Paris', 2],
  ['Quel sport se pratique au fleuret, à l\'épée ou au sabre ?', "L'escrime", 'Le kendo', 'Le judo', 'Le pentathlon', 1],
  ['En quelle année ont eu lieu les premiers Jeux olympiques modernes ?', '1896', '1886', '1900', '1912', 3],
  ['Qui a relancé les Jeux olympiques à l\'époque moderne ?', 'Pierre de Coubertin', 'Jules Rimet', 'Henri Desgrange', 'Avery Brundage', 2],
  ['Quel nageur détient le record du nombre de médailles d\'or olympiques ?', 'Michael Phelps', 'Mark Spitz', 'Ian Thorpe', 'Léon Marchand', 2],
]);

/** Questions illustrées : [clé d'image, bonne réponse, leurre, leurre, leurre, difficulté]. */
type ImageRow = [string, string, string, string, string, Difficulty];

function buildIllustrated(themeId: string, text: string, rows: ImageRow[]): Question[] {
  return rows.map(([image, a, b, c, d, difficulty], i) => ({
    id: `${themeId}-${String(i + 1).padStart(3, '0')}`,
    themeId,
    text,
    choices: [a, b, c, d],
    difficulty,
    image,
  }));
}

const geoDrapeaux = buildIllustrated('geo-drapeaux', 'À quel pays appartient ce drapeau ?', [
  ['flags/japon', 'Japon', 'Bangladesh', 'Corée du Sud', 'Chine', 1],
  ['flags/bangladesh', 'Bangladesh', 'Japon', 'Laos', 'Palaos', 3],
  ['flags/suede', 'Suède', 'Finlande', 'Norvège', 'Danemark', 2],
  ['flags/finlande', 'Finlande', 'Suède', 'Islande', 'Grèce', 2],
  ['flags/danemark', 'Danemark', 'Suisse', 'Norvège', 'Islande', 2],
  ['flags/suisse', 'Suisse', 'Danemark', 'Autriche', 'Turquie', 1],
  ['flags/ukraine', 'Ukraine', 'Suède', 'Roumanie', 'Kazakhstan', 1],
  ['flags/pologne', 'Pologne', 'Indonésie', 'Monaco', 'Autriche', 3],
  ['flags/allemagne', 'Allemagne', 'Belgique', 'Espagne', 'Autriche', 1],
  ['flags/autriche', 'Autriche', 'Lettonie', 'Pologne', 'Danemark', 2],
  ['flags/belgique', 'Belgique', 'Allemagne', 'Roumanie', 'Tchad', 2],
  ['flags/irlande', 'Irlande', "Côte d'Ivoire", 'Italie', 'Inde', 3],
  ['flags/italie', 'Italie', 'Mexique', 'Irlande', 'Hongrie', 1],
  ['flags/grece', 'Grèce', 'Israël', 'Uruguay', 'Finlande', 2],
]);

export const QUESTIONS: Question[] = [
  ...cgMelange,
  ...geoCapitales,
  ...geoDrapeaux,
  ...sciEssentiels,
  ...cineGrandsFilms,
  ...sportsJo,
];

export function questionsOf(themeId: string): Question[] {
  return QUESTIONS.filter((q) => q.themeId === themeId);
}
