-- Sticker du pack Qu1z joint à une publication (à la place d'une photo). Un sticker seul suffit.
ALTER TABLE posts ADD COLUMN sticker_id text;
ALTER TABLE posts DROP CONSTRAINT posts_not_empty;
ALTER TABLE posts ADD CONSTRAINT posts_not_empty CHECK (char_length(text) > 0 OR media_id IS NOT NULL OR sticker_id IS NOT NULL);
