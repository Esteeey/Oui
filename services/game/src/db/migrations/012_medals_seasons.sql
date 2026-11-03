-- Médailles gagnées (y compris les podiums de saison « season:AAAA-MM », avec leur rang).
CREATE TABLE user_medals (
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  medal_id text NOT NULL,
  earned_at timestamptz NOT NULL DEFAULT now(),
  season_rank integer CHECK (season_rank > 0),
  PRIMARY KEY (user_id, medal_id)
);

-- Saisons déjà clôturées : leurs podiums ne sont attribués qu'une fois.
CREATE TABLE seasons_closed (
  season_id text PRIMARY KEY,
  closed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX duel_results_created ON duel_results (created_at);
