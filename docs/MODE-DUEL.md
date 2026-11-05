# Mode duel 1 contre 1

Résumé de ce qui est en place et de l'endroit où chaque règle est codée. Les valeurs marquées **À AJUSTER** sont des
réglages, à changer à un seul endroit.

## Déroulé d'un match (7 manches)

| Étape | Durée | Où |
| --- | --- | --- |
| Carte « Manche N » | 2 000 ms | `RULES.roundCardMs` |
| Question seule | `readingSeconds` de la question (1,5 à 3 s), sinon d'après la longueur | `readingTimeMs()` |
| 4 réponses, puis chrono | chrono lancé 400 ms après | `RULES.choicesLeadMs` |
| Chrono | 10 s ; la manche finit quand les deux ont répondu ou au bout du temps | `RULES.answerTimeMs` |
| Révélation, puis pause | 1 500 ms + 1 500 ms | `RULES.revealMs`, `RULES.transitionMs` |

Le serveur (`services/game/src/duel.ts`) déroule ces phases. Le téléphone n'envoie que l'id de la réponse et le temps
écoulé. Un temps hors de 0 à 10 s est refusé (`invalid_time`). Ton propre verdict (bonne ou mauvaise réponse) reste
affiché tout de suite, comme avant ; la réponse de l'adversaire est révélée à la fin de la manche.

## Points, XP, niveaux (`packages/shared`)

- `points(manche, correct, tempsÉcoulé)` vaut `10 + max(0, 10 − floor(t))`, doublé à la manche 7, et 0 si la réponse est fausse. Le maximum est de 160 points par match.
- `xp({ outcome, score, finished, forfeited, opponentForfeited, multiplier, xpStart })` calcule les bonus :
  - fin de match +40 ;
  - victoire +100 ou égalité +50 ;
  - abandon : 0 XP ;
  - abandon de l'adversaire : victoire +40 +100.
- Le multiplicateur d'XP se règle avec la variable `QU1Z_XP_MULTIPLIER` (1 à 5).
- Niveaux par thème : `LEVEL_THRESHOLDS` suit la formule `seuil(n) = 100 × n^1,5`. Ce tableau est modifiable (**À AJUSTER**).
- L'XP s'ajoute au total du joueur ET au thème joué.

## Défis entre amis (asynchrones)

1. L'invitant joue ses 7 questions tout de suite.
2. L'ami est prévenu (notification et carte « Défis reçus »). Il a 24 h pour rejouer **les mêmes questions** (**À AJUSTER** : `CHALLENGE_EXPIRY_HOURS`).
3. Les statuts possibles sont : envoyé, en attente, accepté, terminé, refusé, expiré et annulé.
4. Liens de défi : `qu1z://defi/{id}` dans l'application et `/defi/{id}` sur le site.

## Fin de match

Boutons Revanche et Partager, et **mini chat** avec l'adversaire :

- réponses rapides et messages de 140 caractères au plus ;
- jamais avec le bot, ni entre joueurs qui se sont bloqués ;
- protégé contre le spam.

## Défis du jour (`packages/shared/src/quests.ts`)

- 3 objectifs par joueur et par jour, toujours les mêmes dans la journée. Exemple : « Gagne 2 matchs en Histoire ».
- La récompense en XP est versée dès que l'objectif est atteint.
- Un compte à rebours jusqu'à minuit est affiché. Le fuseau est `QUEST_TIME_ZONE = Europe/Paris` (**À AJUSTER**), et les objectifs comme les récompenses aussi.

## Classements

- Classement **Semaine** : l'XP gagnée depuis lundi 00:00 UTC, avec un compte à rebours jusqu'à la remise à zéro (**À AJUSTER** : `weekOf()`). Les classements Saison et Cote sont conservés.
- Il existe un classement général et un classement par thème.
- Filtres : Amis, Pays, Région, À proximité (moins de 50 km, **À AJUSTER** : `NEARBY_KM`) et Monde.
- Pour le filtre À proximité, la position est arrondie à environ 10 km. Elle n'est enregistrée que si le joueur l'active.
- Ta position dans le classement est toujours affichée, même hors du top 100.

## Bot

Le bot remplace l'adversaire après environ 10 s sans joueur trouvé. Sa vitesse et sa précision suivent ton niveau
dans le thème (`botAnswer()`).

## Données de démo

Deux thèmes de démonstration, avec 20 questions inventées chacun et un temps de lecture réglé question par question :
**Histoire** (`hist-grandes-dates`) et **Le monde animal** (`nature-animaux`). Ils sont dans
`packages/shared/src/questions.ts`.

## Tests

```bash
cd packages/shared && node ../../node_modules/vitest/vitest.mjs run   # points(), xp(), niveaux, défis du jour
cd services/game && node ../../node_modules/vitest/vitest.mjs run     # serveur : duel, défis, chat, classements
```
