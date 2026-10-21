-- Up Migration
-- Base attesta_profiles (docs/adr/0013) : profil candidat versionné, consommation du LLM (import).
-- `user_id` est attribué par auth (UUID, ou guest_<uuid> pour le parcours sans compte), sans clé
-- étrangère vers une autre base : la cohérence vient de la suppression distribuée (docs/adr/0019).

CREATE TABLE profile_version (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL CHECK (length(user_id) BETWEEN 1 AND 80),
  version integer NOT NULL CHECK (version > 0),
  data jsonb NOT NULL,
  schema_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, version)
);
-- Purge des profils d'invité après 24 h.
CREATE INDEX profile_version_guest_idx ON profile_version (created_at) WHERE user_id LIKE 'guest\_%';

-- Usage et coût des appels LLM : ni contenu, ni utilisateur. Conservation 13 mois.
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
DROP TABLE profile_version;
