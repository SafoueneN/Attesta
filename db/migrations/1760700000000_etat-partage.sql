-- Up Migration
-- État partagé entre instances (docs/adr/0009). Aucune donnée personnelle :
-- les sujets et les clés sont des empreintes (HMAC), jamais des identifiants bruts.

-- Verrou et quota d'appels à l'IA par session.
CREATE TABLE ia_quota (
  subject text PRIMARY KEY,
  day date NOT NULL,
  count integer NOT NULL CHECK (count >= 0),
  running_until timestamptz
);
CREATE INDEX ia_quota_day_idx ON ia_quota (day);

-- Limiteur de requêtes par IP, par fenêtre fixe.
CREATE TABLE rate_limit (
  key text PRIMARY KEY,
  hits integer NOT NULL CHECK (hits >= 0),
  reset_at timestamptz NOT NULL
);
CREATE INDEX rate_limit_reset_idx ON rate_limit (reset_at);

-- Usage et coût des appels LLM : ni contenu, ni session. Conservation 13 mois.
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
DROP TABLE rate_limit;
DROP TABLE ia_quota;
