-- Up Migration
-- Offres en anglais (Canada, sites d'employeurs ; docs/adr/0033) : indexation lexicale « english » au lieu
-- de « simple », pour que « developers » trouve « developer ». La colonne générée est recalculée.
DROP INDEX IF EXISTS job_posting_tsv_idx;
ALTER TABLE job_posting DROP COLUMN tsv;
ALTER TABLE job_posting ADD COLUMN tsv tsvector GENERATED ALWAYS AS (
  to_tsvector(
    CASE lang
      WHEN 'de' THEN 'german'::regconfig
      WHEN 'fr' THEN 'french'::regconfig
      WHEN 'en' THEN 'english'::regconfig
      ELSE 'simple'::regconfig
    END,
    title || ' ' || body
  )
) STORED;
CREATE INDEX job_posting_tsv_idx ON job_posting USING gin (tsv);

-- Down Migration
DROP INDEX IF EXISTS job_posting_tsv_idx;
ALTER TABLE job_posting DROP COLUMN tsv;
ALTER TABLE job_posting ADD COLUMN tsv tsvector GENERATED ALWAYS AS (
  to_tsvector(
    CASE lang WHEN 'de' THEN 'german'::regconfig WHEN 'fr' THEN 'french'::regconfig ELSE 'simple'::regconfig END,
    title || ' ' || body
  )
) STORED;
CREATE INDEX job_posting_tsv_idx ON job_posting USING gin (tsv);
