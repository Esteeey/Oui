-- Centre de notifications : 50 notifications au plus par joueur (appliqué par le serveur à chaque ajout).
CREATE TABLE notifications (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  type text NOT NULL,
  category text NOT NULL CHECK (category IN ('challenges', 'follows', 'community', 'progression', 'ranking', 'system', 'friends_online')),
  -- Clé de regroupement (ex. « like:post:<id> ») : une seule notification par clé et par joueur.
  group_key text,
  actor_ids uuid[] NOT NULL DEFAULT '{}',
  actor_count integer NOT NULL DEFAULT 0,
  data jsonb NOT NULL DEFAULT '{}',
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user ON notifications (user_id, updated_at DESC);
CREATE UNIQUE INDEX notifications_group ON notifications (user_id, group_key) WHERE group_key IS NOT NULL;
CREATE INDEX notifications_unread ON notifications (user_id) WHERE read_at IS NULL;

-- Préférences : notifications push par catégorie (le centre garde toujours tout),
-- connexions des personnes suivies (désactivées par défaut), aperçus des messages.
CREATE TABLE notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  prefs jsonb NOT NULL
);

-- Défis entre joueurs liés par un abonnement (dans un sens ou dans l'autre).
CREATE TABLE challenges (
  id uuid PRIMARY KEY,
  from_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  to_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  theme_id text NOT NULL,
  kind text NOT NULL DEFAULT 'challenge' CHECK (kind IN ('challenge', 'rematch')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled', 'expired')),
  duel_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  CHECK (from_id <> to_id)
);
CREATE INDEX challenges_to ON challenges (to_id, status, created_at DESC);
CREATE INDEX challenges_from ON challenges (from_id, status, created_at DESC);

-- Annonces officielles (publiées par le personnel autorisé).
CREATE TABLE system_announcements (
  id uuid PRIMARY KEY,
  author_id uuid NOT NULL REFERENCES users (id),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  kind text NOT NULL CHECK (kind IN ('maintenance', 'update', 'event', 'feature', 'info')),
  created_at timestamptz NOT NULL DEFAULT now()
);
