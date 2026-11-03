-- Sessions : un même compte peut être connecté sur plusieurs appareils (connexion par e-mail).
-- Le jeton d'origine du compte invité (users.token_hash) reste valable.
CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user ON sessions (user_id);

-- Codes de connexion par e-mail (lien magique ou code à 6 chiffres) : à usage unique, 15 minutes, 5 essais.
CREATE TABLE email_codes (
  id uuid PRIMARY KEY,
  -- Compte qui a demandé le code (appareil courant).
  requester_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  email text NOT NULL,
  code_hash text NOT NULL,
  -- link : ajouter l'adresse au compte courant ; login : se connecter au compte qui possède déjà l'adresse.
  purpose text NOT NULL CHECK (purpose IN ('link', 'login')),
  target_user_id uuid REFERENCES users (id) ON DELETE CASCADE,
  attempts int NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX email_codes_requester ON email_codes (requester_id, created_at DESC);
CREATE INDEX email_codes_email ON email_codes (lower(email), created_at DESC);

-- Jetons de notifications push (Expo), un par appareil.
CREATE TABLE push_tokens (
  token text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('ios', 'android')),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX push_tokens_user ON push_tokens (user_id);
