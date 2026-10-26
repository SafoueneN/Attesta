-- Up Migration
-- Pays de la veille (docs/adr/0033) : Canada et Tunisie en plus de l'Allemagne et de la France.
ALTER TABLE watch_subscription DROP CONSTRAINT IF EXISTS watch_subscription_country_check;
ALTER TABLE watch_subscription
  ADD CONSTRAINT watch_subscription_country_check CHECK (country IN ('DE', 'FR', 'CA', 'TN'));

-- Down Migration
DELETE FROM watch_subscription WHERE country IN ('CA', 'TN');
ALTER TABLE watch_subscription DROP CONSTRAINT IF EXISTS watch_subscription_country_check;
ALTER TABLE watch_subscription
  ADD CONSTRAINT watch_subscription_country_check CHECK (country IN ('DE', 'FR'));
