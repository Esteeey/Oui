-- Classements « Région » et « À proximité » : région choisie dans le profil, et position approximative
-- (arrondie à 0,1°, environ 11 km) enregistrée seulement si le joueur l'active. Jamais la position exacte.
ALTER TABLE profiles ADD COLUMN region text CHECK (region IS NULL OR char_length(region) BETWEEN 1 AND 60);
ALTER TABLE profiles ADD COLUMN geo_lat double precision CHECK (geo_lat IS NULL OR geo_lat BETWEEN -90 AND 90);
ALTER TABLE profiles ADD COLUMN geo_lon double precision CHECK (geo_lon IS NULL OR geo_lon BETWEEN -180 AND 180);
CREATE INDEX profiles_region ON profiles (country, region) WHERE region IS NOT NULL;
-- Classement de la semaine : XP des duels par date.
CREATE INDEX IF NOT EXISTS duel_results_created ON duel_results (created_at);
