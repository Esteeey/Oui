# Qu1z — Dossier de conception

> Plateforme sociale et compétitive de culture générale, centrée sur le duel 1 contre 1.
> **Qu1z** est un nom de travail. Le nom final sera choisi plus tard (vérifier la disponibilité de la marque).
> Identité, code, questions et ressources : 100 % originaux.

---

## 1. Vision

Le cœur du produit, c'est **le duel** : deux joueurs, un thème, sept questions identiques, une réponse chronométrée, un vainqueur.
Tout le reste (thèmes, progression, classements, social, compétitions) existe pour donner envie de lancer le duel suivant, et de le lancer **contre quelqu'un**.

Trois piliers :

1. **Le frisson du face-à-face** : on voit l'adversaire répondre en direct, chaque seconde compte.
2. **L'expertise visible** : on devient « quelqu'un » dans ses thèmes (niveau, rang, titre, classement).
3. **La relation entre joueurs** : amis, rivaux, revanches, clubs, défis.

Ce qu'on modernise : un design plus vivant, des parties qui ne plantent pas (serveur faisant autorité, reconnexion, duels différés), une progression plus lisible (rang compétitif séparé de l'expérience), des compétitions régulières (saisons, tournois, défi du jour) et un social plus riche (clubs, rivalités, fil d'activité).

---

## 2. Concepts clés

| Concept | Définition |
|---|---|
| **Thème** | Un sujet de quiz (« Cinéma des années 90 », « Capitales d'Europe »…). Rangé dans une **catégorie** (Cinéma, Sport, Sciences…). Objectif : des centaines de thèmes. |
| **Duel** | Partie 1 contre 1 de 7 questions sur un thème. Les deux joueurs reçoivent exactement les mêmes questions, dans le même ordre. |
| **XP de thème** | Expérience gagnée dans un thème. Fait monter le **niveau de thème** (1 → 100). Ne baisse jamais. |
| **Niveau global** | Calculé à partir de l'XP totale. Débloque des fonctionnalités et des cosmétiques. |
| **Cote** | Note de compétition par thème (système Glicko-2). Monte quand on gagne, baisse quand on perd. Sert au matchmaking et aux classements. |
| **Division** | Traduction lisible de la cote : Bronze, Argent, Or, Platine, Diamant, Maître, puis Légende (top 100 du thème). |
| **Saison** | Période de 6 semaines. Les classements de saison sont remis à zéro (en douceur), avec des récompenses à la fin. |

Séparer **XP** (on progresse toujours) et **cote** (on mérite sa place) est la principale modernisation de la progression : un joueur occasionnel avance quand même, un joueur compétitif a un vrai classement.

---

## 3. Modes de jeu

### 3.1 Règles communes à tous les duels

**Déroulé d'une question**

1. **Lecture** : la question s'affiche seule pendant 1 à 3 s, selon sa longueur. Les deux joueurs ont le même temps de lecture.
2. **Réponse** : les 4 propositions apparaissent et un chrono de **10 s** démarre.
3. **Révélation** : dès que les deux joueurs ont répondu (ou à la fin du chrono), la bonne réponse et le choix de l'adversaire s'affichent pendant 2 s.

**Barème Qu1z** (propre au jeu)

| Élément | Points |
|---|---|
| Bonne réponse | 60 points de base |
| Bonus de rapidité | jusqu'à 40 points, proportionnels au temps restant (arrondi au point) |
| Mauvaise réponse ou temps écoulé | 0 |
| **Série** : à partir de la 3ᵉ bonne réponse consécutive | +10 par question |

Score maximal théorique : 7 × 100 + 5 × 10 (série) = **750 points**.

> 📌 **À ajouter plus tard : la Mise.** Idée validée, prévue en phase 2 (voir 8 et 9). Détail en annexe A.

**Départage en cas d'égalité** : le plus grand nombre de bonnes réponses, puis le temps de réponse total le plus court. Si tout est égal, c'est un match nul.

**Récompenses en fin de duel**

- XP : 10 par bonne réponse, +40 pour une victoire, +15 pour un nul, +30 pour un sans-faute (7/7). Bonus de « premier duel du jour » ×2.
- Cote : mise à jour Glicko-2 (uniquement en mode classé).
- Statistiques du thème mises à jour.

**Écran de résultats comparatif**

- Scores animés côte à côte, avec le vainqueur mis en avant.
- Grille question par question : réponse de chacun, juste ou fausse, temps de réponse, points.
- Ce qu'on gagne : XP (barre animée), variation de cote, progression de division, badges débloqués.
- Actions : **Revanche**, **Nouveau duel**, **Ajouter en ami**, **Partager**, **Signaler une question**.

### 3.2 Duel classé (en direct)

Le mode principal.

1. Le joueur choisit un thème, puis « Jouer ».
2. **Matchmaking** : recherche d'un adversaire sur le même thème, à cote proche et dans la même région (latence).
   - 0 à 5 s : écart de cote étroit.
   - 5 à 12 s : l'écart s'élargit progressivement.
   - Au-delà de 15 s : on propose de jouer contre un **Fantôme** (voir 3.4) ou de lancer un **Duel différé** (3.3).
3. Écran de présentation : les deux profils face à face (avatar, niveau dans le thème, division, drapeau), 3 s.
4. 7 questions synchronisées par le serveur.
5. Résultats, puis revanche possible si les deux joueurs l'acceptent dans les 10 s.

Pendant le duel : jauges de score en direct, et indicateur « l'adversaire a répondu » (sans révéler sa réponse avant la révélation). Réactions rapides prédéfinies (emotes), désactivables.

### 3.3 Duel différé (asynchrone)

Pour jouer quand l'adversaire n'est pas connecté, et pour les thèmes de niche.

1. Le joueur A joue ses 7 questions immédiatement. Ses réponses et ses temps sont enregistrés.
2. Le joueur B est notifié et a **24 h** pour jouer **les mêmes questions**. Il voit en direct la progression enregistrée de A, comme dans un duel en direct.
3. Résultats envoyés aux deux joueurs.
4. Sans réponse dans les 24 h : victoire de A par forfait (XP réduite, pas de gain de cote).

C'est le mode utilisé pour les défis entre amis quand l'ami n'est pas en ligne.

### 3.4 Duel contre un Fantôme

Quand aucun adversaire n'est disponible, plutôt qu'un robot inventé, on rejoue **la partie enregistrée d'un vrai joueur** de cote proche sur ce thème (mêmes questions, mêmes réponses, mêmes temps).

- Toujours **affiché clairement** comme « Fantôme de @pseudo » : pas de faux joueur.
- Compte pour l'XP. Gain de cote réduit (×0,5).
- Le joueur d'origine est notifié (« Ton fantôme a battu 12 joueurs aujourd'hui »), ce qui crée de l'engagement.

### 3.5 Défi entre amis

- Depuis un profil, un ami ou l'écran de résultats : « Défier », puis choix du thème (ou « surprise »).
- Si l'ami est en ligne : invitation en direct (30 s pour accepter) puis duel en direct.
- Sinon : duel différé automatique.
- **Défi personnalisé** : choix du thème, partie amicale (sans cote) ou comptant pour l'historique de la rivalité.
- **Lien de défi** partageable (messagerie, réseaux) : un nouveau joueur qui l'ouvre joue directement le duel après une inscription rapide.

### 3.6 Défi du jour (nouveauté)

- Chaque jour, **les mêmes 7 questions pour tout le monde**, sur un thème mis en avant.
- Une seule tentative. Classement mondial du jour, par pays et entre amis.
- Série de jours consécutifs (avec un « gel » gratuit par semaine pour ne pas perdre sa série).

### 3.7 Tournois (nouveauté)

- **Tournoi de thème hebdomadaire** : pendant 48 h, chaque duel classé du thème rapporte des points de tournoi. Top 1 %, 10 % et 25 % récompensés (titres, cadres de profil).
- **Tournoi à élimination** (phase 2) : tableau de 16 ou 32 joueurs, un duel différé par tour avec 12 h par tour. Peut être créé par un club ou entre amis.

### 3.8 Entraînement

- 7 questions seul, sans adversaire ni cote, avec XP réduite.
- Pour découvrir un thème avant de s'y engager en classé.

### 3.9 Duel de clubs 2 contre 2 (phase 3)

- Deux équipes de deux, mêmes 7 questions, le score d'équipe est la somme des scores.
- Alimente le classement des clubs.

---

## 4. Fonctionnalités

### 4.1 Thèmes et contenu

- **Catalogue** : catégories, recherche, filtres (populaires, nouveaux, tendance, mes favoris), et « thèmes proches » sur chaque page de thème.
- **Page de thème** : niveau du joueur, division, statistiques, top 10, amis qui y jouent, bouton Jouer, bouton Favori.
- **Catégories retenues** (16) :
  1. Culture générale
  2. Cinéma
  3. Séries TV
  4. Jeux vidéo
  5. Sports
  6. Musique
  7. Histoire
  8. Géographie
  9. Sciences
  10. Automobile
  11. Gastronomie
  12. Animaux et nature
  13. Technologie et informatique
  14. Mode et luxe
  15. Littérature et bandes dessinées
  16. Culture pop (Marvel, DC, Disney, mangas…)
- **Thèmes** : chaque catégorie contient plusieurs thèmes plus précis. Par exemple, Sports : Football, Tennis, Formule 1, JO ; Cinéma : Films des années 90, Réalisateurs, Répliques cultes.
- **Volume** : au lancement, 2 thèmes par catégorie (32 thèmes, 300 questions minimum chacun), puis plusieurs nouveaux thèmes par semaine pour atteindre des centaines.
- **Marques et franchises** (Marvel, Disney, constructeurs, maisons de luxe…) : on peut poser des questions à leur sujet, mais **sans utiliser leurs logos, affiches ou images officielles**. Les visuels des thèmes sont des illustrations originales.
- **Format d'une question** : énoncé, 4 propositions, bonne réponse, image facultative, difficulté, source, auteur.
- **Difficulté calibrée** : chaque question a une difficulté mesurée à partir des taux de bonnes réponses et des temps. Un duel mélange les difficultés (par exemple 2 faciles, 3 moyennes, 2 difficiles), adaptées au niveau moyen des deux joueurs.
- **Rotation** : un joueur ne revoit pas une question avant d'avoir épuisé une bonne partie du thème.
- **Signalement** : « question incorrecte » ou « ambiguë » depuis l'écran de résultats, avec une file de modération.
- **Production** : les questions sont rédigées en interne, éventuellement avec une génération assistée par IA, mais **toujours relues et vérifiées par un humain** avec une source. Les propositions des joueurs arriveront en phase 3, avec modération.

### 4.2 Profils

- Pseudo unique, avatar personnalisable (formes, couleurs et accessoires originaux), bannière, titre, pays, courte bio.
- Vitrine : 3 thèmes phares choisis par le joueur, avec niveau et division.
- Statistiques : duels joués, taux de victoire, précision, temps de réponse moyen, meilleure série, thèmes les plus joués.
- Historique des duels récents.
- Badges (succès) et titres débloqués.
- Confidentialité : profil public ou réservé aux amis, défis ouverts ou non.

### 4.3 Progression

- **XP et niveau par thème** (1 → 100), avec des paliers qui donnent des titres (« Amateur de… », « Expert en… », « Érudit de… »).
- **Niveau global**, qui débloque fonctionnalités et cosmétiques.
- **Cote et division par thème**, plus une **cote globale** calculée sur les thèmes les plus joués.
- **Saisons** de 6 semaines : la cote se rapproche de la moyenne en début de saison, des récompenses sont données à la fin selon la division atteinte.
- **Badges** : par exemple premier sans-faute, 10 victoires d'affilée, 50 thèmes essayés, revanche gagnée.
- **Objectifs quotidiens et hebdomadaires** (« Gagne 3 duels en Sciences », « Joue 2 thèmes nouveaux ») qui rapportent de l'XP.

### 4.4 Classements

- Par thème, global, par pays, entre amis, par club.
- Périodes : du jour (défi du jour), de la semaine, de la saison, de tous les temps.
- Classement des thèmes basé sur la **cote** (le mérite), et non sur l'XP (le temps passé). L'XP a son propre tableau « Les plus actifs ».

### 4.5 Social

**Publications et fils** (règle de base du réseau) :

| Fil | Qui peut publier | Qui le voit dans son accueil |
|---|---|---|
| **Mur d'un joueur** | Uniquement ce joueur | Ses abonnés (les personnes qui le suivent) |
| **Fil d'un thème** | Les joueurs abonnés au thème | Les abonnés du thème |
| **Accueil** (onglet Fil) | — | Agrège : mes publications, les murs des personnes que je suis, les fils des thèmes auxquels je suis abonné, et l'activité de jeu des personnes suivies (victoires, sans-faute, niveaux, divisions, badges) |

- On **suit** un joueur depuis son profil (« Suivre »), sans qu'il ait besoin d'accepter. L'**ami** reste une relation réciproque, utile pour les défis et le classement entre amis.
- On **s'abonne** à un thème depuis sa page. L'abonnement donne le droit de publier dans son fil.
- Publication : texte de 280 caractères maximum, « Bravo » (j'aime). À venir : commentaires, images, signalement, modération.

**Autres fonctions sociales** :

- **Amis** : demande ou acceptation, recherche par pseudo, QR code, lien d'invitation, contacts (avec accord explicite).
- **Rivalités** : historique des face-à-face avec chaque adversaire (« 12 – 9 contre @Lina »), mis en avant sur l'écran de résultats.
- **Fil d'activité** des amis : nouveaux records, montées de division, badges, défis lancés.
- **Clubs** : groupes de 50 joueurs maximum, avec un classement interne, des objectifs collectifs hebdomadaires et une messagerie de club.
- **Messagerie** : réactions rapides pendant les duels, messages entre amis après un duel. Filtrage automatique et signalement.
- **Partage** : carte de résultat en image, générée automatiquement, avec un lien de revanche.
- **Sécurité** : bloquer, signaler, mode « défis d'amis uniquement ».

### 4.6 Notifications

Défi reçu, tour à jouer en duel différé (avec rappel avant expiration), ami en ligne, Fantôme qui a gagné, fin de tournoi, série du défi du jour menacée.
Elles sont réglables par type, avec une limite quotidienne pour ne pas saturer le joueur.

### 4.7 Navigation de l'application

Cinq onglets en bas de l'écran :

| Onglet | Contenu |
|---|---|
| **Fil** | Bouton « Jouer », défis reçus, fil d'actualité (duels, sans-faute, niveaux, divisions, badges des amis et du joueur) avec « Bravo » et « Défier ». Cloche des notifications en haut. |
| **Explorer** | Recherche de thèmes, « Tes thèmes », catalogue des 16 catégories. |
| **Classement** | Monde ou Amis, général ou par thème, par cote avec divisions. |
| **Social** | Inviter un ami, défis reçus, demandes d'amis, liste d'amis (en ligne ou non), suggestions. |
| **Profil** | Avatar, titre, niveau, statistiques, thèmes, badges, derniers duels. |

Écrans hors onglets : catégorie, thème, profil d'un autre joueur (défier, ajouter, bilan des face-à-face), duel, résultats, notifications.

### 4.8 Modèle économique (à décider)

Recommandation : **aucun avantage payant en jeu** (pas d'aide à la réponse à acheter). Revenus possibles : cosmétiques (avatars, cadres, animations de victoire), abonnement optionnel (sans publicité, statistiques avancées, thèmes en avant-première), publicité discrète en version gratuite.

---

## 5. Parcours utilisateurs

### 5.1 Premier lancement (objectif : jouer un duel en moins de 60 secondes)

1. Écran d'accueil : « Joue », sans inscription obligatoire (compte invité).
2. Choix de 3 thèmes favoris parmi une sélection.
3. **Premier duel guidé** contre un Fantôme facile, avec des bulles d'explication au premier passage (chrono, points).
4. Résultats, avec l'XP gagnée bien mise en valeur.
5. Invitation à créer un compte (Apple, Google ou e-mail) pour sauvegarder sa progression, puis choix du pseudo et de l'avatar.

### 5.2 Partie rapide (joueur habituel)

Accueil → « Rejouer » sur le dernier thème (un tap) ou choix d'un thème → matchmaking → duel → résultats → revanche ou nouveau duel.

### 5.3 Défier un ami

Profil de l'ami → Défier → thème → (ami en ligne : attente d'acceptation puis duel en direct) ou (hors ligne : je joue maintenant, il est notifié) → résultats envoyés aux deux.

### 5.4 Répondre à un défi reçu

Notification → écran du défi (thème, score de l'adversaire masqué) → Accepter → duel contre la partie enregistrée de l'ami → résultats → revanche.

### 5.5 Découvrir un thème

Catalogue → catégorie ou recherche → page du thème (top 10, amis, ma progression) → Entraînement ou Duel classé → Favori.

### 5.6 Suivre sa progression

Profil → onglet Thèmes (niveau, division et tendance par thème) → détail d'un thème (courbe de cote, précision par difficulté, historique) → Classements.

### 5.7 Défi du jour

Notification du matin → Défi du jour → 7 questions → position dans le classement mondial et entre amis → partage du résultat.

### 5.8 Clubs

Social → Clubs → rejoindre (code, invitation ou recherche) → objectifs collectifs, classement interne, messagerie.

---

## 6. Architecture technique

### 6.1 Vue d'ensemble

```
┌──────────────────────────────┐        ┌────────────────────────┐
│ Appli Expo (iOS / Android /  │        │ Back-office (Next.js)  │
│ Web) — React Native          │        │ contenu, modération,   │
└───────┬───────────────┬──────┘        │ saisons, statistiques  │
        │ HTTPS (REST)  │ WebSocket     └───────────┬────────────┘
        ▼               ▼                           │
┌───────────────┐ ┌──────────────────────┐          │
│ API           │ │ Serveur de jeu       │          │
│ (Fastify)     │ │ salles de duel,      │          │
│ comptes,      │ │ matchmaking,         │          │
│ thèmes,       │ │ présence, invitations│          │
│ profils,      │ │ en direct            │          │
│ social,       │ └─────────┬────────────┘          │
│ classements   │           │                       │
└───────┬───────┘           │                       │
        ├───────────────────┼───────────────────────┘
        ▼                   ▼
┌──────────────┐   ┌──────────────────┐   ┌─────────────────────┐
│ PostgreSQL   │   │ Redis            │   │ Tâches (BullMQ)     │
│ données      │   │ files d'attente, │   │ fin de duel différé,│
│ durables     │   │ présence, salles,│   │ saisons, tournois,  │
└──────────────┘   │ classements      │   │ notifications,      │
                   └──────────────────┘   │ calibrage questions │
┌──────────────┐                          └─────────────────────┘
│ Stockage S3  │  images des questions, avatars, cartes de partage
└──────────────┘
```

### 6.2 Choix technologiques

| Couche | Choix | Pourquoi |
|---|---|---|
| Langage | TypeScript partout | Types partagés entre client et serveur (messages du duel, modèles) |
| Organisation | Monorepo pnpm + Turborepo | Un seul dépôt : appli, serveurs, back-office, paquets partagés |
| Appli | Expo (React Native) + Expo Router | Une seule base de code pour iOS, Android et Web |
| Animations | Reanimated + Skia | Animations fluides à 60 images/s (chrono, scores, transitions) |
| État client | Zustand + TanStack Query | Simple, cache des données serveur |
| API | Fastify + Zod (REST, documentation OpenAPI) | Rapide, validation stricte des entrées |
| Temps réel | Serveur WebSocket Node.js dédié (uWebSockets.js) | Faible latence, contrôle total de la logique de duel |
| Base de données | PostgreSQL + Drizzle ORM | Relations (amis, duels), fiabilité |
| Cache et temps réel | Redis | Files de matchmaking, présence, classements (sorted sets), état des salles |
| Tâches planifiées | BullMQ (sur Redis) | Expirations, fins de saison, notifications |
| Authentification | Apple, Google, e-mail (lien magique), compte invité | Inscription sans friction |
| Notifications | Expo Notifications (APNs / FCM) | Multi-plateforme |
| Observabilité | Sentry + OpenTelemetry + Grafana | Suivre la stabilité des parties |
| Hébergement | Conteneurs (Fly.io ou AWS) dans plusieurs régions | Latence faible en Europe d'abord |

Option plus rapide pour un prototype : Supabase (PostgreSQL, authentification, temps réel). En revanche, le serveur de jeu qui fait autorité reste un service dédié, car l'équité du chrono en dépend.

### 6.3 Structure du dépôt

```
apps/
  mobile/        appli Expo (iOS, Android, Web)
  admin/         back-office Next.js
services/
  api/           API REST
  game/          serveur de jeu temps réel + matchmaking
  worker/        tâches planifiées
packages/
  shared/        types, schémas Zod, barème, règles du duel
  ui/            composants et thème graphique
  db/            schéma de base de données, migrations
content/         outils d'import et de validation des questions
docs/            ce dossier de conception
```

Le **barème et les règles** sont dans `packages/shared` : le serveur les applique, le client s'en sert seulement pour l'affichage.

### 6.4 Fonctionnement d'un duel en direct (serveur faisant autorité)

```
Client A        Serveur de jeu                    Client B
   │  file d'attente   │                              │
   ├──────────────────►│◄─────────────────────────────┤
   │                   │ appariement → salle créée    │
   │◄── match_found ───┤─── match_found ─────────────►│
   │                   │ tire 7 questions             │
   │◄─ question(1) ────┤─── question(1) ─────────────►│  énoncé seul
   │◄─ choices(1, t0) ─┤─── choices(1, t0) ──────────►│  après la lecture
   ├── answer(1, i) ──►│◄── answer(1, j) ─────────────┤
   │                   │ temps mesuré PAR LE SERVEUR  │
   │◄─ reveal(1) ──────┤─── reveal(1) ───────────────►│  bonne réponse + points
   │        … questions 2 à 7 …                       │
   │◄─ result ─────────┤─── result ──────────────────►│
   │                   │ enregistrement PostgreSQL,   │
   │                   │ XP, cote, classements        │
```

Principes de **stabilité et d'équité** :

- **Le serveur décide de tout** : choix des questions, chrono, validation des réponses, calcul des points. Le client n'est qu'un affichage.
- **La bonne réponse n'est jamais envoyée avant la révélation**, ce qui rend la triche par inspection du réseau inutile.
- **Synchronisation d'horloge** à la connexion (mesure aller-retour). Le chrono affiché est calé sur l'horloge du serveur, et une tolérance de latence est appliquée de façon identique aux deux joueurs.
- **Reconnexion** : en cas de coupure, la salle est conservée 20 s et le joueur reprend à la question en cours. Les questions manquées valent 0, mais la partie va jusqu'au bout pour l'adversaire.
- **Abandon** : victoire pour l'adversaire, aucune perte d'XP pour lui, et pénalité de cote pour celui qui abandonne de façon répétée.
- **Salles en mémoire et sauvegardées dans Redis** à chaque question : si une instance du serveur tombe, une autre reprend la salle.
- **Détection de triche** : temps de réponse humainement impossibles et précision anormale par rapport à la difficulté, avec une file de vérification.

### 6.5 Matchmaking

- Une file Redis par **thème × région**, triée par cote.
- Toutes les secondes, un appariement cherche la meilleure paire, avec un écart de cote autorisé qui grandit avec le temps d'attente.
- On évite de rematcher le même adversaire deux fois de suite (sauf revanche).
- Pour les thèmes peu joués : appariement élargi aux régions voisines, puis proposition de Fantôme ou de duel différé.

### 6.6 Modèle de données (principales tables)

| Table | Contenu |
|---|---|
| `users` | compte, méthode de connexion, pays, langue, dates |
| `profiles` | pseudo, avatar, bannière, titre, bio, confidentialité |
| `categories`, `themes` | catalogue, description, visuel, statut (brouillon / publié) |
| `questions` | thème, énoncé, 4 propositions, bonne réponse, image, difficulté calibrée, source, statut |
| `question_stats` | nombre de réponses, taux de réussite, temps moyen |
| `matches` | mode, thème, joueurs, statut, dates, vainqueur, seed |
| `match_questions` | les 7 questions d'un duel, dans l'ordre |
| `match_answers` | joueur, question, choix, temps de réponse (mesuré par le serveur), points (+ mise en phase 2) |
| `ghost_runs` | parties enregistrées réutilisables comme Fantômes |
| `theme_progress` | joueur × thème : XP, niveau, cote, déviation, division, statistiques |
| `friendships`, `blocks` | relations entre joueurs |
| `rivalries` | bilan des face-à-face entre deux joueurs |
| `challenges` | défis envoyés, thème, options, expiration, statut |
| `clubs`, `club_members` | clubs et rôles |
| `seasons`, `season_results` | saisons et récompenses |
| `tournaments`, `tournament_entries` | tournois et scores |
| `daily_challenges`, `daily_results` | défi du jour |
| `achievements`, `user_achievements` | badges |
| `notifications`, `reports` | notifications, signalements |

Les **classements** sont calculés en direct dans Redis (sorted sets), et des instantanés sont enregistrés dans PostgreSQL en fin de période.

### 6.7 Back-office

- Gestion des thèmes et des questions : création, import CSV ou JSON, relecture à deux niveaux, aperçu sur mobile.
- Vérifications automatiques : doublons, propositions identiques, longueur, orthographe, source manquante.
- File des signalements de questions et de joueurs.
- Tableau de bord : questions trop faciles ou trop difficiles, thèmes populaires, temps d'attente du matchmaking, taux d'abandon.
- Création des défis du jour, des tournois et des saisons.

---

## 7. Identité visuelle (proposition)

- **Ton** : énergique, chaleureux, compétitif sans être agressif.
- **Couleurs** : un fond sombre profond par défaut (avec un mode clair), une couleur d'accent par catégorie et un code couleur fort pour le duel : le joueur en **corail**, l'adversaire en **turquoise**.
- **Typographie** : une police arrondie et épaisse pour les chiffres et les titres (scores, chrono), une police sobre pour les questions (lisibilité avant tout).
- **Formes** : cartes aux coins très arrondis, pastilles et icônes pleines, illustrations géométriques originales pour chaque catégorie.
- **Animations** : chrono circulaire qui se vide et change de couleur, réponses qui « claquent » au toucher (avec vibration), points qui s'envolent vers le compteur, grande animation de victoire ou de défaite, transitions de partage d'élément entre écrans.
- **Accessibilité** : contrastes conformes WCAG AA, tailles de police réglables, option « animations réduites », couleurs doublées par des icônes (juste / faux).

---

## 8. Feuille de route

### Phase 1 — Prototype jouable (MVP)

- Compte invité et connexion, profil simple.
- 30 thèmes dans 6 catégories, 300 questions minimum par thème.
- Duel classé en direct, matchmaking, Fantômes, écran de résultats complet, revanche.
- XP et niveau par thème, cote et divisions, statistiques de base.
- Classements par thème et global.
- Amis et défis (en direct et différés), notifications.
- Back-office de contenu.

### Phase 2 — Compétition et engagement

- Défi du jour, saisons, tournois hebdomadaires.
- **La Mise** (voir annexe A).
- Badges, objectifs quotidiens et hebdomadaires, titres.
- Rivalités, fil d'activité, cartes de partage, liens de défi.
- Plus de 100 thèmes.

### Phase 3 — Communauté

- Clubs, duels 2 contre 2, tournois à élimination.
- Propositions de questions par les joueurs, avec modération.
- Cosmétiques et modèle économique.
- Autres langues.

---

## 9. Décisions à valider

1. **Nom** du jeu (« Qu1z » est provisoire, nom final à choisir plus tard).
2. ~~Plateformes~~ : **décidé** — une seule base de code Expo. D'abord testée sur le Web et sur téléphone (sans passer par les stores), puis publiée sur l'App Store et Google Play une fois le duel au point.
3. **Langue** : français uniquement au lancement ?
4. ~~Barème~~ : **décidé** — la Mise est validée mais ajoutée plus tard (phase 2, annexe A).
5. **Hébergement** et budget (serveurs, base de données).
6. **Modèle économique**.
7. **Contenu** : qui rédige et relit les questions ? (catégories : **décidé**, voir 4.1)

---

## Annexe A — La Mise (à ajouter en phase 2)

Idée validée, mise de côté pour ne pas alourdir la première version.

- **Quand** : une fois par duel, sur les questions 2 à 7.
- **Comment** : pendant la lecture de la question, **avant de voir les 4 propositions**, le joueur appuie sur « Miser ». C'est un pari : « ce sujet, je le connais ».
- **Bonne réponse** : les points de la question (base + rapidité) sont doublés, jusqu'à 200 au lieu de 100.
- **Mauvaise réponse ou temps écoulé** : −50 points.
- **Visibilité** : l'adversaire voit qu'une mise a été posée (pas sur quelle réponse).
- **Intérêt** : permet de remonter au score et rend les fins de duel plus tendues.
- **Score maximal** avec la Mise : 850 points au lieu de 750.
- **À prévoir** : un badge « Mise gagnante sur la dernière question », une option « avec ou sans Mise » dans les défis entre amis, et une colonne `wager` dans `match_answers`.
