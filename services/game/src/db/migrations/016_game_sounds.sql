-- Sons du jeu remplacés depuis le panneau d'administration. Gardés en base (et non sur le disque)
-- pour survivre aux redéploiements du serveur. Sans ligne, l'appli joue son son d'origine.
CREATE TABLE game_sounds (
  id text PRIMARY KEY,
  data bytea NOT NULL,
  content_type text NOT NULL,
  bytes int NOT NULL,
  file_name text,
  updated_by uuid REFERENCES users (id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
