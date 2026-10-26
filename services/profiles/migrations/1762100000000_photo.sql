-- Up Migration
-- Photo du CV (docs/adr/0036) : une par compte, à part du profil (ni dans les versions, ni dans les CV générés,
-- jamais envoyée à l'IA). Contenu chiffré (AES-256-GCM) comme les pièces justificatives.
CREATE TABLE profile_photo (
  user_id text PRIMARY KEY CHECK (char_length(user_id) BETWEEN 1 AND 80),
  mime_type text NOT NULL CHECK (mime_type IN ('image/png', 'image/jpeg')),
  size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 2097152),
  iv bytea NOT NULL,
  tag bytea NOT NULL,
  content bytea NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Down Migration
DROP TABLE profile_photo;
