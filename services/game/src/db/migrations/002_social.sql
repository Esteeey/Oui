-- Pseudos sans espaces (nécessaire pour les mentions @pseudo).
UPDATE profiles SET pseudo = replace(pseudo, ' ', '_');

-- Abonnements entre joueurs (indépendants des amitiés).
CREATE TABLE follows (
  follower_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  followee_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, followee_id),
  CHECK (follower_id <> followee_id)
);
CREATE INDEX follows_followee ON follows (followee_id, created_at DESC);

-- Demandes d'abonnement vers un profil privé.
CREATE TABLE follow_requests (
  requester_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  target_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (requester_id, target_id),
  CHECK (requester_id <> target_id)
);
CREATE INDEX follow_requests_target ON follow_requests (target_id, created_at DESC);

-- Abonnements aux thèmes (donnent le droit de publier dans leur fil).
CREATE TABLE theme_subscriptions (
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  theme_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, theme_id)
);
CREATE INDEX theme_subscriptions_theme ON theme_subscriptions (theme_id);

-- Publications : sur le mur de l'auteur, ou dans le fil d'un thème.
CREATE TABLE posts (
  id uuid PRIMARY KEY,
  author_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  target text NOT NULL CHECK (target IN ('profile', 'theme')),
  theme_id text,
  text text NOT NULL CHECK (char_length(text) BETWEEN 1 AND 280),
  created_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  CHECK ((target = 'theme') = (theme_id IS NOT NULL))
);
CREATE INDEX posts_author ON posts (author_id, created_at DESC);
CREATE INDEX posts_theme ON posts (theme_id, created_at DESC) WHERE theme_id IS NOT NULL;

-- Commentaires, avec réponse à un commentaire (un niveau).
CREATE TABLE comments (
  id uuid PRIMARY KEY,
  post_id uuid NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  parent_comment_id uuid REFERENCES comments (id) ON DELETE CASCADE,
  text text NOT NULL CHECK (char_length(text) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz
);
CREATE INDEX comments_post ON comments (post_id, created_at);

CREATE TABLE post_likes (
  post_id uuid NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

-- Mentions @pseudo (servent aux notifications du module suivant).
CREATE TABLE mentions (
  id uuid PRIMARY KEY,
  content_type text NOT NULL CHECK (content_type IN ('post', 'comment')),
  content_id uuid NOT NULL,
  author_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  mentioned_user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (content_type, content_id, mentioned_user_id)
);
CREATE INDEX mentions_user ON mentions (mentioned_user_id, created_at DESC);
