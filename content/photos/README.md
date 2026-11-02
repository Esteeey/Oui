# Photos des questions et des couvertures

Outil : `wikimedia.py` récupère des photos libres sur Wikimedia Commons (domaine public, CC0, CC BY, CC BY-SA),
les réduit à 900 px et enregistre leurs crédits (auteur, licence, page source) dans un fichier JSON.

```bash
python3 wikimedia.py selection.json ../../apps/mobile/assets/photos credits.json
```

`selection.json` associe une clé d'image à un fichier Commons : `{"monuments/tour-eiffel": "File:….jpg"}`.

Les crédits doivent être affichés dans l'application (écran « Crédits des images ») pour respecter les licences CC BY et CC BY-SA.

Domaines réseau nécessaires : `commons.wikimedia.org` et `upload.wikimedia.org`.
Wikimedia limite le nombre de requêtes par adresse réseau : l'outil fait des pauses et réessaie automatiquement.
