-- Up Migration
-- Pièces justificatives jointes au profil (ADR 0027). Contenu chiffré (AES-256-GCM) par le service : la base
-- ne voit jamais un fichier en clair. `target` vise un élément du profil, `anchor` garde son libellé au dépôt.
CREATE TABLE profile_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL CHECK (char_length(user_id) BETWEEN 1 AND 80),
  target text NOT NULL CHECK (target ~ '^/(work|education|certificates|languages)/[0-9]{1,2}$'),
  kind text NOT NULL CHECK (kind IN ('diplome', 'attestation_employeur', 'certificat', 'recommandation', 'autre')),
  label text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 120),
  file_name text NOT NULL,
  mime_type text NOT NULL CHECK (mime_type IN ('application/pdf', 'image/png', 'image/jpeg')),
  size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 5242880),
  anchor text NOT NULL,
  iv bytea NOT NULL,
  tag bytea NOT NULL,
  content bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX profile_evidence_user_idx ON profile_evidence (user_id);

-- Down Migration
DROP TABLE profile_evidence;
