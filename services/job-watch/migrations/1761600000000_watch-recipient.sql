-- Up Migration
-- Adresse de réception de la veille choisie par le candidat (ADR 0026, point 12). NULL : adresse du compte,
-- lue auprès d'auth au moment de l'envoi. Toute adresse saisie est confirmée par double opt-in.
ALTER TABLE watch_subscription
  ADD COLUMN recipient_email text CHECK (char_length(recipient_email) <= 254);

-- Down Migration
ALTER TABLE watch_subscription DROP COLUMN recipient_email;
