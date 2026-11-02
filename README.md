# Qu1z

Plateforme sociale et compétitive de culture générale, centrée sur le duel 1 contre 1.
*Qu1z est un nom provisoire.*

Dossier de conception : [`docs/CONCEPTION.md`](docs/CONCEPTION.md)

## Structure

```
apps/mobile/       application Expo (iOS, Android, Web)
services/game/     serveur de jeu temps réel (WebSocket) : duels, chrono, XP, reconnexion
packages/shared/   règles du duel, barème, cote, progression, catalogue, questions
content/           outils de contenu (génération des drapeaux)
docs/              conception
```

## État actuel (prototype)

- **5 onglets** : Fil d'actualité, Explorer, Classement, Social, Profil, plus les notifications.
- **Fil d'accueil** : publications des personnes suivies et des thèmes auxquels on est abonné, activité de jeu, défis reçus, « Bravo ». Bouton « Quoi de neuf ? » pour publier.
- **Murs et fils de thème** : chaque joueur a son mur (lui seul y publie) ; chaque thème a son fil, où publient ses abonnés.
- **Social** : amis, demandes d'amis (accepter / refuser), défis reçus, invitation par partage.
- **Profil** : niveau, titre, statistiques, thèmes avec division, 8 badges, derniers duels. Profils des autres joueurs avec bilan des face-à-face.
- **Classement** : Monde ou Amis, général ou par thème, par cote (Elo pour le prototype) et divisions.
- **Duel** complet de 7 questions (10 s par question), résultats comparatifs, XP, cote, revanche.
- 6 thèmes jouables, dont **Drapeaux du monde** en questions illustrées (14 drapeaux dessinés pour Qu1z).
- Commentaires sous les publications, nombre d'abonnés par thème.

Serveur de jeu :

- Le serveur fait autorité : questions, chrono, réponses, scores, résultat et **XP** (le client n'envoie que ses choix).
- Duel classé entre deux joueurs réels (matchmaking par thème, bot au bout de 10 s), ou duel contre le bot.
- Une déconnexion ne met jamais le duel en pause ; à la reconnexion (ou réouverture de l'app), le joueur retrouve son duel ou ses résultats.
- Récompenses : bonus fin +20 (présent à la fin), bonus victoire +40, bonus boost (10 XP par bonne réponse, +30 si sans-faute) ; abandon = 0 XP ; versement unique par duel.
- Page Résultats : couverture du thème, bandeau VICTOIRE / PERDU, joueurs (soi toujours à gauche), tableau des bonus, barre de niveau, Rejouer, Chat, Partager.

Limites du prototype :

- Les autres joueurs, le fil, les amis et les notifications sont des **données de démonstration**, signalées dans l'application. En duel, les réponses de l'adversaire sont simulées.
- Comptes invités (jeton gardé sur l'appareil) ; pas encore de connexion Apple / Google ni de photo de profil.
- Fil, amis et publications restent des données de démonstration locales.

## Lancer le projet

Prérequis : Node.js 22 et pnpm.

```bash
pnpm install
```

Le serveur de jeu (port 8787) doit tourner pour jouer. En local, il utilise un PostgreSQL embarqué (dossier `services/game/data/pg`) ; en production, il se connecte à PostgreSQL via la variable `DATABASE_URL`.

```bash
pnpm server
```

Sur un téléphone, l'application doit connaître l'adresse de l'ordinateur sur le réseau local, par exemple :

```bash
EXPO_PUBLIC_GAME_SERVER_URL=ws://192.168.1.20:8787 pnpm mobile
```

Dans le navigateur :

```bash
pnpm web
```

Sur téléphone : installez l'application **Expo Go**, lancez la commande ci-dessous, puis scannez le QR code affiché.

```bash
pnpm mobile
```

Tests (règles partagées et serveur, dont les scénarios de déconnexion) et vérification des types :

```bash
pnpm test
```

```bash
pnpm typecheck
```
