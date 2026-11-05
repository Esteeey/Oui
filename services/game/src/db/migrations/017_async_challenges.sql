-- Défis asynchrones : l'invitant joue ses 7 questions tout de suite (réponses et temps enregistrés),
-- l'ami rejoue plus tard EXACTEMENT les mêmes questions contre cet enregistrement.
-- Statuts : sent (envoyé, l'invitant joue), pending (en attente de l'ami), accepted (l'ami joue),
-- completed (terminé), declined (refusé), expired (expiré au bout de 24 h), cancelled (annulé).
ALTER TABLE challenges DROP CONSTRAINT IF EXISTS challenges_status_check;
ALTER TABLE challenges ADD CONSTRAINT challenges_status_check
  CHECK (status IN ('sent', 'pending', 'accepted', 'completed', 'declined', 'cancelled', 'expired'));

-- Duel joué par l'invitant (manche « aller ») ; `duel_id` reste le duel de l'ami (manche « retour »).
ALTER TABLE challenges ADD COLUMN from_duel_id uuid;
-- Questions préparées (ordre et réponses mélangées identiques pour les deux joueurs).
ALTER TABLE challenges ADD COLUMN questions jsonb;
-- Réponses de l'invitant : [{ choice, responseMs }] dans l'ordre des questions.
ALTER TABLE challenges ADD COLUMN from_answers jsonb;
ALTER TABLE challenges ADD COLUMN from_score int;
ALTER TABLE challenges ADD COLUMN to_score int;
ALTER TABLE challenges ADD COLUMN completed_at timestamptz;
