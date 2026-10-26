-- Up Migration
-- CV en ligne partageable (docs/adr/0042) : instantané HTML du CV au moment du partage, servi par un lien
-- secret, non indexé, révocable. Seule l'empreinte du jeton est stockée ; compteur de consultations.
CREATE TABLE cv_share (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL CHECK (char_length(user_id) BETWEEN 1 AND 80),
  token_hash bytea NOT NULL UNIQUE,
  generation_id uuid,
  offer_title text NOT NULL,
  html text NOT NULL,
  views integer NOT NULL DEFAULT 0,
  last_viewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX cv_share_user_idx ON cv_share (user_id);

-- Down Migration
DROP TABLE cv_share;
