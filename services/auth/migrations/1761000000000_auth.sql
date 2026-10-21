-- Up Migration
-- Base attesta_auth (docs/adr/0013, 0014, 0019, 0024) : comptes, liens de connexion, refresh tokens,
-- consentements, audit sans donnée personnelle et outbox de la suppression distribuée.

CREATE TABLE app_user (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL CHECK (email = lower(email) AND length(email) <= 254),
  role text NOT NULL DEFAULT 'candidate' CHECK (role IN ('candidate', 'admin')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleting')),
  email_verified_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_active_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX app_user_email_idx ON app_user (email);
CREATE INDEX app_user_last_active_idx ON app_user (last_active_at);

-- Lien de connexion à usage unique : seule l'empreinte du jeton est stockée (15 min).
CREATE TABLE login_token (
  token_hash bytea PRIMARY KEY,
  email text NOT NULL,
  policy_version text NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX login_token_expires_idx ON login_token (expires_at);
CREATE INDEX login_token_email_idx ON login_token (email);

-- Refresh token opaque, haché, tourné à chaque usage. La réutilisation d'un jeton déjà tourné révoque
-- toute sa famille (vol présumé). 7 jours d'inactivité, 30 jours au plus (ADR 0014, point 3).
CREATE TABLE refresh_token (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
  token_hash bytea NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  family_expires_at timestamptz NOT NULL,
  used_at timestamptz,
  revoked_at timestamptz
);
CREATE INDEX refresh_token_family_idx ON refresh_token (family_id);
CREATE INDEX refresh_token_user_idx ON refresh_token (user_id);
CREATE INDEX refresh_token_expires_idx ON refresh_token (family_expires_at);

-- Journal de consentement : chaque accord et chaque retrait, avec la version du texte.
CREATE TABLE consent_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('service', 'veille', 'promo')),
  granted boolean NOT NULL,
  policy_version text NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),
  ip_hash text
);
CREATE INDEX consent_log_user_idx ON consent_log (user_id, purpose, at DESC);

-- Audit (ADR 0019, point 7) : type d'événement et date ; l'identifiant survit à l'effacement du compte,
-- jamais l'adresse. Conservation : 13 mois.
CREATE TABLE audit_event (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  type text NOT NULL,
  user_id uuid,
  detail jsonb
);
CREATE INDEX audit_event_at_idx ON audit_event (at);
CREATE INDEX audit_event_type_idx ON audit_event (type, at);

-- Outbox de la suppression distribuée : une ligne par service détenteur, écrite dans la même transaction
-- que le passage du compte en suppression (ADR 0019, point 2).
CREATE TABLE outbox (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL,
  target text NOT NULL,
  action text NOT NULL CHECK (action IN ('delete')),
  created_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  done_at timestamptz,
  failed_at timestamptz,
  last_error text,
  UNIQUE (user_id, target, action)
);
CREATE INDEX outbox_due_idx ON outbox (next_attempt_at) WHERE done_at IS NULL AND failed_at IS NULL;

-- Down Migration
DROP TABLE outbox;
DROP TABLE audit_event;
DROP TABLE consent_log;
DROP TABLE refresh_token;
DROP TABLE login_token;
DROP TABLE app_user;
