-- Up Migration
-- Rappels par courriel (ADR 0029, point 5) : étape du plan de progression ou relance d'une candidature,
-- envoyés à l'adresse du compte le jour dit. Au plus 20 rappels en attente par compte (contrôlé par le code).

CREATE TABLE reminder (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('progression', 'relance')),
  send_on date NOT NULL,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  detail text NOT NULL DEFAULT '' CHECK (length(detail) <= 1000),
  link text CHECK (link IS NULL OR link ~ '^/'),
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
CREATE INDEX reminder_due_idx ON reminder (send_on) WHERE sent_at IS NULL;
CREATE INDEX reminder_user_idx ON reminder (user_id, send_on);

-- Down Migration
DROP TABLE reminder;
