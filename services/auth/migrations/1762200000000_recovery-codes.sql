-- Up Migration
-- Codes de récupération (docs/adr/0039) : un compte par identifiant n'a pas d'e-mail ; 8 codes à usage
-- unique, remis une seule fois, permettent de choisir un nouveau mot de passe. Seule l'empreinte est stockée.
CREATE TABLE recovery_code (
  user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
  code_hash bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz,
  PRIMARY KEY (user_id, code_hash)
);

-- Down Migration
DROP TABLE recovery_code;
