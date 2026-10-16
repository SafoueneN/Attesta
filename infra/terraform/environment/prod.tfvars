# Prod : base régionale (haute disponibilité), une instance toujours prête.
environment   = "prod"
db_tier       = "db-custom-1-3840"
min_instances = 1
max_instances = 10
# db-custom-1-3840 : environ 100 connexions ; 10 × 5 = 50, plus le job de migration.
pg_pool_max = 5
# À compléter : project_id, workload_identity_pool, github_repository, bootstrap_image,
# alert_email, app_base_url, mail_from, tei_image (docs/runbook.md, « Mise en place »).
