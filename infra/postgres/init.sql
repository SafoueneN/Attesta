-- Initialisation idempotente des bases et des rôles, une paire par service (docs/adr/0013).
-- Exécuté à chaque `docker compose up` par le service `db-init`, avec le superutilisateur :
--   psql -v suffixe=-dev-uniquement -f infra/postgres/init.sql
-- Le mot de passe de chaque rôle vaut <rôle><suffixe>. Ce mécanisme ne sert qu'au poste local et à la CI :
-- hors poste local, rôles et mots de passe sont gérés par l'hébergeur (aucun secret dans le dépôt).

\set ON_ERROR_STOP on

CREATE TEMP TABLE attesta_base (nom text PRIMARY KEY);
INSERT INTO attesta_base (nom) VALUES
  ('attesta_auth'),
  ('attesta_profiles'),
  ('attesta_cvgen'),
  ('attesta_jobs'),
  ('attesta_watch'),
  ('attesta_letters'),
  ('attesta_web');

-- 1. Rôles applicatifs : connexion seulement, aucun privilège d'administration.
SELECT format('CREATE ROLE %I LOGIN', nom)
FROM attesta_base
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = nom)
\gexec

SELECT format(
  'ALTER ROLE %I WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 20 PASSWORD %L',
  nom, nom || :'suffixe')
FROM attesta_base
\gexec

-- 2. Une base par service, dont le rôle du même nom est propriétaire.
SELECT format('CREATE DATABASE %I OWNER %I ENCODING ''UTF8'' TEMPLATE template0', nom, nom)
FROM attesta_base
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = nom)
\gexec

-- 3. Cloisonnement : personne d'autre que le propriétaire (et l'administrateur) ne s'y connecte.
--    Les bases `postgres` et `attesta` (monolithe, en cours de retrait) sont fermées aux rôles de service.
SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC', nom) FROM attesta_base
\gexec
SELECT format('GRANT CONNECT, TEMPORARY ON DATABASE %I TO %I', nom, nom) FROM attesta_base
\gexec
REVOKE CONNECT ON DATABASE postgres FROM PUBLIC;
SELECT 'REVOKE CONNECT ON DATABASE attesta FROM PUBLIC'
WHERE EXISTS (SELECT 1 FROM pg_database WHERE datname = 'attesta')
\gexec

-- 4. pgvector : seule la base des offres en a besoin (vecteurs BGE-M3, index HNSW).
\connect attesta_jobs
SET client_min_messages = warning;
CREATE EXTENSION IF NOT EXISTS vector;
