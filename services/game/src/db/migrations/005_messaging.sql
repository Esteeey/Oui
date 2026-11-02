-- Conversations privées (les groupes réutiliseront ces tables).
CREATE TABLE conversations (
  id uuid PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('direct', 'group')),
  -- Paire triée « idA:idB » : une seule conversation privée active par paire.
  direct_key text,
  name text,
  created_by uuid REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  -- Fermée pour tous (blocage, suppression de groupe) : invisible dans l'application, conservée pour la modération.
  deleted_at timestamptz
);
CREATE UNIQUE INDEX conversations_direct_active ON conversations (direct_key) WHERE direct_key IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE conversation_members (
  conversation_id uuid NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('creator', 'admin', 'member')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  -- Supprimée de MA boîte : seuls les messages postérieurs réapparaissent.
  hidden_at timestamptz,
  pinned_at timestamptz,
  last_read_seq bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX conversation_members_user ON conversation_members (user_id);

-- Demandes de message : une conversation ne s'ouvre qu'après acceptation.
CREATE TABLE message_requests (
  id uuid PRIMARY KEY,
  from_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  to_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  first_message text CHECK (first_message IS NULL OR char_length(first_message) BETWEEN 1 AND 1000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  conversation_id uuid REFERENCES conversations (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  CHECK (from_id <> to_id)
);
CREATE INDEX message_requests_to ON message_requests (to_id, status, created_at DESC);
CREATE INDEX message_requests_pair ON message_requests (from_id, to_id, created_at DESC);

-- Messages : jamais modifiés ni supprimés par leur auteur (seule la modération peut les retirer).
CREATE TABLE messages (
  id uuid PRIMARY KEY,
  seq bigint GENERATED ALWAYS AS IDENTITY,
  conversation_id uuid NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  sender_id uuid REFERENCES users (id),
  kind text NOT NULL DEFAULT 'text' CHECK (kind IN ('text', 'image', 'gif', 'sticker', 'system')),
  text text CHECK (text IS NULL OR char_length(text) BETWEEN 1 AND 2000),
  reply_to_id uuid REFERENCES messages (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  removed_by_moderation_at timestamptz
);
CREATE UNIQUE INDEX messages_seq ON messages (seq);
CREATE INDEX messages_conversation ON messages (conversation_id, seq DESC);

CREATE TABLE message_reactions (
  message_id uuid NOT NULL REFERENCES messages (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  emoji text NOT NULL CHECK (char_length(emoji) BETWEEN 1 AND 8),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);
