# Consignes pour les agents (Codex, Claude…)

Qu1z : jeu de quiz social et compétitif en duel 1 contre 1. Application Expo (Android, iOS, web) et serveur de jeu Node.
À lire aussi : [`README.md`](README.md), [`docs/MODE-DUEL.md`](docs/MODE-DUEL.md) (règles du duel et réglages « À AJUSTER »),
[`docs/CONCEPTION.md`](docs/CONCEPTION.md), et [`apps/mobile/AGENTS.md`](apps/mobile/AGENTS.md) (règles Expo).

## Règles de travail (demandées par le propriétaire)

- **Toujours répondre en français**, même après une longue suite de commandes.
- **Commit, push et déploiement seulement quand on le demande explicitement.** Un push sur la branche suivie par
  Railway redéploie le serveur de production : c'est un déploiement.
- Pas de ligne d'attribution (« Co-authored-by », « Generated with… ») dans les commits.
- Ne pas supprimer de fonctionnalité existante. Ne pas modifier un écran qu'on ne t'a pas demandé de modifier.
- **Ne jamais utiliser de contenu QuizUp** (sons, images, questions, apparence exacte). Le dossier
  `C:\Users\esteb\Downloads\audio_pack` est extrait de l'APK QuizUp : interdit. Noms, couleurs, icônes et questions
  doivent être propres à Qu1z.
- **Secrets** : ne jamais afficher, recopier ni committer `DATABASE_URL`, `QU1Z_NETWORK_SALT`, `RESEND_API_KEY`,
  `EXPO_ACCESS_TOKEN` ni aucun jeton. Les connexions (GitHub, Railway, Cloudflare, Expo) sont faites par le
  propriétaire lui-même. Pas de compte de test créé en production (seulement sur le serveur local).
- Ne pas modifier les réglages système du PC ni du téléphone. Ne pas enregistrer l'écran du téléphone pendant qu'il
  s'en sert.
- Respecter le réglage « réduire les animations » du téléphone (`useReducedMotion`) dans toute nouvelle animation.

## Structure

```
apps/mobile/       application Expo SDK 58 (expo-router, routes typées, Reanimated 4)
services/game/     serveur Node (WebSocket + API HTTP), PostgreSQL ; migrations dans src/db/migrations (NNN_nom.sql)
packages/shared/   règles partagées : barème points(), xp(), niveaux, bot, défis du jour, protocole, catalogue, questions
docs/              conception et mode duel
```

Le serveur fait autorité : le téléphone n'envoie que ses choix (id de réponse + temps écoulé), jamais de points ni d'XP.

## Outils et vérifications

- Gestionnaire de paquets : **pnpm 10.28** (pas installé globalement). Utiliser `npx -y pnpm@10.28.0 …`.
  Ajouter un module Expo : `cd apps/mobile && npx -y pnpm@10.28.0 add <module>@<version compatible SDK 58>`.
- Vérification des types, dans chaque dossier (`apps/mobile`, `services/game`, `packages/shared`) :
  `node ../../node_modules/typescript/bin/tsc --noEmit -p .`
- Tests :
  - `packages/shared` : `node ../../node_modules/vitest/vitest.mjs run`. Ils couvrent points(), xp(), les niveaux, le bot et les défis du jour.
  - `services/game` : la même commande. Ce sont des tests de bout en bout sur une base PGlite en mémoire.
- Toujours lancer typecheck + tests avant de dire qu'une tâche est finie.
- Une nouvelle route expo-router non encore générée se tape avec `as Href` (routes typées).

## Lancer en local

- Serveur : `node node_modules/tsx/dist/cli.mjs services/game/src/index.ts`, sur le port 8787. Sans `DATABASE_URL`, il prend une
  base PGlite locale (`QU1Z_DATA_DIR`).
- Web : `cd apps/mobile && node ../../node_modules/expo/bin/cli start --web --port 8081`.
- `apps/mobile/.env.local` (non commité) contient `EXPO_PUBLIC_GAME_SERVER_URL=ws://<IP du PC>:8787` pour tester
  avec le serveur local, y compris depuis le téléphone sur le même Wi-Fi.

## Production

- **Serveur de jeu (Railway)** : `wss://oui-production.up.railway.app` (santé : `https://oui-production.up.railway.app/health`).
  - Le dépôt GitHub est `Esteeey/Oui`.
  - Railway redéploie automatiquement à chaque push sur la branche suivie (actuellement `claude/pensive-fermat-nl8xxq`).
  - Les migrations s'appliquent au démarrage.
  - Logs et variables d'environnement : tableau de bord Railway. Si on veut le CLI : `npm i -g @railway/cli`, puis le propriétaire fait `railway login` lui-même.
  - Variables lues par le serveur : `DATABASE_URL`, `QU1Z_NETWORK_SALT`, `QU1Z_TRUST_PROXY`, `QU1Z_XP_MULTIPLIER` (1 à 5), `QU1Z_APP_URL`, `MEDIA_PUBLIC_URL`, `QU1Z_REQUIRE_EMAIL`, `RESEND_API_KEY`, `QU1Z_PUSH`, `EXPO_ACCESS_TOKEN`.
- **Site web (Cloudflare Workers, projet `qu1z`)** : https://qu1z.qu1z-cf.workers.dev. Wrangler est déjà connecté sur
  ce PC (compte du propriétaire). Déploiement, depuis `apps/mobile` :
  ```bash
  EXPO_PUBLIC_GAME_SERVER_URL=wss://oui-production.up.railway.app node ../../node_modules/expo/bin/cli export --platform web --output-dir dist
  ```
  puis, dans un dossier temporaire HORS du dépôt contenant une copie de `dist` (ex. `web-<sha>`) et ce `wrangler.jsonc` :
  ```json
  { "name": "qu1z", "compatibility_date": "2026-10-01",
    "assets": { "directory": "../web-<sha>", "not_found_handling": "single-page-application" } }
  ```
  lancer `npx --yes wrangler deploy`. Retour arrière : `npx wrangler rollback`.

## APK Android et téléphone

- **Signature des mises à jour Android** : toujours construire l’APK dans `C:\q1`, en utilisant le dossier `apps/mobile/android` existant et son keystore `apps/mobile/android/app/debug.keystore`. Ne jamais lancer `expo prebuild --clean`, supprimer ou régénérer `apps/mobile/android`, ni remplacer `debug.keystore`.
- Une copie de sauvegarde du keystore est conservée hors du dépôt à `C:\q1-keystore-sauvegarde\debug.keystore` (ne pas la committer). Si le dossier `android` doit un jour être régénéré, remettre cette sauvegarde à `C:\q1\apps\mobile\android\app\debug.keystore` avant toute construction.
- Si `adb install -r` échoue avec `INSTALL_FAILED_UPDATE_INCOMPATIBLE`, ne pas désinstaller l’application : arrêter et demander au propriétaire.


- **Construire dans `C:\q1`** : un clone du dépôt au chemin court, car Windows refuse les chemins trop longs de Gradle. Garder
  `C:\q1` à jour (`git pull`) ou y copier les fichiers modifiés, puis `npx -y pnpm@10.28.0 install` à la racine si les
  dépendances ont changé. Le dossier `android/` est généré (non commité).
  ```bash
  cd C:/q1/apps/mobile/android
  ANDROID_HOME="$LOCALAPPDATA/Android/Sdk" EXPO_PUBLIC_GAME_SERVER_URL=wss://oui-production.up.railway.app NODE_ENV=production \
    ./gradlew.bat assembleRelease -PreactNativeArchitectures=arm64-v8a,armeabi-v7a --no-daemon -q
  ```
  Résultat : `C:\q1\apps\mobile\android\app\build\outputs\apk\release\app-release.apk` (~57 Mo, paquet `com.qu1z.app`).
  La construction prend plusieurs minutes : la lancer en arrière-plan.
- **Installer sur le téléphone (ADB sans fil)** : le propriétaire active Paramètres › Options pour les développeurs ›
  Débogage sans fil, sur le même Wi-Fi que le PC. **Le port change à chaque fois** : ne pas le deviner, le chercher.
  ```bash
  ADB="$LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe"
  "$ADB" mdns services          # repérer la ligne _adb-tls-connect du téléphone (192.168.1.146:<port>)
  "$ADB" devices                # le téléphone apparaît souvent tout seul via mDNS
  "$ADB" connect 192.168.1.146:<port>   # sinon
  "$ADB" -s <appareil> install -r C:/q1/apps/mobile/android/app/build/outputs/apk/release/app-release.apk
  ```
  Si le téléphone n'apparaît pas : demander au propriétaire de réactiver le débogage sans fil (il se coupe en veille).

## Pièges connus (Windows)

- Ne jamais lancer `cat > fichier` sans contenu en entrée : la commande attend et bloque.
- Les longs scripts en heredoc bash échouent parfois (« unexpected EOF ») : écrire le script dans un fichier, puis l'exécuter.
- `git` : si aucune identité n'est configurée, committer avec `git -c user.name=… -c user.email=… commit`, sans
  modifier la configuration globale. L'erreur « geometric-repack … Filename too long » après un commit est sans
  conséquence.
