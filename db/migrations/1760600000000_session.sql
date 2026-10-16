-- Up Migration
-- Sessions anonymes (connect-pg-simple). Expiration : 2 h glissantes, purge toutes
-- les 15 min par l'application ; plafond absolu de 24 h appliqué côté serveur.
CREATE TABLE session (
  sid varchar NOT NULL COLLATE "default" PRIMARY KEY,
  sess json NOT NULL,
  expire timestamp(6) NOT NULL
);
CREATE INDEX session_expire_idx ON session (expire);

-- Down Migration
DROP TABLE session;
