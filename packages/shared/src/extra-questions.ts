import type { Difficulty, Question } from './types';

type Row = [string, string, string, string, string, Difficulty];

function build(themeId: string, rows: Row[]): Question[] {
  return rows.map(([text, answer, wrong1, wrong2, wrong3, difficulty], index) => ({
    id: themeId + '-' + String(index + 1).padStart(3, '0'),
    themeId,
    text,
    choices: [answer, wrong1, wrong2, wrong3],
    difficulty,
  }));
}

export const EXTRA_QUESTIONS: Question[] = [
  ...build('music-hits', [
    ['Combien de touches compte un piano standard ?', '88', '76', '92', '64', 1],
    ['Quel chanteur était le leader du groupe Queen ?', 'Freddie Mercury', 'David Bowie', 'Mick Jagger', 'Elton John', 1],
    ['Quel album de Michael Jackson est sorti en 1982 ?', 'Thriller', 'Bad', 'Off the Wall', 'Dangerous', 2],
    ['Quel compositeur a écrit la Neuvième Symphonie ?', 'Ludwig van Beethoven', 'Wolfgang Amadeus Mozart', 'Frédéric Chopin', 'Johann Sebastian Bach', 2],
    ['Le saxophone appartient à quelle famille ?', 'Les bois', 'Les cordes', 'Les percussions', 'Les claviers', 2],
    ['Combien de cordes possède un violon classique ?', '4', '5', '6', '3', 1],
    ['Quel groupe a enregistré Hey Jude ?', 'The Beatles', 'The Rolling Stones', 'The Kinks', 'The Who', 1],
    ['Quel artiste est surnommé le roi du reggae ?', 'Bob Marley', 'Jimmy Cliff', 'Peter Tosh', 'Burning Spear', 1],
    ['Quel compositeur a écrit Les Quatre Saisons ?', 'Antonio Vivaldi', 'Georg Friedrich Haendel', 'Claudio Monteverdi', 'Gioachino Rossini', 2],
    ['Dans quelle ville se déroule le célèbre festival de jazz de Montreux ?', 'Montreux', 'Genève', 'Lausanne', 'Berne', 2],
    ['Quel groupe a chanté « Bohemian Rhapsody » ?', 'Queen', 'L’orgue de barbarie', 'L’accordéon', 'Le clavecin', 1],
    ['Quel pays a remporté le premier Concours Eurovision de la chanson en 1956 ?', 'La Suisse', 'La France', 'Les Pays-Bas', 'L’Italie', 3],
  ]),
  ...build('gaming-cult', [
    ['Quelle entreprise a créé Mario ?', 'Nintendo', 'Sega', 'Capcom', 'Atari', 1],
    ['Quel studio a créé Minecraft ?', 'Mojang', 'Valve', 'Rare', 'id Software', 1],
    ['Qui a conçu le jeu Tetris ?', 'Alexeï Pajitnov', 'Shigeru Miyamoto', 'Hideo Kojima', 'Sid Meier', 2],
    ['Quelle entreprise édite les consoles PlayStation ?', 'Sony', 'Nintendo', 'Microsoft', 'Sega', 1],
    ['Quel personnage bleu est la mascotte de Sega ?', 'Sonic', 'Tails', 'Kirby', 'Crash', 1],
    ['Dans Pac-Man, que le joueur doit-il ramasser dans le labyrinthe ?', 'Des pac-gommes', 'Des anneaux', 'Des pièces rouges', 'Des étoiles', 1],
    ['Quel studio développe la plupart des jeux principaux Pokémon ?', 'Game Freak', 'Mojang', 'Naughty Dog', 'Rare', 2],
    ['Quelle console Nintendo est sortie en 2006 avec des manettes à détection de mouvement ?', 'Wii', 'GameCube', 'Nintendo 64', 'Wii U', 2],
    ['Dans les jeux, que signifie souvent « 1UP » ?', 'Une vie supplémentaire', 'Un niveau terminé', 'Un bonus de vitesse', 'Une partie sauvegardée', 1],
    ['Quel jeu de course met en scène Mario et ses amis ?', 'Mario Kart', 'F-Zero', 'Diddy Kong Racing', 'Sonic Riders', 1],
    ['Quelle entreprise a créé la série The Legend of Zelda ?', 'Nintendo', 'Square Enix', 'Konami', 'Bandai Namco', 2],
    ['Quel est le nom de la console portable hybride de Nintendo sortie en 2017 ?', 'Nintendo Switch', 'Nintendo DS', 'Game Boy Advance', 'Wii U', 1],
  ]),
  ...build('food-world', [
    ['Dans quel pays la paella est-elle née ?', 'Espagne', 'Italie', 'Grèce', 'Portugal', 1],
    ['Quel ingrédient donne sa couleur verte au pesto traditionnel ?', 'Le basilic', 'La menthe', 'Le persil', 'La roquette', 1],
    ['De quel pays le miso est-il une spécialité ?', 'Japon', 'Thaïlande', 'Inde', 'Vietnam', 1],
    ['Quel ingrédient est à la base du houmous ?', 'Le pois chiche', 'La lentille', 'Le haricot rouge', 'Le pois cassé', 1],
    ['Quelle céréale est traditionnellement utilisée pour le risotto ?', 'Le riz', 'Le blé', 'L’orge', 'Le maïs', 1],
    ['La bouillabaisse est une spécialité de quelle ville française ?', 'Marseille', 'Bordeaux', 'Lille', 'Strasbourg', 2],
    ['Quel fromage italien est traditionnellement utilisé dans une salade caprese ?', 'La mozzarella', 'Le pecorino', 'Le gorgonzola', 'Le taleggio', 1],
    ['Quel fruit donne son nom au sirop d’érable ?', 'L’érable', 'Le bouleau', 'Le noyer', 'Le chêne', 1],
    ['Quel est l’ingrédient principal du guacamole ?', 'L’avocat', 'Le concombre', 'La courgette', 'Le petit pois', 1],
    ['Le couscous est traditionnellement associé à quelle région ?', 'Le Maghreb', 'La Scandinavie', 'Les Caraïbes', 'L’Asie centrale', 2],
    ['Dans quel pays le tiramisu a-t-il été créé ?', 'Italie', 'France', 'Autriche', 'Belgique', 2],
    ['Quelle épice donne généralement sa couleur jaune au curry ?', 'Le curcuma', 'La cannelle', 'Le clou de girofle', 'La vanille', 1],
  ]),
  ...build('tech-inventions', [
    ['Que signifie le sigle CPU en informatique ?', 'Unité centrale de traitement', 'Carte mémoire universelle', 'Centre de programmation utilisateur', 'Unité de contrôle portable', 1],
    ['À quoi sert principalement la mémoire vive, ou RAM ?', 'À conserver temporairement les données utilisées', 'À afficher les images', 'À alimenter la batterie', 'À connecter un écran', 1],
    ['Qui a inventé le premier prototype de souris informatique ?', 'Douglas Engelbart', 'Tim Berners-Lee', 'Alan Turing', 'Grace Hopper', 2],
    ['Quel système a été créé par Linus Torvalds ?', 'Linux', 'Android', 'Windows', 'macOS', 2],
    ['Quel organisme a conçu le code QR à l’origine ?', 'Denso Wave', 'Nokia', 'IBM', 'Philips', 3],
    ['Que représente une URL ?', 'L’adresse d’une ressource sur le Web', 'Un type de batterie', 'Un langage de programmation', 'Un format vidéo', 1],
    ['Quelle technologie permet les paiements sans contact à courte distance ?', 'NFC', 'GPS', 'HDMI', 'Bluetooth LE uniquement', 2],
    ['Quel duo est associé au premier vol motorisé contrôlé en 1903 ?', 'Les frères Wright', 'Les frères Lumière', 'Les frères Montgolfier', 'Les frères Breguet', 2],
    ['À quoi sert le DNS sur Internet ?', 'À associer un nom de domaine à une adresse réseau', 'À compresser les images', 'À protéger un écran', 'À mesurer le débit Wi-Fi', 2],
    ['En quelle année le premier iPhone a-t-il été commercialisé ?', '2007', '2004', '2010', '2012', 2],
    ['Quel langage de programmation a été conçu par James Gosling ?', 'Java', 'Python', 'Ruby', 'Swift', 3],
    ['À quoi sert principalement un câble USB ?', 'À transférer des données et souvent alimenter un appareil', 'À recevoir les chaînes satellite', 'À remplacer un processeur', 'À amplifier le son d’un haut-parleur', 1],
  ]),
];