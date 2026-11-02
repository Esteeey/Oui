# Drapeaux des questions illustrées

Dessins originaux de Qu1z (motifs des drapeaux nationaux, sans reprise d'images existantes).

Régénérer les images :

```bash
node make-flags.js
```

```bash
node rasterize.js . ../../apps/mobile/assets/questions/flags
```

`make-flags.js` écrit les SVG dans le dossier courant ; `rasterize.js` (Playwright) les convertit en PNG 600×400.
