-- Questions signalées par les joueurs (erreur de contenu). Un signalement par joueur et par question.
CREATE TABLE question_reports (
  reporter_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  question_id text NOT NULL,
  theme_id text NOT NULL,
  reason text NOT NULL,
  details text,
  question_text text NOT NULL,
  correct_answer text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  PRIMARY KEY (reporter_id, question_id)
);
CREATE INDEX question_reports_open ON question_reports (question_id) WHERE resolved_at IS NULL;
