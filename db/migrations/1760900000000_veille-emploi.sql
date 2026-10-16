-- Up Migration
-- Comptes, consentements et veille emploi (docs/adr/0010). Aucune conservation par
-- défaut : seuls les titulaires d'un compte ont des données durables, effacées à
-- la demande (ON DELETE CASCADE) ou après 18 mois d'inactivité.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE app_user (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL CHECK (email = lower(email) AND length(email) <= 254),
  email_verified_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_active_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX app_user_email_idx ON app_user (email);
CREATE INDEX app_user_last_active_idx ON app_user (last_active_at);

-- Lien de connexion à usage unique : seule l'empreinte du jeton est stockée.
CREATE TABLE login_token (
  token_hash bytea PRIMARY KEY,
  email text NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX login_token_expires_idx ON login_token (expires_at);

-- Journal de consentement : chaque accord et chaque retrait, avec la version du texte.
CREATE TABLE consent_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('service', 'veille', 'promo')),
  granted boolean NOT NULL,
  policy_version text NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),
  ip_hash text
);
CREATE INDEX consent_log_user_idx ON consent_log (user_id, purpose, at DESC);

-- Profil versionné (contrat Zod `Profile`) : une version par enregistrement.
CREATE TABLE profile_version (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  data jsonb NOT NULL,
  schema_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, version)
);

-- Un abonnement par compte. Le jeton de désabonnement figure dans chaque e-mail ;
-- celui de confirmation (double opt-in) n'est stocké que sous forme d'empreinte.
CREATE TABLE watch_subscription (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES app_user (id) ON DELETE CASCADE,
  profile_version_id uuid NOT NULL REFERENCES profile_version (id),
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

-- Journal d'ingestion, par source et par exécution.
CREATE TABLE job_source_run (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source text NOT NULL,
  run_date date NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  requests integer NOT NULL DEFAULT 0,
  fetched integer NOT NULL DEFAULT 0,
  inserted integer NOT NULL DEFAULT 0,
  duplicates integer NOT NULL DEFAULT 0,
  errors integer NOT NULL DEFAULT 0
);
CREATE INDEX job_source_run_idx ON job_source_run (source, run_date);

-- Offres normalisées. Conservation : 60 jours après la publication.
CREATE TABLE job_posting (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  external_id text NOT NULL,
  title text NOT NULL,
  company text,
  city text,
  country text NOT NULL,
  lat double precision,
  lon double precision,
  lang text NOT NULL,
  working_time text CHECK (working_time IN ('plein', 'partiel')),
  posted_at date NOT NULL,
  url text NOT NULL,
  body text NOT NULL,
  -- Salaire annuel brut en euros, seulement s'il est publié tel quel (jamais estimé).
  salary_min_eur integer,
  salary_max_eur integer,
  fingerprint bytea NOT NULL UNIQUE,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  tsv tsvector GENERATED ALWAYS AS (
    to_tsvector(
      CASE lang WHEN 'de' THEN 'german'::regconfig WHEN 'fr' THEN 'french'::regconfig ELSE 'simple'::regconfig END,
      title || ' ' || body
    )
  ) STORED,
  UNIQUE (source, external_id)
);
CREATE INDEX job_posting_tsv_idx ON job_posting USING gin (tsv);
CREATE INDEX job_posting_filter_idx ON job_posting (country, posted_at);

CREATE TABLE job_embedding (
  posting_id uuid PRIMARY KEY REFERENCES job_posting (id) ON DELETE CASCADE,
  embedding vector(1024) NOT NULL,
  model text NOT NULL
);
CREATE INDEX job_embedding_hnsw_idx ON job_embedding
  USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

-- Offres retenues pour un abonné. Une offre n'est envoyée qu'une fois par abonnement.
CREATE TABLE match_result (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  subscription_id uuid NOT NULL REFERENCES watch_subscription (id) ON DELETE CASCADE,
  posting_id uuid NOT NULL REFERENCES job_posting (id) ON DELETE CASCADE,
  run_date date NOT NULL,
  rank integer NOT NULL,
  rrf_score double precision NOT NULL,
  similarity double precision,
  coverage double precision,
  location_score double precision,
  rerank_score integer,
  missing_skills jsonb NOT NULL,
  UNIQUE (subscription_id, posting_id)
);
CREATE INDEX match_result_run_idx ON match_result (subscription_id, run_date);

-- Envoi quotidien : au plus un par abonnement et par jour (idempotence des relances).
-- Les rapports PDF ne sont pas conservés : ils sont régénérés à chaque envoi.
CREATE TABLE email_delivery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES watch_subscription (id) ON DELETE CASCADE,
  run_date date NOT NULL,
  offers integer NOT NULL,
  provider_message_id text,
  -- en_cours : réservé avant l'envoi ; un envoi interrompu n'est jamais refait (au plus une fois).
  status text NOT NULL CHECK (status IN ('en_cours', 'envoye', 'plainte', 'rebond')),
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subscription_id, run_date)
);
CREATE INDEX email_delivery_message_idx ON email_delivery (provider_message_id);

-- Retours du fournisseur d'e-mail (plaintes, rebonds) : taux de plaintes, sans adresse.
CREATE TABLE email_event (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  event text NOT NULL CHECK (event IN ('plainte', 'rebond', 'desabonnement'))
);
CREATE INDEX email_event_at_idx ON email_event (at);

-- Métiers voisins (ESCO) : réponses de l'API publique, rafraîchies après 30 jours.
CREATE TABLE esco_cache (
  query text PRIMARY KEY,
  result jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);

-- Down Migration
DROP TABLE esco_cache;
DROP TABLE email_event;
DROP TABLE email_delivery;
DROP TABLE match_result;
DROP TABLE job_embedding;
DROP TABLE job_posting;
DROP TABLE job_source_run;
DROP TABLE watch_subscription;
DROP TABLE profile_version;
DROP TABLE consent_log;
DROP TABLE login_token;
DROP TABLE app_user;
