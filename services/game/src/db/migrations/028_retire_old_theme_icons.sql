-- Les anciennes icônes envoyées sur le serveur masquaient les nouvelles icônes de l'application.
-- Elles sont mises de côté, pas effacées : les fichiers restent stockés et leur clé est conservée ici.
CREATE TABLE retired_theme_icons (
  theme_id text PRIMARY KEY,
  icon_key text NOT NULL,
  retired_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO retired_theme_icons (theme_id, icon_key)
SELECT theme_id, icon_key FROM theme_asset_overrides WHERE icon_key IS NOT NULL;

-- Une ligne sans couverture n'a plus de raison d'être (la table exige une icône ou une couverture).
DELETE FROM theme_asset_overrides WHERE cover_key IS NULL;

UPDATE theme_asset_overrides SET icon_key = NULL WHERE icon_key IS NOT NULL;
