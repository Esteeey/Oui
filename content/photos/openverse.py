"""Photos libres via Openverse (api.openverse.org), avec leurs crédits.

Deux étapes, pour choisir les images à l'œil avant de les intégrer :

1. Recherche : télécharge les vignettes des meilleurs résultats dans un dossier de revue,
   avec leur identifiant, auteur et licence.
       python3 openverse.py search "tour eiffel" <dossier de revue> [nombre]

2. Récupération : télécharge les images retenues et enregistre leurs crédits.
       python3 openverse.py fetch <sélection JSON> <dossier des images> <crédits JSON>
   La sélection associe une clé d'image à un identifiant Openverse :
       {"monuments/tour-eiffel": "4bc43a04-…"}

Seules les licences qui autorisent la réutilisation et la modification sont demandées :
CC0, marque du domaine public, CC BY et CC BY-SA (pas de NC ni de ND).
Un seul domaine réseau est nécessaire : api.openverse.org (les vignettes y sont servies).
"""

import io
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

from PIL import Image

USER_AGENT = "Qu1zPrototype/0.1 (prototype de jeu de quiz; https://github.com/esteeey/oui)"
API = "https://api.openverse.org/v1/images"
LICENSES = "cc0,pdm,by,by-sa"
PAUSE_S = 2
MAX_SIDE = 900


def fetch(url: str, attempts: int = 5) -> bytes:
    delay = 10
    for attempt in range(attempts):
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                data = resp.read()
            time.sleep(PAUSE_S)
            return data
        except urllib.error.HTTPError as err:
            if err.code in (429, 503) and attempt < attempts - 1:
                print(f"  limite atteinte ({err.code}), pause {delay} s", flush=True)
                time.sleep(delay)
                delay *= 2
                continue
            raise
    raise RuntimeError("échec")


def save_image(raw: bytes, target: str) -> tuple[int, int]:
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    img.thumbnail((MAX_SIDE, MAX_SIDE))
    os.makedirs(os.path.dirname(target) or ".", exist_ok=True)
    img.save(target, "JPEG", quality=82, optimize=True)
    return img.size


def credit(item: dict) -> dict:
    return {
        "source": "Openverse",
        "id": item["id"],
        "title": item.get("title") or "",
        "author": item.get("creator") or "Inconnu",
        "license": f"{item.get('license', '').upper()} {item.get('license_version') or ''}".strip(),
        "licenseUrl": item.get("license_url") or "",
        "page": item.get("foreign_landing_url") or "",
        "attribution": item.get("attribution") or "",
    }


def search(query: str, review_dir: str, count: int) -> None:
    params = urllib.parse.urlencode({"q": query, "license": LICENSES, "page_size": count, "mature": "false"})
    results = json.loads(fetch(f"{API}/?{params}"))["results"]
    os.makedirs(review_dir, exist_ok=True)
    listing = []
    for i, item in enumerate(results):
        try:
            size = save_image(fetch(f"{API}/{item['id']}/thumb/"), f"{review_dir}/{i:02d}.jpg")
        except Exception as err:  # noqa: BLE001
            print(f"  vignette {i} ignorée : {err}")
            continue
        info = credit(item)
        listing.append({"file": f"{i:02d}.jpg", **info})
        print(f"{i:02d}  {item['id']}  {size[0]}×{size[1]}  {info['license']}  {info['author'][:40]}  {info['title'][:50]}")
    json.dump(listing, open(f"{review_dir}/results.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)


def fetch_selection(selection_path: str, out_dir: str, credits_path: str) -> None:
    selection = json.load(open(selection_path, encoding="utf-8"))
    try:
        credits = json.load(open(credits_path, encoding="utf-8"))
    except FileNotFoundError:
        credits = {}
    for key, image_id in selection.items():
        if key in credits:
            print(f"déjà présent : {key}")
            continue
        item = json.loads(fetch(f"{API}/{image_id}/"))
        if item.get("license") not in LICENSES.split(","):
            print(f"{key} ignoré : licence {item.get('license')}")
            continue
        size = save_image(fetch(f"{API}/{image_id}/thumb/"), f"{out_dir}/{key}.jpg")
        credits[key] = credit(item)
        json.dump(credits, open(credits_path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        print(f"{key} : {size[0]}×{size[1]}, {credits[key]['license']}, {credits[key]['author'][:50]}")


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else ""
    if mode == "search":
        search(sys.argv[2], sys.argv[3], int(sys.argv[4]) if len(sys.argv) > 4 else 12)
    elif mode == "fetch":
        fetch_selection(sys.argv[2], sys.argv[3], sys.argv[4])
    else:
        print(__doc__)
