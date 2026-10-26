-- Up Migration
-- Avis 👍 / 👎 sur les réponses des assistants (ADR 0029, point 2) : ni utilisateur ni contenu, seulement le
-- rôle, le sens et l'origine (modèle ou démonstration). Purgés après 13 mois.
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
