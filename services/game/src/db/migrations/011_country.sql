-- Pays choisi par le joueur (colonne prévue dès 001, jamais remplie jusqu'ici) : facultatif, jamais déduit
-- de sa position, et réservé au classement « Pays ». On n'accepte plus qu'un code ISO à deux lettres.
UPDATE profiles SET country = NULL WHERE country IS NOT NULL AND country !~ '^[A-Z]{2}$';
ALTER TABLE profiles ADD CONSTRAINT profiles_country_check CHECK (country ~ '^[A-Z]{2}$');
CREATE INDEX profiles_country ON profiles (country) WHERE country IS NOT NULL;
