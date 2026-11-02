# Photos des questions et des couvertures

Deux sources de photos libres, avec crédits enregistrés : Openverse (`openverse.py`) et Wikimedia Commons (`wikimedia.py`).

## Openverse

Domaine réseau nécessaire : `api.openverse.org` (les vignettes y sont aussi servies).

```bash
python3 openverse.py search "tour eiffel" revue/tour-eiffel 12
```

```bash
python3 openverse.py fetch selection.json ../../apps/mobile/assets/photos credits.json
```

`search` télécharge les vignettes des résultats pour les choisir à l'œil ; `fetch` récupère les images retenues
(`{"monuments/tour-eiffel": "<identifiant Openverse>"}`). Licences acceptées : CC0, domaine public, CC BY, CC BY-SA.

## Wikimedia Commons

Outil : `wikimedia.py` récupère des photos libres sur Wikimedia Commons (domaine public, CC0, CC BY, CC BY-SA),
les réduit à 900 px et enregistre leurs crédits (auteur, licence, page source) dans un fichier JSON.

```bash
python3 wikimedia.py selection.json ../../apps/mobile/assets/photos credits.json
```

`selection.json` associe une clé d'image à un fichier Commons : `{"monuments/tour-eiffel": "File:….jpg"}`.

Les crédits doivent être affichés dans l'application (écran « Crédits des images ») pour respecter les licences CC BY et CC BY-SA.

Domaines réseau nécessaires : `commons.wikimedia.org` et `upload.wikimedia.org`.
Wikimedia limite le nombre de requêtes par adresse réseau : l'outil fait des pauses et réessaie automatiquement.
