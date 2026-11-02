# Qu1z

Plateforme sociale et compétitive de culture générale, centrée sur le duel 1 contre 1.
*Qu1z est un nom provisoire.*

Dossier de conception : [`docs/CONCEPTION.md`](docs/CONCEPTION.md)

## Structure

```
apps/mobile/       application Expo (iOS, Android, Web)
packages/shared/   règles du duel, barème, cote, progression, catalogue, questions
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
- 5 thèmes jouables, 12 questions chacun.

Limites du prototype :

- Les autres joueurs, le fil, les amis et les notifications sont des **données de démonstration**, signalées dans l'application. En duel, les réponses de l'adversaire sont simulées.
- La progression est gardée en mémoire : elle est perdue quand l'application est fermée, jusqu'à l'arrivée des comptes et du serveur.

## Lancer le projet

Prérequis : Node.js 22 et pnpm.

```bash
pnpm install
```

Dans le navigateur :

```bash
pnpm web
```

Sur téléphone : installez l'application **Expo Go**, lancez la commande ci-dessous, puis scannez le QR code affiché.

```bash
pnpm mobile
```

Tests et vérification des types :

```bash
pnpm test
```

```bash
pnpm typecheck
```
