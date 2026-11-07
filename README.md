# Qu1z

Plateforme sociale et compétitive de culture générale, centrée sur le duel 1 contre 1.
*Qu1z est un nom provisoire.*

Dossier de conception : [`docs/CONCEPTION.md`](docs/CONCEPTION.md)
Mode duel (règles, défis, classements, réglages) : [`docs/MODE-DUEL.md`](docs/MODE-DUEL.md)

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
- 8 thèmes jouables, dont **Drapeaux du monde** en questions illustrées, et deux thèmes de démonstration du mode duel (Histoire, Le monde animal).

Serveur :

- Le serveur fait autorité : questions, chrono, réponses, scores, résultat et **XP** (le client n'envoie que ses choix).
- Une déconnexion ne met jamais le duel en pause ; à la reconnexion (ou réouverture de l'app), le joueur retrouve son duel ou ses résultats.
- Récompenses : score du match + bonus fin +40 + victoire +100 (égalité +50) ; abandon = 0 XP ; versement unique garanti par la base (voir `docs/MODE-DUEL.md`).
- Blocages et confidentialité vérifiés dans chaque requête ; limites anti-spam configurables.

Limites actuelles (voir `docs/PLAN-SOCIAL.md`) :

- **Comptes** : invité au départ, puis adresse e-mail confirmée par code (connexion sur plusieurs appareils, sans mot de passe).
- **Notifications push** (téléphone) : messages avec aperçu masquable, notifications communautaires selon les préférences.
- **Notifications** : centre complet (likes regroupés, commentaires, mentions, abonnements, progression, classements, défis, annonces), préférences, temps réel. Les notifications push sur téléphone arrivent plus tard.
- **Défis** entre joueurs liés par un abonnement, revanche après un duel.
- **Invitations de duel en direct** : WebSocket commun web/mobile, réponses accept/refuse/annule, expiration serveur à 120 s, reprise après reconnexion et notification push Expo/Web Push si aucune session n’est au premier plan.
- **Recherche** de joueurs et de thèmes depuis tous les onglets, page **Découvrir des joueurs**, suggestions pendant la saisie d'une mention.
- **Messagerie privée** : demandes de message, conversations texte, réponses, réactions, Envoyé / Lu, présence (abonnés mutuels), épinglage.
- **Médias** : photo de profil, photos dans les messages et les publications (galerie ou appareil photo), 12 stickers originaux, GIF (avec une clé GIPHY ou Tenor). Images vérifiées, nettoyées (EXIF, position) et redimensionnées par le serveur.
- **Groupes** : création, invitations acceptées ou refusées, rôles créateur / administrateur / membre, transfert, exclusions, messages épinglés, messages système, suppression par le créateur.
- **Modération** : signalements avec preuves, panneau de modération, interventions invisibles dans les groupes, avertissement / suspension / bannissement, appels, journal, annonces.

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
| `QU1Z_NETWORK_SALT` | Sel secret de l’empreinte réseau (anti-contournement des bannissements). À définir en production. |
| `QU1Z_TRUST_PROXY` | `1` si le serveur est derrière un proxy de confiance (lecture de `x-forwarded-for`). |
| `RESEND_API_KEY`, `MAIL_FROM` | Envoi réel des e-mails de connexion (sinon les codes s’affichent dans le terminal du serveur). |
| `QU1Z_REQUIRE_EMAIL` | `1` ou `0` : e-mail confirmé exigé pour la messagerie, les publications et les groupes (par défaut : oui si `RESEND_API_KEY`). |
| `QU1Z_APP_URL` | Adresse ouverte par le lien magique (par défaut `qu1z://`, ou l’adresse du site web). |
| `EXPO_ACCESS_TOKEN` | Jeton Expo si la sécurité renforcée des push est activée ; `QU1Z_PUSH=0` coupe les push. |
| `WEB_PUSH_VAPID_PUBLIC_KEY` | Clé publique VAPID utilisée par le navigateur pour s’abonner aux notifications. |
| `WEB_PUSH_VAPID_PRIVATE_KEY` | Clé privée VAPID ; garder uniquement côté serveur. |
| `WEB_PUSH_VAPID_SUBJECT` | Contact VAPID, par exemple `mailto:admin@votre-domaine.fr`. |

Le Web Push nécessite HTTPS (localhost est accepté en développement), les trois clés VAPID, et l’autorisation du navigateur. Générer une paire avec `npx web-push generate-vapid-keys`, puis configurer ces variables sur le serveur. Sur iOS, les notifications Web Push nécessitent une web app installée depuis Safari ; l’application native utilise Expo Push.

Nommer le premier administrateur (serveur de jeu arrêté en local) :

```bash
pnpm --filter @qu1z/game-server set-role MonPseudo admin
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
