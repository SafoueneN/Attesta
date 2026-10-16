# Préprod : petite base zonale, aucune instance au repos.
environment   = "preprod"
db_tier       = "db-f1-micro"
min_instances = 0
max_instances = 3
# db-f1-micro : environ 25 connexions ; 3 × 5 = 15, plus le job de migration.
pg_pool_max = 5
# À compléter : project_id, workload_identity_pool, github_repository, bootstrap_image,
# alert_email, app_base_url, mail_from, tei_image (docs/runbook.md, « Mise en place »).
