-- Décors du titre, banderoles mensuelles et titres des thèmes créés dans l'admin.
ALTER TABLE profiles ADD COLUMN equipped_decor text;
ALTER TABLE profiles ADD COLUMN equipped_banner text;
ALTER TABLE custom_themes ADD COLUMN titles jsonb;

-- Meilleur joueur du monde d'un thème pour un mois terminé.
CREATE TABLE monthly_banners (
  season_id text NOT NULL,
  theme_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  xp integer NOT NULL,
  PRIMARY KEY (season_id, theme_id)
);
CREATE INDEX monthly_banners_user ON monthly_banners (user_id, season_id DESC);

-- Mois déjà traités : leurs banderoles ne sont attribuées qu'une fois.
CREATE TABLE banner_seasons_closed (
  season_id text PRIMARY KEY,
  closed_at timestamptz NOT NULL DEFAULT now()
);
