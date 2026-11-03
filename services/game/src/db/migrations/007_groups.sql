-- Groupes : même tables que la messagerie privée (conversations de type « group »).
ALTER TABLE conversations ADD COLUMN avatar_media_id uuid REFERENCES media (id) ON DELETE SET NULL;
ALTER TABLE conversations ADD CONSTRAINT conversations_group_name CHECK (kind <> 'group' OR char_length(name) BETWEEN 1 AND 50);

-- Une photo de groupe est un média à part entière.
ALTER TABLE media DROP CONSTRAINT media_purpose_check;
ALTER TABLE media ADD CONSTRAINT media_purpose_check CHECK (purpose IN ('message', 'post', 'avatar', 'group'));

-- Invitations : on ne rejoint un groupe que sur invitation acceptée.
CREATE TABLE group_invitations (
  id uuid PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  inviter_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  invitee_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz
);
CREATE UNIQUE INDEX group_invitations_pending ON group_invitations (conversation_id, invitee_id) WHERE status = 'pending';
CREATE INDEX group_invitations_invitee ON group_invitations (invitee_id, status, created_at DESC);

-- Exclusions : temporaires (until) ou définitives (until nul). Distinctes d'un bannissement de l'application.
CREATE TABLE group_exclusions (
  conversation_id uuid NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  until timestamptz,
  by_id uuid REFERENCES users (id),
  reason text CHECK (reason IS NULL OR char_length(reason) <= 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

-- Messages épinglés (plusieurs par conversation), visibles par tous les membres.
CREATE TABLE pinned_messages (
  conversation_id uuid NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES messages (id) ON DELETE CASCADE,
  pinned_by uuid REFERENCES users (id),
  pinned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, message_id)
);

-- Message système : événement structuré (le texte affiché est figé à l'écriture).
ALTER TABLE messages ADD COLUMN system_event jsonb;
