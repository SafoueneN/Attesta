-- Up Migration
-- Base attesta_watch (docs/adr/0013) : abonnements à la veille, consentements de veille, offres
-- proposées, envois quotidiens, retours du fournisseur d'e-mail et journal des exécutions.
-- `user_id` vient d'auth ; `posting_id` vient de jobs-matching : aucune clé étrangère entre bases.

CREATE TABLE watch_subscription (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  occupations text[] NOT NULL CHECK (cardinality(occupations) BETWEEN 1 AND 5),
  country text NOT NULL CHECK (country IN ('DE', 'FR')),
  city text NOT NULL,
  lat double precision NOT NULL,
  lon double precision NOT NULL,
  radius_km integer NOT NULL CHECK (radius_km BETWEEN 5 AND 200),
  working_time text NOT NULL CHECK (working_time IN ('indifferent', 'plein', 'partiel')),
  status text NOT NULL CHECK (status IN ('en_attente', 'active', 'desabonnee', 'suspendue')),
  confirm_token_hash bytea UNIQUE,
  confirm_expires_at timestamptz,
  confirmed_at timestamptz,
  unsubscribe_token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX watch_subscription_status_idx ON watch_subscription (status);

-- Journal du consentement à la veille (double opt-in, retrait), avec la version de la politique.
CREATE TABLE watch_consent (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL,
  granted boolean NOT NULL,
  reason text NOT NULL,
  policy_version text NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),
  ip_hash text
);
CREATE INDEX watch_consent_user_idx ON watch_consent (user_id, at);

-- Offres retenues pour un abonné, avec l'instantané utile au rapport et au calcul des écarts.
-- Une offre n'est proposée qu'une fois par abonnement.
CREATE TABLE match_result (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  subscription_id uuid NOT NULL REFERENCES watch_subscription (id) ON DELETE CASCADE,
  posting_id uuid NOT NULL,
  run_date date NOT NULL,
  rank integer NOT NULL,
  title text NOT NULL,
  company text,
  city text,
  url text NOT NULL,
  rrf_score double precision NOT NULL,
  similarity double precision,
  coverage double precision,
  location_score double precision,
  rerank_score integer,
  missing_skills jsonb NOT NULL,
  salary_min_eur integer,
  salary_max_eur integer,
  UNIQUE (subscription_id, posting_id)
);
CREATE INDEX match_result_run_idx ON match_result (subscription_id, run_date);

-- Envoi quotidien : au plus un par abonnement et par jour (idempotence des relances). Les rapports PDF
-- ne sont pas conservés : ils sont régénérés à chaque envoi.
CREATE TABLE email_delivery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES watch_subscription (id) ON DELETE CASCADE,
  run_date date NOT NULL,
  offers integer NOT NULL,
  provider_message_id text,
  status text NOT NULL CHECK (status IN ('en_cours', 'envoye', 'plainte', 'rebond')),
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subscription_id, run_date)
);
CREATE INDEX email_delivery_message_idx ON email_delivery (provider_message_id);

-- Retours du fournisseur d'e-mail : taux de plaintes, sans adresse. Conservation 13 mois.
CREATE TABLE email_event (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  event text NOT NULL CHECK (event IN ('plainte', 'rebond', 'desabonnement'))
);
CREATE INDEX email_event_at_idx ON email_event (at);

-- Exécutions de la veille (planifiées ou manuelles), avec leur bilan chiffré, sans donnée personnelle.
CREATE TABLE watch_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_date date NOT NULL,
  trigger text NOT NULL CHECK (trigger IN ('planifiee', 'manuelle')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  summary jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX watch_run_date_idx ON watch_run (run_date DESC);

-- Down Migration
DROP TABLE watch_run;
DROP TABLE email_event;
DROP TABLE email_delivery;
DROP TABLE match_result;
DROP TABLE watch_consent;
DROP TABLE watch_subscription;
