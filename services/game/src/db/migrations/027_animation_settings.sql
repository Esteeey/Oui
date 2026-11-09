-- Réglages des animations choisis par un administrateur (une ligne par animation, en JSON).
CREATE TABLE animation_settings (
  id TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
