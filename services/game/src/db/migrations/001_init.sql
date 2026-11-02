-- Comptes, rôles et statut (les sanctions détaillées arrivent avec la modération).
CREATE TABLE users (
  id uuid PRIMARY KEY,
  token_hash text NOT NULL UNIQUE,
  email text UNIQUE,
  email_verified_at timestamptz,
  role text NOT NULL DEFAULT 'player' CHECK (role IN ('player', 'moderator', 'admin')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'banned')),
  xp integer NOT NULL DEFAULT 0 CHECK (xp >= 0),
  pending_result_duel_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz
);

CREATE TABLE profiles (
  user_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  pseudo text NOT NULL,
  bio text NOT NULL DEFAULT '',
  country text,
  is_private boolean NOT NULL DEFAULT false,
  show_followers boolean NOT NULL DEFAULT true,
  show_following boolean NOT NULL DEFAULT true,
  equipped_title text
);
CREATE UNIQUE INDEX profiles_pseudo_unique ON profiles (lower(pseudo));

-- Statistiques de jeu par thème.
CREATE TABLE theme_stats (
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  theme_id text NOT NULL,
  xp integer NOT NULL DEFAULT 0,
  rating integer NOT NULL,
  duels integer NOT NULL DEFAULT 0,
  wins integer NOT NULL DEFAULT 0,
  draws integer NOT NULL DEFAULT 0,
  correct integer NOT NULL DEFAULT 0,
  answered integer NOT NULL DEFAULT 0,
  total_correct_response_ms bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, theme_id)
);
CREATE INDEX theme_stats_leaderboard ON theme_stats (theme_id, rating DESC);

-- Duels : l'état complet est conservé pour reprendre un duel après un redémarrage.
CREATE TABLE duels (
  id uuid PRIMARY KEY,
  theme_id text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('bot', 'pvp')),
  state jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX duels_unfinished ON duels (created_at) WHERE finished_at IS NULL;

CREATE TABLE duel_participants (
  duel_id uuid NOT NULL REFERENCES duels (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  PRIMARY KEY (duel_id, user_id)
);
CREATE INDEX duel_participants_user ON duel_participants (user_id);

-- Résultat et récompenses : la clé primaire garantit un seul versement par duel et par joueur.
CREATE TABLE duel_results (
  duel_id uuid NOT NULL REFERENCES duels (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  result jsonb NOT NULL,
  xp_awarded integer NOT NULL CHECK (xp_awarded >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (duel_id, user_id)
);
CREATE INDEX duel_results_history ON duel_results (user_id, created_at DESC);

-- Chat de duel (sera fusionné dans la messagerie privée).
CREATE TABLE duel_chat_messages (
  id uuid PRIMARY KEY,
  duel_id uuid NOT NULL REFERENCES duels (id) ON DELETE CASCADE,
  from_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX duel_chat_by_duel ON duel_chat_messages (duel_id, created_at);

-- Blocages : appliqués dans les deux sens par toutes les fonctions sociales.
CREATE TABLE blocks (
  blocker_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
CREATE INDEX blocks_blocked ON blocks (blocked_id);
