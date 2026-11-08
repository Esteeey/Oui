-- Page d'une publication : j'aime sur les commentaires et photo jointe à un commentaire.
CREATE TABLE comment_likes (
  comment_id uuid NOT NULL REFERENCES comments (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, user_id)
);

ALTER TABLE comments ADD COLUMN media_id uuid REFERENCES media (id) ON DELETE SET NULL;

-- Un commentaire peut n'être qu'une photo : le texte devient facultatif dans ce cas.
ALTER TABLE comments DROP CONSTRAINT comments_text_check;
ALTER TABLE comments ADD CONSTRAINT comments_not_empty CHECK (char_length(text) <= 200 AND (char_length(text) > 0 OR media_id IS NOT NULL));
