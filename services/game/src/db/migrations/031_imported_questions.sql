-- Questions ajoutées par un administrateur via un fichier CSV, pour n'importe quel thème (de base ou personnalisé).
CREATE TABLE imported_questions (
  id text PRIMARY KEY,
  theme_id text NOT NULL,
  text text NOT NULL,
  choices jsonb NOT NULL,
  difficulty smallint NOT NULL DEFAULT 2,
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX imported_questions_theme ON imported_questions (theme_id);
