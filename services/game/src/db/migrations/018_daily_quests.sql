-- Défis du jour : 3 objectifs par joueur et par jour (jour dans le fuseau de l'app), fixés au premier affichage
-- ou au premier match du jour, avec leur avancée et la date à laquelle la récompense a été versée.
CREATE TABLE daily_quests (
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  day date NOT NULL,
  quest_id text NOT NULL,
  position int NOT NULL,
  kind text NOT NULL,
  label text NOT NULL,
  theme_id text,
  goal int NOT NULL CHECK (goal > 0),
  reward int NOT NULL CHECK (reward >= 0),
  progress int NOT NULL DEFAULT 0,
  completed_at timestamptz,
  PRIMARY KEY (user_id, day, quest_id)
);
CREATE INDEX daily_quests_completed ON daily_quests (completed_at) WHERE completed_at IS NOT NULL;
