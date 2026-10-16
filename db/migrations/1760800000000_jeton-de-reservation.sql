-- Up Migration
-- Jeton propriétaire du verrou d'IA : seule la requête qui l'a posé peut le lever.
ALTER TABLE ia_quota ADD COLUMN token text;

-- Down Migration
ALTER TABLE ia_quota DROP COLUMN token;
