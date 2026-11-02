-- Médias envoyés par les joueurs. Le fichier est déjà validé, nettoyé (EXIF) et redimensionné.
CREATE TABLE media (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('message', 'post', 'avatar')),
  -- Clé dans le stockage (disque en local, stockage objet compatible S3 en production).
  storage_key text NOT NULL UNIQUE,
  content_type text NOT NULL,
  width int NOT NULL,
  height int NOT NULL,
  bytes int NOT NULL,
  animated boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Rattaché à un message, une publication ou un profil ; sinon supprimé au bout de 24 h.
  attached_at timestamptz,
  removed_by_moderation_at timestamptz
);
CREATE INDEX media_orphans ON media (created_at) WHERE attached_at IS NULL;

ALTER TABLE profiles ADD COLUMN avatar_media_id uuid REFERENCES media (id) ON DELETE SET NULL;

-- Message non textuel : photo (media_id), GIF externe (gif) ou sticker original (sticker_id).
ALTER TABLE messages ADD COLUMN media_id uuid REFERENCES media (id);
ALTER TABLE messages ADD COLUMN gif jsonb;
ALTER TABLE messages ADD COLUMN sticker_id text;

-- Une publication peut ne contenir qu'une photo.
ALTER TABLE posts ADD COLUMN media_id uuid REFERENCES media (id);
ALTER TABLE posts DROP CONSTRAINT posts_text_check;
ALTER TABLE posts ADD CONSTRAINT posts_text_check CHECK (char_length(text) <= 280);
ALTER TABLE posts ADD CONSTRAINT posts_not_empty CHECK (char_length(text) > 0 OR media_id IS NOT NULL);
