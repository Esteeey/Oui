-- Photo de couverture du profil (bandeau au-dessus de la photo de profil).
ALTER TABLE profiles ADD COLUMN cover_media_id uuid REFERENCES media (id) ON DELETE SET NULL;
ALTER TABLE media DROP CONSTRAINT media_purpose_check;
ALTER TABLE media ADD CONSTRAINT media_purpose_check CHECK (purpose IN ('message', 'post', 'avatar', 'group', 'cover'));
