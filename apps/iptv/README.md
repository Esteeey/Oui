# Oui TV — lecteur IPTV

Application web (PWA) sans build : ouvrez `index.html` via un serveur statique.

```bash
cd apps/iptv && python3 -m http.server 8080
```

Fonctionnalités : connexion Xtream Codes / lien M3U / fichier M3U, multi-playlists, TV en direct avec EPG (XMLTV + short EPG), films et séries (saisons, épisodes, reprise de lecture, épisode suivant automatique), favoris, historique, recherche globale, lecteur HLS (hls.js) et MPEG-TS (mpegts.js) avec choix qualité/audio, zapping ↑/↓, saisie du numéro de chaîne, PiP, plein écran, installable sur mobile.

Aucun contenu n'est fourni : l'utilisateur utilise son propre abonnement légal. Les serveurs doivent autoriser CORS ; une page servie en HTTPS ne peut pas lire des flux HTTP.
