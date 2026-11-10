-- Sticker du pack Qu1z en commentaire (seul, ou avec du texte).
ALTER TABLE comments ADD COLUMN sticker_id text;
ALTER TABLE comments DROP CONSTRAINT comments_not_empty;
ALTER TABLE comments ADD CONSTRAINT comments_not_empty
  CHECK (char_length(text) <= 200 AND (char_length(text) > 0 OR media_id IS NOT NULL OR sticker_id IS NOT NULL));

-- Victoire épinglée sur le profil : une publication liée au duel, sans texte.
ALTER TABLE posts ADD COLUMN duel_id uuid REFERENCES duels (id) ON DELETE CASCADE;
ALTER TABLE posts DROP CONSTRAINT posts_not_empty;
ALTER TABLE posts ADD CONSTRAINT posts_not_empty
  CHECK (char_length(text) > 0 OR media_id IS NOT NULL OR sticker_id IS NOT NULL OR duel_id IS NOT NULL);
CREATE UNIQUE INDEX posts_pinned_duel ON posts (author_id, duel_id) WHERE duel_id IS NOT NULL AND removed_at IS NULL;
