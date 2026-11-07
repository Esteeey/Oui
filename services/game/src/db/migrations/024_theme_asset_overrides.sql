CREATE TABLE theme_asset_overrides (
  theme_id text PRIMARY KEY,
  icon_key text,
  cover_key text,
  updated_by uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (icon_key IS NOT NULL OR cover_key IS NOT NULL)
);
