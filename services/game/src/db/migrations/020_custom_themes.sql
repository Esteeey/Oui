CREATE TABLE custom_themes (
  id uuid PRIMARY KEY, category_id text NOT NULL, name text NOT NULL, description text NOT NULL,
  questions jsonb NOT NULL, icon_key text, cover_key text, published boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES users (id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX custom_themes_published_idx ON custom_themes (published, created_at DESC);
