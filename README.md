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

## État actuel

- **5 onglets** : Fil d'actualité, Explorer, Classement, Social, Profil.
- **Duel** : classé entre joueurs réels (bot après 10 s sans adversaire) ou d'entraînement contre le bot ; 7 questions, chrono 10 s ; page Résultats (bonus, niveau, Rejouer, Chat, Partager).
- **Social réel (serveur)** : profils (pseudo, bio, titre, profil privé, listes masquables), abonnements et demandes, abonnements aux thèmes, publications sur son mur ou dans un thème, commentaires et réponses, « Bravo », mentions @pseudo, fil d'accueil, classements, blocage.
- 6 thèmes jouables, dont **Drapeaux du monde** en questions illustrées.

Serveur :

- Le serveur fait autorité : questions, chrono, réponses, scores, résultat et **XP** (le client n'envoie que ses choix).
- Une déconnexion ne met jamais le duel en pause ; à la reconnexion (ou réouverture de l'app), le joueur retrouve son duel ou ses résultats.
- Récompenses : bonus fin +20, victoire +40, boost (10 XP par bonne réponse, +30 si sans-faute) ; abandon = 0 XP ; versement unique garanti par la base.
- Blocages et confidentialité vérifiés dans chaque requête ; limites anti-spam configurables.

Limites actuelles (voir `docs/PLAN-SOCIAL.md`) :

- Comptes invités (jeton gardé sur l'appareil) ; connexion par e-mail à venir.
- **Notifications** : centre complet (likes regroupés, commentaires, mentions, abonnements, progression, classements, défis, annonces), préférences, temps réel. Les notifications push sur téléphone arrivent plus tard.
- **Défis** entre joueurs liés par un abonnement, revanche après un duel.
- **Recherche** de joueurs et de thèmes depuis tous les onglets, page **Découvrir des joueurs**, suggestions pendant la saisie d'une mention.
- **Messagerie privée** : demandes de message, conversations texte, réponses, réactions, Envoyé / Lu, présence (abonnés mutuels), épinglage.
- **Médias** : photo de profil, photos dans les messages et les publications (galerie ou appareil photo), 12 stickers originaux, GIF (avec une clé GIPHY ou Tenor). Images vérifiées, nettoyées (EXIF, position) et redimensionnées par le serveur.
- **Groupes** : création, invitations acceptées ou refusées, rôles créateur / administrateur / membre, transfert, exclusions, messages épinglés, messages système, suppression par le créateur.
- Pas encore de modération officielle (signalements, sanctions).

## Lancer le projet

Prérequis : Node.js 22 et pnpm.

```bash
pnpm install
```

Le serveur de jeu (port 8787) doit tourner pour jouer. En local, il utilise un PostgreSQL embarqué (dossier `services/game/data/pg`) ; en production, il se connecte à PostgreSQL via la variable `DATABASE_URL`.

```bash
pnpm server
```

Médias : en local, les images sont rangées dans `services/game/data/media` et servies par le serveur sous `/media/…`. Variables facultatives :

| Variable | Rôle |
| --- | --- |
| `GIPHY_API_KEY` ou `TENOR_API_KEY` | Active les GIF dans la messagerie (sinon « Les GIF arrivent bientôt »). |
| `QU1Z_MEDIA_DIR` | Dossier des images en local (par défaut `data/media`). |
| `MEDIA_PUBLIC_URL` | Adresse publique des images (CDN) quand elles sont servies par un stockage objet. |

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
