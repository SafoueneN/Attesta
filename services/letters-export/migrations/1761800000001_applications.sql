-- Up Migration
-- Rédactrice de candidature (ADR 0029, point 1) : historique des textes et suivi des candidatures, pour les
-- comptes seulement. `generation_id` vient de cv-generation, sans clé étrangère entre bases.

CREATE TABLE application_text (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL CHECK (length(user_id) BETWEEN 1 AND 80),
  generation_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('formulaire', 'linkedin', 'relance', 'remerciement')),
  question text,
  text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX application_text_user_idx ON application_text (user_id, generation_id, created_at DESC);

-- Où en est la candidature à une offre : une ligne par CV ciblé.
CREATE TABLE application_tracking (
  user_id text NOT NULL CHECK (length(user_id) BETWEEN 1 AND 80),
  generation_id uuid NOT NULL,
  offer_title text NOT NULL,
  status text NOT NULL CHECK (status IN ('a_envoyer', 'envoyee', 'relancee', 'entretien', 'refus', 'offre')),
  sent_at date,
  note text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, generation_id)
);

-- Down Migration
DROP TABLE application_tracking;
DROP TABLE application_text;
