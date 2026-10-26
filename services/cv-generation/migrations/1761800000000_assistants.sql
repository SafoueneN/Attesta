-- Up Migration
-- Assistants du CV (ADR 0029) : résultats conservés par génération, et avis anonymes sur les réponses.

-- Dernier résultat de chaque assistant pour un CV, sous la clé « rôle » ou « rôle:variante » (langue d'une
-- traduction, niveau d'entretien). Effacé avec la génération, donc avec le compte.
CREATE TABLE assistant_result (
  generation_id uuid NOT NULL REFERENCES generation (id) ON DELETE CASCADE,
  key text NOT NULL CHECK (key ~ '^[a-z-]{2,40}(:[a-z0-9-]{1,40})?$'),
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (generation_id, key)
);

-- Avis 👍 / 👎 : ni utilisateur, ni génération, ni contenu ; seulement le rôle, le sens et l'origine.
CREATE TABLE assistant_vote (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  role text NOT NULL CHECK (role ~ '^[a-z-]{2,40}$'),
  vote smallint NOT NULL CHECK (vote IN (-1, 1)),
  provider_kind text NOT NULL CHECK (provider_kind IN ('ia', 'demo')),
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX assistant_vote_at_idx ON assistant_vote (at);

-- Down Migration
DROP TABLE assistant_vote;
DROP TABLE assistant_result;
