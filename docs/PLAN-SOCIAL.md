# Qu1z — Analyse et plan : notifications, recherche, abonnements, messagerie, groupes, modération

Document de travail avant développement. Il recense l'existant, les écarts avec le cahier des charges,
les décisions à prendre, le modèle de données et l'ordre de réalisation par modules testés un par un.

---

## 1. Analyse de l'existant

### 1.1 Serveur (`services/game`)

| Élément | État actuel | Réutilisable ? |
|---|---|---|
| Transport | WebSocket unique (`server.ts`), messages JSON typés (`packages/shared/src/protocol.ts`), battement de cœur, reconnexion côté client | Oui : base du temps réel (messages, notifications, présence) |
| Comptes | Comptes invités : jeton aléatoire stocké sur l'appareil, empreinte SHA-256 côté serveur, pseudo généré `Joueur 1234` | Partiellement : pas d'e-mail, pas de photo, pas de rôle |
| Stockage | Fichier JSON écrit de façon atomique (`store.ts`) | **Non** pour un lancement public : pas de requêtes, d'index, de transactions ni d'accès concurrent |
| Duels | Moteur serveur, reprise après coupure, récompenses idempotentes, 16 tests | Oui, inchangé |
| Chat de duel | Messages entre les deux joueurs d'un duel classé (`chat`, `getChat`) | À fusionner dans la messagerie privée |
| Présence | `setOnline` connu du serveur, non exposé | Oui : base de la présence en ligne |

### 1.2 Application (`apps/mobile`)

| Élément | État actuel |
|---|---|
| Social | **Entièrement local et fictif** (`state/social.tsx`, `demo/data.ts`) : amis, demandes, abonnements aux joueurs et aux thèmes, publications, commentaires, « Bravo », notifications |
| Notifications | Écran statique avec 5 notifications de démonstration |
| Profils | Profil du joueur (données serveur pour le jeu) ; profils des autres = joueurs fictifs |
| Recherche | Recherche de thèmes dans Explorer (locale) ; aucune recherche de joueurs |
| Badges | Calculés sur l'appareil (`game/badges.ts`) ; pas de « titre équipé » |
| Médias | Aucun envoi d'image, pas de photo de profil |
| Navigation | 5 onglets (Fil, Explorer, Classement, Social, Profil) + écrans empilés |

### 1.3 Conséquence

Le cahier des charges exige des fonctionnalités réelles, sécurisées côté serveur, sans données fictives.
Il faut donc **migrer tout le social sur le serveur** et **remplacer le stockage JSON par une vraie base de données**
avant de construire les nouvelles fonctions. Les données de démonstration seront supprimées au fur et à mesure.

---

## 2. Écarts et dépendances externes

| Besoin du cahier des charges | Ce qui manque | Configuration externe |
|---|---|---|
| Base fiable, index, transactions | PostgreSQL | Hébergement PostgreSQL (Neon, Supabase, RDS…) ; en local et en test : PostgreSQL embarqué (PGlite) |
| Bannir une adresse e-mail | Les comptes n'ont pas d'e-mail | Connexion par e-mail (lien magique) → service d'envoi d'e-mails (Resend, Postmark…) |
| Photos, GIF, stickers | Stockage de fichiers | Stockage objet compatible S3 (R2, S3…) ; en local : disque |
| GIF animés | Catalogue de GIF | Clé d'API d'un fournisseur de GIF (GIPHY ou Tenor) |
| Stickers | Aucun | Pack de stickers originaux à dessiner (pas de dépendance externe) |
| Notifications push | Aucune | Projet Expo/EAS + identifiants Apple (APNs) et Google (FCM) |
| Photo de profil | Aucune | Même stockage que les médias |
| Panneau de modération | Aucun | Application web d'administration (`apps/admin`), hébergement |
| Annonces système | Aucun outil | Dans le panneau d'administration |

Tout ce qui ne dépend pas d'un service externe sera développé et testé ici. Les éléments externes seront
branchés derrière une interface (par exemple `MediaStorage`, `PushSender`, `EmailSender`) avec une implémentation
locale pour le développement et les tests, et l'implémentation réelle activée par configuration.

---

## 3. Décisions à valider

1. **Base de données** : PostgreSQL avec migrations SQL versionnées (`services/game/src/db/migrations`, appliquées une seule fois chacune) et requêtes SQL paramétrées (pas d'ORM : plus simple à relire et à auditer) ; PGlite (PostgreSQL embarqué) pour le développement et les tests. Les données actuelles (comptes, duels, résultats) seront migrées depuis le fichier JSON.
2. **Comptes et e-mail** : ajout d'une connexion par e-mail (lien magique). Le compte invité reste possible pour jouer, mais **la messagerie, les publications et les groupes exigent un compte avec e-mail vérifié** : c'est ce qui rend le bannissement par e-mail efficace et limite le spam.
3. **Amis et abonnements** : deux systèmes indépendants, comme demandé. Les amis (réciproques) servent aux défis et au classement entre amis ; les abonnements au fil et à la présence.
4. **Présence en ligne** : visible seulement en cas d'**abonnement réciproque** (je le suis et il me suit), jamais du seul fait d'une conversation, et jamais en cas de blocage.
5. **Chat de duel** : fusionné dans la messagerie privée. Le bouton Chat des résultats ouvre (ou propose) une demande de message à l'adversaire.
6. **Taille des groupes** : 100 membres maximum (configurable).
7. **Limites anti-spam par défaut** (configurables côté serveur) : 20 demandes de message par jour, 3 demandes vers la même personne par mois, 30 invitations de groupe par jour, 10 mentions par publication, 20 signalements par jour.
8. **Durées de conservation (RGPD)** : notifications 50 dernières ; messages tant que la conversation existe pour au moins un participant ; preuves de modération 2 ans après clôture du dossier ; comptes bannis conservés avec l'historique des sanctions. Export et suppression de compte à prévoir (droit d'accès et d'effacement).
9. **Médias** : JPEG, PNG, WebP et GIF uniquement, 8 Mo maximum, type vérifié sur le contenu du fichier (pas seulement l'extension), métadonnées EXIF supprimées, images redimensionnées côté serveur.

---

## 4. Modèle de données (PostgreSQL)

Index sur toutes les clés étrangères et les colonnes de recherche ; contraintes d'unicité indiquées.

**Comptes et profils**
- `users` : id, email (unique, nullable pour les invités), email_verified_at, token_hash, role (`player` | `moderator` | `admin`), status (`active` | `suspended` | `banned`), created_at, last_seen_at.
- `profiles` : user_id, pseudo (unique, insensible à la casse), avatar_media_id, bio, country, equipped_title_id, is_private, show_followers, show_following.
- `banned_emails` : email_hash (unique), sanction_id, created_at.
- Jeu (repris du stockage JSON) : `theme_stats`, `duels`, `duel_results`, `xp_ledger`.

**Abonnements et blocages**
- `follows` : follower_id, followee_id, created_at — unique (follower, followee).
- `follow_requests` : requester_id, target_id, created_at — unique.
- `theme_subscriptions` : user_id, theme_id.
- `friendships`, `friend_requests` (existant fictif, migré).
- `blocks` : blocker_id, blocked_id, created_at — unique ; toute requête sociale filtre les deux sens.

**Contenus communautaires**
- `posts` : id, author_id, target (`profile` | `theme`), theme_id, text, created_at, removed_by_moderation_at.
- `comments` : id, post_id, author_id, parent_comment_id, text, created_at, removed_at.
- `post_likes` : post_id, user_id — unique.
- `mentions` : content_type, content_id, mentioned_user_id.

**Notifications**
- `notifications` : id, user_id, type, group_key (regroupement, ex. `like:post:123`), actor_ids (derniers acteurs), actor_count, payload (JSON : cible à ouvrir), read_at, updated_at. Unique (user_id, group_key) pour les types regroupés. Plafond de 50 par utilisateur appliqué à chaque insertion, dans la même transaction.
- `notification_preferences` : user_id, category, in_app (toujours vrai), push (booléen), plus `hide_message_previews`, `friends_online`.
- `push_tokens` : user_id, token, platform.
- `system_announcements` : id, title, body, author_id, published_at.

**Messagerie et groupes**
- `conversations` : id, kind (`direct` | `group`), name, avatar_media_id, created_by, created_at, deleted_at.
- `conversation_members` : conversation_id, user_id, role (`creator` | `admin` | `member`), joined_at, left_at, hidden_at (suppression de sa boîte), pinned_at, last_read_message_id, excluded_until.
- `message_requests` : id, from_id, to_id, first_message, status (`pending` | `accepted` | `declined`), created_at.
- `group_invitations` : id, conversation_id, inviter_id, invitee_id, status, created_at.
- `messages` : id, conversation_id, sender_id (nul pour un message système), kind (`text` | `image` | `gif` | `sticker` | `system`), text, media_id, reply_to_id, created_at, removed_by_moderation_at. **Ni modification ni suppression par l'auteur.**
- `message_reactions` : message_id, user_id, emoji — unique (message, user).
- `pinned_messages` : conversation_id, message_id, pinned_by, pinned_at.
- `media` : id, owner_id, kind, mime, size, width, height, storage_key, sha256, created_at, removed_at.

**Modération**
- `reports` : id, reporter_id, target_type (`message` | `media` | `user` | `group` | `post` | `comment`), target_id, reason, details, context_snapshot (JSON : contenu et contexte figés au moment du signalement), status (`open` | `in_review` | `closed`), created_at.
- `evidence` : report_id, kind, data (copie protégée des contenus, conservée même si la conversation disparaît des interfaces).
- `sanctions` : id, user_id, level (`warning` | `suspension` | `ban`), reason, restrictions (JSON), starts_at, ends_at, created_by, revoked_at.
- `appeals` : id, sanction_id, user_id, text, attachments, status (`pending` | `in_review` | `accepted` | `rejected`), decision_text, decided_by, decided_at.
- `moderation_log` : id, actor_id, actor_role (`moderator` | `group_admin` | `group_creator`), action, target_type, target_id, details, created_at.
- `group_exclusions` : conversation_id, user_id, until (nul = définitive), by_id, reason.

---

## 5. Architecture serveur

- **Un seul serveur Node** (`services/game`, renommé plus tard `services/api` si besoin), découpé en services : `accounts`, `profiles`, `follows`, `blocks`, `feed`, `notifications`, `search`, `messaging`, `groups`, `media`, `moderation`, `rateLimit`.
- **Temps réel** : le WebSocket existant transporte, en plus des duels, des événements typés : `notification`, `message`, `reaction`, `read`, `presence`, `conversationUpdated`, `invitation`. À la reconnexion, le client demande un rattrapage depuis son dernier identifiant reçu.
- **API HTTP** (en plus du WebSocket) pour les lectures paginées et l'envoi de médias (`multipart`).
- **Contrôles systématiques côté serveur** : authentification, statut du compte (suspendu/banni), rôle, blocage dans les deux sens, confidentialité (profil privé, listes masquées), rôle dans le groupe, limites anti-spam. Une fonction unique `canInteract(a, b)` utilisée par tous les services.
- **Tests** : chaque service a ses tests (base PGlite neuve par test), plus des tests de bout en bout dans le navigateur.

---

## 6. Ordre de réalisation (un module = développé, testé, poussé, montré)

| # | Module | Contenu | Externe |
|---|---|---|---|
| M0 | Fondations | PostgreSQL + migrations, migration des données JSON, API HTTP, rôles, service de blocage, limiteur anti-spam configurable | Hébergement PostgreSQL (plus tard) |
| M1 | Social réel | Profils (pseudo modifiable, privé, listes masquables, titre équipé), abonnements et demandes, abonnements aux thèmes, publications, commentaires et réponses, likes, mentions — tout filtré par les blocages. **Suppression des données fictives.** | — |
| M2 | Centre de notifications | Liste unique, non lues, « Tout marquer comme lu », regroupement des likes et réponses, plafond de 50, préférences par catégorie, temps réel ; types : communauté, abonnements, progression, défis, classement, système | — |
| M3 | Recherche et Découvrir | Icône de recherche sur tous les onglets (sauf jeu), joueurs et thèmes ; page Découvrir avec suggestions mixtes renouvelées progressivement ; recherche dans les listes d'abonnés | — |
| M4 | Messagerie privée | Bulle séparée de la cloche, demandes de message, conversations, texte, statuts Envoyé / Lu, présence, non-lus par conversation, épingler, supprimer de sa boîte, réponses, réactions | — |
| M5 | Médias | Photos (galerie et appareil photo), stickers originaux, GIF, photo de profil ; validation et stockage | Stockage S3, clé GIF |
| M6 | Groupes | Création, invitations, rôles et transfert, suppression, historique complet, épinglés, messages système, exclusions | — |
| M7 | Modération | Signalements avec preuves, panneau web de modération, sanctions (3 niveaux), appels, journal, interventions invisibles, annonces système | Hébergement du panneau |
| M8 | Comptes e-mail et push | Connexion par lien magique, bannissement d'e-mail, notifications push (avec masquage des aperçus) | Service e-mail, EAS/APNs/FCM |

Chaque module se termine par : tests serveur, test de bout en bout dans le navigateur, mise à jour de cette page,
commit et push, puis un compte rendu (ce qui marche, ce qui reste, ce qui attend une configuration externe).

---

## 7. Avancement

| Module | État | Détail |
|---|---|---|
| M0 Fondations | **Terminé** | PostgreSQL (PGlite en local et en test, `DATABASE_URL` en production), migration `001_init.sql`, reprise de l'ancien fichier JSON (`pnpm --filter @qu1z/game-server import-json`), récompenses versées dans une transaction avec clé unique (duel, joueur), rôles (`player`, `moderator`, `admin`) et statut de compte (banni = connexion et API refusées), blocages (API + jamais d'appariement entre joueurs bloqués), limiteur anti-spam configurable, API HTTP authentifiée (`/api/me`, `/api/blocks`). 27 tests serveur + test de bout en bout à deux navigateurs. |
| M1 Social réel | À faire | |
