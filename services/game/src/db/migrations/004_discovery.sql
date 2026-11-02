-- Recherche par début de pseudo (insensible à la casse).
CREATE INDEX profiles_pseudo_prefix ON profiles (lower(pseudo) text_pattern_ops);
CREATE INDEX users_last_seen ON users (last_seen_at DESC);

-- Suggestions actuellement proposées à chaque joueur (renouvelées progressivement).
CREATE TABLE discover_suggestions (
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  suggested_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('personalized', 'random')),
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, suggested_id)
);

-- Historique des profils déjà proposés, pour ne pas toujours montrer les mêmes.
CREATE TABLE discover_history (
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  suggested_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  last_shown_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, suggested_id)
);
