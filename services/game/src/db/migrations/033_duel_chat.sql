-- Messages de fin de partie entre amis (abonnement mutuel), gardés pour que l'autre les voie plus tard.
-- Entre inconnus, rien n'est enregistré : le chat ne vit que pendant le duel en direct.
CREATE TABLE friend_duel_chat (
  id bigserial PRIMARY KEY,
  chat_key text NOT NULL,
  from_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  to_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  message jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX friend_duel_chat_key ON friend_duel_chat (chat_key, id);
