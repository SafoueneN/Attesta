# Un environnement Attesta (préprod ou prod) : base, secrets, service Cloud Run,
# job de migration, surveillance. Une configuration d'état par environnement :
#   terraform init -backend-config=bucket=<etat> -backend-config=prefix=preprod
#   terraform apply -var-file=preprod.tfvars

terraform {
  required_version = ">= 1.9"
  required_providers {
    google = { source = "hashicorp/google", version = "~> 6.0" }
    random = { source = "hashicorp/random", version = "~> 3.6" }
  }
  backend "gcs" {}
}

provider "google" {
  project = var.project_id
  region  = var.region
}

locals {
  name    = "attesta-${var.environment}"
  is_prod = var.environment == "prod"
}

# --- Identité d'exécution : accès à Vertex AI, à la base et aux secrets, sans clé.

resource "google_service_account" "runtime" {
  account_id   = "${local.name}-run"
  display_name = "Attesta ${var.environment} : exécution"
}

resource "google_project_iam_member" "runtime" {
  for_each = toset([
    "roles/aiplatform.user",
    "roles/cloudsql.client",
    "roles/logging.logWriter",
    "roles/monitoring.metricWriter",
  ])
  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.runtime.email}"
}

# Le compte de déploiement doit pouvoir lancer des révisions sous cette identité.
resource "google_service_account_iam_member" "deployer_acts_as_runtime" {
  service_account_id = google_service_account.runtime.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${var.deployer_service_account}"
}

# --- Base PostgreSQL 16 (pgvector disponible par CREATE EXTENSION), sauvegardes et PITR.

resource "google_sql_database_instance" "main" {
  name                = local.name
  database_version    = "POSTGRES_16"
  region              = var.region
  deletion_protection = local.is_prod

  settings {
    tier              = var.db_tier
    edition           = "ENTERPRISE"
    availability_type = local.is_prod ? "REGIONAL" : "ZONAL"
    disk_autoresize   = true

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true
      start_time                     = "02:00"
      location                       = var.region
      transaction_log_retention_days = 7
      backup_retention_settings {
        retained_backups = local.is_prod ? 30 : 7
      }
    }

    # Traçabilité des accès à la base (journal d'audit Cloud SQL).
    database_flags {
      name  = "log_connections"
      value = "on"
    }
    database_flags {
      name  = "log_disconnections"
      value = "on"
    }

    # IP publique sans aucun réseau autorisé : aucune connexion directe possible,
    # seulement par le connecteur Cloud SQL (authentifié par IAM, chiffré). Une IP
    # privée (VPC, accès privé aux services) est l'évolution prévue si l'audit l'exige.
    ip_configuration {
      ipv4_enabled = true
      ssl_mode     = "ENCRYPTED_ONLY"
    }

    maintenance_window {
      day  = 7
      hour = 3
    }

    insights_config {
      query_insights_enabled  = true
      record_application_tags = false
      record_client_address   = false
    }
  }
}

resource "google_sql_database" "attesta" {
  name     = "attesta"
  instance = google_sql_database_instance.main.name
}

resource "random_password" "db" {
  length  = 32
  special = false
}

resource "google_sql_user" "attesta" {
  name     = "attesta"
  instance = google_sql_database_instance.main.name
  password = random_password.db.result
}

# --- Secrets (répliqués à Paris uniquement). L'état Terraform les contient : son
# bucket doit être privé, chiffré et versionné (docs/runbook.md).

resource "random_password" "session" {
  length  = 48
  special = false
}

locals {
  secrets = {
    "session-secret" = random_password.session.result
    "database-url"   = "postgresql://attesta:${random_password.db.result}@/attesta?host=/cloudsql/${google_sql_database_instance.main.connection_name}"
  }
}

resource "google_secret_manager_secret" "app" {
  for_each  = local.secrets
  secret_id = "${local.name}-${each.key}"
  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }
}

resource "google_secret_manager_secret_version" "app" {
  for_each    = local.secrets
  secret      = google_secret_manager_secret.app[each.key].id
  secret_data = each.value
}

resource "google_secret_manager_secret_iam_member" "runtime" {
  for_each  = local.secrets
  secret_id = google_secret_manager_secret.app[each.key].id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime.email}"
}

# --- Service Cloud Run. L'image et le trafic sont ensuite gérés par
# infra/deploy/deploy.sh (révisions, paliers, retour arrière), pas par Terraform.

locals {
  env = {
    NODE_ENV                = "production"
    SESSION_STORE           = "postgres"
    TRUST_PROXY             = "1"
    LOG_LEVEL               = "info"
    LLM_PROVIDER            = "vertex"
    LLM_MODEL               = var.llm_model
    VERTEX_PROJECT_ID       = var.project_id
    VERTEX_REGION           = "eu"
    LLM_MAX_COST_USD_PER_CV = tostring(var.llm_max_cost_usd_per_cv)
    LLM_DAILY_QUOTA         = tostring(var.llm_daily_quota)
    PDF_CHROMIUM_NO_SANDBOX = tostring(var.chromium_no_sandbox)
  }
}

resource "google_cloud_run_v2_service" "web" {
  name                = local.name
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = local.is_prod

  template {
    service_account                  = google_service_account.runtime.email
    execution_environment            = "EXECUTION_ENVIRONMENT_GEN2"
    timeout                          = "900s" # génération IA longue (SSE)
    max_instance_request_concurrency = 20

    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [google_sql_database_instance.main.connection_name]
      }
    }

    containers {
      image = var.bootstrap_image

      resources {
        limits            = { cpu = "2", memory = "2Gi" }
        startup_cpu_boost = true
      }

      ports {
        container_port = 3000
      }

      dynamic "env" {
        for_each = local.env
        content {
          name  = env.key
          value = env.value
        }
      }
      env {
        name = "SESSION_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.app["session-secret"].secret_id
            version = "latest"
          }
        }
      }
      env {
        name = "DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.app["database-url"].secret_id
            version = "latest"
          }
        }
      }

      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }

      startup_probe {
        http_get {
          path = "/health"
        }
        period_seconds    = 5
        failure_threshold = 12
      }
      liveness_probe {
        http_get {
          path = "/health"
        }
        period_seconds = 30
      }
    }
  }

  lifecycle {
    ignore_changes = [
      client,
      client_version,
      template[0].containers[0].image,
      template[0].revision,
      traffic,
    ]
  }

  depends_on = [google_secret_manager_secret_iam_member.runtime, google_project_iam_member.runtime]
}

resource "google_cloud_run_v2_service_iam_member" "public" {
  name     = google_cloud_run_v2_service.web.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# --- Migrations : job Cloud Run, même image, exécuté par deploy.sh avant chaque révision.

resource "google_cloud_run_v2_job" "migrate" {
  name                = "${local.name}-migrate"
  location            = var.region
  deletion_protection = local.is_prod

  template {
    template {
      service_account = google_service_account.runtime.email
      max_retries     = 0

      volumes {
        name = "cloudsql"
        cloud_sql_instance {
          instances = [google_sql_database_instance.main.connection_name]
        }
      }

      containers {
        image   = var.bootstrap_image
        command = ["node", "node_modules/node-pg-migrate/bin/node-pg-migrate.js", "up", "--migrations-dir", "db/migrations", "--migration-file-language", "sql"]
        env {
          name = "DATABASE_URL"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.app["database-url"].secret_id
              version = "latest"
            }
          }
        }
        volume_mounts {
          name       = "cloudsql"
          mount_path = "/cloudsql"
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [client, client_version, template[0].template[0].containers[0].image]
  }
}

resource "google_cloud_run_v2_job_iam_member" "deployer_runs_migrations" {
  name     = google_cloud_run_v2_job.migrate.name
  location = var.region
  role     = "roles/run.developer"
  member   = "serviceAccount:${var.deployer_service_account}"
}
