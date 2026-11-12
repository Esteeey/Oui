-- Stickers importés par les joueurs (image WebP, éventuellement animée). Utilisables partout où l'est un sticker du pack.
CREATE TABLE user_stickers (
  id text PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz
);
CREATE INDEX user_stickers_owner ON user_stickers (owner_id, created_at DESC) WHERE removed_at IS NULL;
