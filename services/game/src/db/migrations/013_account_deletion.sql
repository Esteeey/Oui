-- Suppression de compte : les données personnelles sont effacées. Les preuves de modération (signalements, sanctions,
-- appels, journal) sont rattachées à un compte anonyme « deleted » (sans profil ni e-mail), purgé au bout de 6 mois.
ALTER TABLE users DROP CONSTRAINT users_status_check;
ALTER TABLE users ADD CONSTRAINT users_status_check CHECK (status IN ('active', 'suspended', 'banned', 'deleted'));
ALTER TABLE users ADD COLUMN deleted_at timestamptz;
CREATE INDEX users_deleted ON users (deleted_at) WHERE deleted_at IS NOT NULL;
