-- Up Migration
-- Base attesta_jobs (docs/adr/0013) : offres saisies par les candidats et leur analyse, offres
-- collectées (BA, Adzuna), vecteurs (pgvector, extension créée par db-init), cache ESCO, journal
-- d'ingestion, consommation du LLM.

-- Offre collée par un candidat (ou reprise d'une offre collectée), analysée une fois.
-- `user_id` vient d'auth (UUID, ou guest_<uuid>), sans clé étrangère (docs/adr/0019).
CREATE TABLE user_offer (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL CHECK (length(user_id) BETWEEN 1 AND 80),
  raw_text text NOT NULL CHECK (length(raw_text) BETWEEN 50 AND 20000),
  source_url text,
  posting_id uuid,
  analysis jsonb NOT NULL,
  provider_kind text NOT NULL CHECK (provider_kind IN ('ia', 'demo')),
  prompt_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX user_offer_user_idx ON user_offer (user_id, created_at DESC);

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

-- Métiers voisins (ESCO) : réponses de l'API publique, rafraîchies après 30 jours.
CREATE TABLE esco_cache (
  query text PRIMARY KEY,
  result jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE llm_usage (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  step text NOT NULL,
  model text NOT NULL,
  input_tokens integer NOT NULL,
  output_tokens integer NOT NULL,
  cost_usd numeric(10, 6) NOT NULL,
  latency_ms integer NOT NULL
);
CREATE INDEX llm_usage_at_idx ON llm_usage (at);

-- Down Migration
DROP TABLE llm_usage;
DROP TABLE esco_cache;
DROP TABLE job_embedding;
DROP TABLE job_posting;
DROP TABLE job_source_run;
DROP TABLE user_offer;
