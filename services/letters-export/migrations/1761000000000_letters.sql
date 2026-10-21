-- Up Migration
-- Base attesta_letters (docs/adr/0013) : lettres de motivation et consommation du LLM. Aucun PDF n'est
-- stocké (docs/adr/0018, point 4) : il est produit à la demande et transmis.

CREATE TABLE cover_letter (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL CHECK (length(user_id) BETWEEN 1 AND 80),
  generation_id uuid NOT NULL,
  offer_title text NOT NULL,
  company text,
  tone text NOT NULL CHECK (tone IN ('sobre', 'chaleureux', 'dynamique')),
  greeting text NOT NULL,
  closing text NOT NULL,
  -- [{ text, sources, status, issues }] : chaque paragraphe cite ses faits et garde son contrôle.
  paragraphs jsonb NOT NULL,
  removed integer NOT NULL DEFAULT 0,
  provider_kind text NOT NULL CHECK (provider_kind IN ('ia', 'demo')),
  prompt_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cover_letter_user_idx ON cover_letter (user_id, created_at DESC);

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
DROP TABLE cover_letter;
