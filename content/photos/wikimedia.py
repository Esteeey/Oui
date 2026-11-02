"""Récupération polie de photos libres sur Wikimedia Commons, avec leurs crédits.

- Une requête à la fois, pause entre les requêtes, nouvelle tentative en cas de limite (HTTP 429).
- Seules les licences libres réutilisables sont acceptées (domaine public, CC0, CC BY, CC BY-SA).
- Les originaux sont téléchargés depuis upload.wikimedia.org puis réduits localement (Pillow).

Usage :
    python3 wikimedia.py <fichier de sélection JSON> <dossier de sortie des images> <fichier de crédits JSON>

Le fichier de sélection associe une clé d'image à un titre de fichier Commons :
    {"monuments/tour-eiffel": "File:Tour Eiffel Wikimedia Commons.jpg", ...}
"""

import html
import io
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

from PIL import Image

USER_AGENT = "Qu1zPrototype/0.1 (prototype de jeu de quiz; https://github.com/esteeey/oui)"
API = "https://commons.wikimedia.org/w/api.php"
ALLOWED_LICENSES = re.compile(r"^(public domain|pd|cc0|cc by(-sa)? [0-9.]+)", re.IGNORECASE)
MAX_SIDE = 900
PAUSE_S = 3


def fetch(url: str, attempts: int = 6) -> bytes:
    delay = 15
    for attempt in range(attempts):
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                data = resp.read()
            time.sleep(PAUSE_S)
            return data
        except urllib.error.HTTPError as err:
            if err.code in (429, 502, 503, 504) and attempt < attempts - 1:
                print(f"  limite atteinte ({err.code}), pause {delay} s", flush=True)
                time.sleep(delay)
                delay *= 2
                continue
            raise
        except (TimeoutError, urllib.error.URLError) as err:
            if attempt < attempts - 1:
                print(f"  pas de réponse ({err}), pause {delay} s", flush=True)
                time.sleep(delay)
                delay *= 2
                continue
            raise
    raise RuntimeError("échec")


def strip_html(value: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", "", value or "")).strip()


def image_info(title: str) -> dict:
    query = urllib.parse.urlencode({
        "action": "query",
        "titles": title,
        "prop": "imageinfo",
        "iiprop": "url|size|extmetadata|mime",
        "format": "json",
    })
    data = json.loads(fetch(f"{API}?{query}"))
    page = next(iter(data["query"]["pages"].values()))
    if "imageinfo" not in page:
        raise ValueError(f"fichier introuvable : {title}")
    info = page["imageinfo"][0]
    meta = info.get("extmetadata", {})
    return {
        "title": page["title"],
        "url": info["url"],
        "mime": info.get("mime"),
        "page": f"https://commons.wikimedia.org/wiki/{urllib.parse.quote(page['title'].replace(' ', '_'))}",
        "license": strip_html(meta.get("LicenseShortName", {}).get("value", "")),
        "licenseUrl": strip_html(meta.get("LicenseUrl", {}).get("value", "")),
        "author": strip_html(meta.get("Artist", {}).get("value", "")) or "Inconnu",
    }


def main() -> None:
    selection_path, out_dir, credits_path = sys.argv[1:4]
    selection = json.load(open(selection_path, encoding="utf-8"))
    try:
        credits = json.load(open(credits_path, encoding="utf-8"))
    except FileNotFoundError:
        credits = {}

    for key, title in selection.items():
        if key in credits:
            print(f"déjà présent : {key}")
            continue
        print(f"{key} ← {title}", flush=True)
        try:
            info = image_info(title)
        except Exception as err:  # noqa: BLE001
            print(f"  ignoré : {err}")
            continue
        if not ALLOWED_LICENSES.match(info["license"]):
            print(f"  ignoré : licence non retenue ({info['license']})")
            continue
        if info["mime"] not in ("image/jpeg", "image/png"):
            print(f"  ignoré : format {info['mime']}")
            continue
        raw = fetch(info["url"])
        img = Image.open(io.BytesIO(raw)).convert("RGB")
        img.thumbnail((MAX_SIDE, MAX_SIDE))
        target = f"{out_dir}/{key}.jpg"
        import os

        os.makedirs(os.path.dirname(target), exist_ok=True)
        img.save(target, "JPEG", quality=82, optimize=True)
        credits[key] = {k: info[k] for k in ("title", "page", "author", "license", "licenseUrl")}
        json.dump(credits, open(credits_path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        print(f"  ok : {img.size[0]}×{img.size[1]}, {info['license']}, {info['author'][:60]}")


if __name__ == "__main__":
    main()
