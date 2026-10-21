-- Up Migration
-- Base attesta_cvgen (docs/adr/0013) : générations de CV ciblés avec leur rapport de fidélité et leur
-- trace, quota quotidien d'appels à l'IA, consommation du LLM.

-- Une génération garde l'instantané du profil et de l'offre utilisés : les pointeurs du CV désignent ces
-- faits-là, même si le candidat modifie ensuite son profil. `user_id` vient d'auth, sans clé étrangère.
CREATE TABLE generation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL CHECK (length(user_id) BETWEEN 1 AND 80),
  offer_id uuid NOT NULL,
  offer_title text NOT NULL,
  offer_text text NOT NULL,
  analysis jsonb,
  profile_version integer,
  profile jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('ok', 'degraded')),
  degraded_reason text,
  cv jsonb,
  report jsonb,
  -- Trace ligne par ligne : lignes écartées par le contrôle, avec leurs raisons (cv_line_trace, ADR 0013).
  removed jsonb NOT NULL DEFAULT '[]',
  edited jsonb NOT NULL DEFAULT '[]',
  revision integer NOT NULL DEFAULT 0,
  provider_kind text NOT NULL CHECK (provider_kind IN ('ia', 'demo')),
  model text NOT NULL,
  pipeline_version text NOT NULL,
  cost_usd numeric(10, 6) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX generation_user_idx ON generation (user_id, created_at DESC);

-- Verrou et quota d'appels à l'IA par utilisateur : le sujet est une empreinte (HMAC), jamais l'identifiant.
CREATE TABLE ia_quota (
  subject text PRIMARY KEY,
  day date NOT NULL,
  count integer NOT NULL CHECK (count >= 0),
  running_until timestamptz,
  token text
);
CREATE INDEX ia_quota_day_idx ON ia_quota (day);

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
DROP TABLE ia_quota;
DROP TABLE generation;
