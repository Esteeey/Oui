-- Signalements : le contenu et son contexte sont figés au moment du signalement (preuve).
CREATE TABLE reports (
  id uuid PRIMARY KEY,
  reporter_id uuid NOT NULL REFERENCES users (id),
  target_type text NOT NULL CHECK (target_type IN ('message', 'media', 'user', 'group', 'post', 'comment')),
  target_id uuid NOT NULL,
  -- Joueur visé (auteur du contenu, ou le joueur signalé) ; nul pour un groupe entier.
  target_user_id uuid REFERENCES users (id),
  conversation_id uuid REFERENCES conversations (id),
  reason text NOT NULL CHECK (reason IN ('spam', 'harassment', 'hate', 'sexual', 'violence', 'cheating', 'impersonation', 'other')),
  details text CHECK (details IS NULL OR char_length(details) <= 500),
  context_snapshot jsonb NOT NULL,
  -- Signalé par le créateur ou un administrateur du groupe concerné : traité en priorité.
  priority boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_review', 'closed')),
  resolution text CHECK (resolution IS NULL OR char_length(resolution) <= 500),
  handled_by uuid REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reports_status ON reports (status, priority DESC, created_at);
CREATE INDEX reports_target_user ON reports (target_user_id, created_at DESC);
CREATE UNIQUE INDEX reports_once ON reports (reporter_id, target_type, target_id) WHERE status <> 'closed';

-- Sanctions : avertissement, suspension (durée et restrictions), bannissement.
CREATE TABLE sanctions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users (id),
  level text NOT NULL CHECK (level IN ('warning', 'suspension', 'ban')),
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 500),
  -- Suspension : fonctionnalités restreintes (messages, publications, interactions).
  restrictions text[] NOT NULL DEFAULT '{}',
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  report_id uuid REFERENCES reports (id),
  created_by uuid NOT NULL REFERENCES users (id),
  revoked_at timestamptz,
  revoked_by uuid REFERENCES users (id),
  revoke_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sanctions_user ON sanctions (user_id, created_at DESC);

-- Appels : un seul appel par sanction.
CREATE TABLE appeals (
  id uuid PRIMARY KEY,
  sanction_id uuid NOT NULL UNIQUE REFERENCES sanctions (id),
  user_id uuid NOT NULL REFERENCES users (id),
  text text NOT NULL CHECK (char_length(text) BETWEEN 10 AND 2000),
  evidence text CHECK (evidence IS NULL OR char_length(evidence) <= 2000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_review', 'accepted', 'rejected')),
  decision_text text CHECK (decision_text IS NULL OR char_length(decision_text) <= 1000),
  decided_by uuid REFERENCES users (id),
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX appeals_status ON appeals (status, created_at);

-- Journal interne : toutes les actions de modération (officielles et des administrateurs de groupe).
CREATE TABLE moderation_log (
  id uuid PRIMARY KEY,
  actor_id uuid REFERENCES users (id),
  actor_role text NOT NULL CHECK (actor_role IN ('moderator', 'admin', 'group_admin', 'group_creator')),
  action text NOT NULL,
  target_type text NOT NULL,
  target_id uuid,
  details jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX moderation_log_created ON moderation_log (created_at DESC);
CREATE INDEX moderation_log_target ON moderation_log (target_id);

-- Adresses e-mail bannies (empreinte seulement) : impossible de recréer un compte avec.
CREATE TABLE banned_emails (
  email_hash text PRIMARY KEY,
  sanction_id uuid NOT NULL REFERENCES sanctions (id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Exclusion officielle (modération) : invisible des membres, impossible à lever pour les administrateurs du groupe.
ALTER TABLE group_exclusions ADD COLUMN official boolean NOT NULL DEFAULT false;

-- Indice anti-contournement : empreinte du réseau (jamais l'adresse IP en clair), sans bannissement automatique.
ALTER TABLE users ADD COLUMN last_network_hash text;
CREATE INDEX users_network ON users (last_network_hash) WHERE last_network_hash IS NOT NULL;
