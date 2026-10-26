-- Up Migration
-- Comptes par identifiant et mot de passe (docs/adr/0030) : l'adresse e-mail devient facultative. Elle
-- reste pour les anciens comptes ouverts par lien de connexion ; les nouveaux comptes n'en ont pas.

ALTER TABLE app_user
  ADD COLUMN username text CHECK (username = lower(username) AND username ~ '^[a-z0-9][a-z0-9._-]{2,29}$'),
  -- Empreinte scrypt (« scrypt$N$r$p$sel$empreinte »), jamais le mot de passe.
  ADD COLUMN password_hash text,
  ALTER COLUMN email DROP NOT NULL,
  ALTER COLUMN email_verified_at DROP NOT NULL,
  ADD CONSTRAINT app_user_identifiant CHECK (email IS NOT NULL OR username IS NOT NULL),
  ADD CONSTRAINT app_user_mot_de_passe CHECK (username IS NULL OR password_hash IS NOT NULL);
CREATE UNIQUE INDEX app_user_username_idx ON app_user (username);

-- Down Migration
DROP INDEX app_user_username_idx;
DELETE FROM app_user WHERE email IS NULL;
ALTER TABLE app_user
  DROP CONSTRAINT app_user_mot_de_passe,
  DROP CONSTRAINT app_user_identifiant,
  ALTER COLUMN email_verified_at SET NOT NULL,
  ALTER COLUMN email SET NOT NULL,
  DROP COLUMN password_hash,
  DROP COLUMN username;
