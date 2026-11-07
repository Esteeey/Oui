CREATE TABLE live_duel_invitations (
  id uuid PRIMARY KEY,
  sender_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  theme_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'cancelled', 'unavailable')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '120 seconds',
  responded_at timestamptz,
  match_id uuid REFERENCES duels (id) ON DELETE SET NULL,
  notification_status text NOT NULL DEFAULT 'pending',
  CHECK (sender_id <> receiver_id)
);
CREATE INDEX live_invites_receiver ON live_duel_invitations (receiver_id, status, created_at DESC);
CREATE INDEX live_invites_sender ON live_duel_invitations (sender_id, status, created_at DESC);
CREATE UNIQUE INDEX live_invites_pending_pair ON live_duel_invitations (LEAST(sender_id, receiver_id), GREATEST(sender_id, receiver_id)) WHERE status = 'pending';
