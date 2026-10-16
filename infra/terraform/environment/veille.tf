# Veille emploi (docs/adr/0010) : envoi d'e-mails, vecteurs BGE-M3 (TEI privé),
# exécution quotidienne (Cloud Run Job planifié par Cloud Scheduler).

variable "app_base_url" {
  description = "Adresse publique de l'application (liens des e-mails), en https://."
  type        = string
}

variable "mail_from" {
  description = "Expéditeur, sur un domaine authentifié par SPF, DKIM et DMARC (docs/runbook.md)."
  type        = string
}

variable "tei_image" {
  description = "Image TEI CPU recopiée dans Artifact Registry (Cloud Run ne tire pas depuis ghcr.io)."
  type        = string
}

variable "watch_schedule" {
  description = "Heure d'exécution de la veille (cron, fuseau Europe/Paris)."
  type        = string
  default     = "0 7 * * *"
}

# --- Secrets de l'envoi. L'URL SMTP (clé Brevo) est saisie à la main, jamais dans
# Terraform ni dans le dépôt :
#   printf 'smtp://<login>:<clé>@smtp-relay.brevo.com:587' | gcloud secrets versions add attesta-<env>-smtp-url --data-file=-
# Le jeton du webhook Brevo est généré ici, puis déclaré dans Brevo (docs/runbook.md).

resource "google_secret_manager_secret" "smtp_url" {
  secret_id = "${local.name}-smtp-url"
  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }
}

resource "random_password" "brevo_webhook" {
  length  = 48
  special = false
}

resource "google_secret_manager_secret" "brevo_webhook" {
  secret_id = "${local.name}-brevo-webhook-token"
  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }
}

resource "google_secret_manager_secret_version" "brevo_webhook" {
  secret      = google_secret_manager_secret.brevo_webhook.id
  secret_data = random_password.brevo_webhook.result
}

resource "google_secret_manager_secret_iam_member" "runtime_mail" {
  for_each = {
    smtp    = google_secret_manager_secret.smtp_url.id
    webhook = google_secret_manager_secret.brevo_webhook.id
  }
  secret_id = each.value
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime.email}"
}

# --- Identité propre au job de veille : base, Vertex, SMTP et TEI seulement. Le
# service web n'a pas accès à TEI ; le job n'a ni le secret de session ni celui du webhook.

resource "google_service_account" "veille" {
  account_id   = "${local.name}-veille"
  display_name = "Attesta ${var.environment} : veille quotidienne"
}

resource "google_project_iam_member" "veille" {
  for_each = toset([
    "roles/aiplatform.user",
    "roles/cloudsql.client",
    "roles/logging.logWriter",
    "roles/monitoring.metricWriter",
  ])
  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.veille.email}"
}

resource "google_secret_manager_secret_iam_member" "veille" {
  for_each = {
    database = google_secret_manager_secret.app["database-url"].id
    smtp     = google_secret_manager_secret.smtp_url.id
  }
  secret_id = each.value
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.veille.email}"
}

# deploy.sh met à jour l'image du job : le compte de déploiement agit en son nom.
resource "google_service_account_iam_member" "deployer_acts_as_veille" {
  service_account_id = google_service_account.veille.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.deployer.email}"
}

# --- TEI : service privé (aucun accès public), invoqué par l'identité d'exécution
# avec un jeton d'identité Google. Les poids du modèle (2 Go) sont mis en cache dans
# un bucket à Paris : téléchargés une fois depuis Hugging Face, pas à chaque démarrage.

resource "google_storage_bucket" "tei_models" {
  name                        = "${var.project_id}-${local.name}-tei"
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = !local.is_prod
}

resource "google_service_account" "tei" {
  account_id   = "${local.name}-tei"
  display_name = "Attesta ${var.environment} : TEI (vecteurs)"
}

resource "google_storage_bucket_iam_member" "tei" {
  bucket = google_storage_bucket.tei_models.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.tei.email}"
}

resource "google_cloud_run_v2_service" "tei" {
  name                = "${local.name}-tei"
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = local.is_prod

  template {
    service_account                  = google_service_account.tei.email
    execution_environment            = "EXECUTION_ENVIRONMENT_GEN2"
    timeout                          = "600s"
    max_instance_request_concurrency = 4

    scaling {
      min_instance_count = 0
      max_instance_count = 2
    }

    volumes {
      name = "modeles"
      gcs {
        bucket    = google_storage_bucket.tei_models.name
        read_only = false
      }
    }

    containers {
      image = var.tei_image
      args  = ["--model-id", "BAAI/bge-m3", "--max-client-batch-size", "32", "--huggingface-hub-cache", "/data"]

      resources {
        limits            = { cpu = "4", memory = "8Gi" }
        startup_cpu_boost = true
      }

      ports {
        container_port = 80
      }

      volume_mounts {
        name       = "modeles"
        mount_path = "/data"
      }

      startup_probe {
        http_get {
          path = "/health"
        }
        period_seconds    = 10
        failure_threshold = 60 # premier démarrage : téléchargement du modèle
      }
    }
  }
}

resource "google_cloud_run_v2_service_iam_member" "tei_invoker" {
  name     = google_cloud_run_v2_service.tei.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.veille.email}"
}

# --- Exécution quotidienne : même image que l'application, autre commande. L'image
# est mise à jour par infra/deploy/deploy.sh après chaque déploiement réussi.

resource "google_cloud_run_v2_job" "veille" {
  name                = "${local.name}-veille"
  location            = var.region
  deletion_protection = local.is_prod

  template {
    # Une seule tâche : les budgets de requêtes par source sont tenus en mémoire.
    task_count  = 1
    parallelism = 1
    template {
      service_account = google_service_account.veille.email
      # Les relances sont faites par pg-boss, job par job ; une exécution en échec
      # est rejouée sans risque (un e-mail au plus par abonné et par jour).
      max_retries = 0
      timeout     = "3600s"

      volumes {
        name = "cloudsql"
        cloud_sql_instance {
          instances = [google_sql_database_instance.main.connection_name]
        }
      }

      containers {
        image   = var.bootstrap_image
        command = ["node", "apps/worker/dist/main.js"]

        resources {
          limits = { cpu = "2", memory = "2Gi" }
        }

        dynamic "env" {
          for_each = merge(local.env, local.mail_env, {
            EMBEDDINGS_PROVIDER = "tei"
            TEI_URL             = google_cloud_run_v2_service.tei.uri
            TEI_GOOGLE_ID_TOKEN = "true"
            JOBWATCH_SOURCES    = "ba"
          })
          content {
            name  = env.key
            value = env.value
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
        env {
          name = "SMTP_URL"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.smtp_url.secret_id
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

  depends_on = [google_secret_manager_secret_iam_member.veille, google_project_iam_member.veille]
}

resource "google_cloud_run_v2_job_iam_member" "deployer_updates_veille" {
  name     = google_cloud_run_v2_job.veille.name
  location = var.region
  role     = "roles/run.developer"
  member   = "serviceAccount:${google_service_account.deployer.email}"
}

resource "google_service_account" "scheduler" {
  account_id   = "${local.name}-sched"
  display_name = "Attesta ${var.environment} : planification de la veille"
}

resource "google_cloud_run_v2_job_iam_member" "scheduler" {
  name     = google_cloud_run_v2_job.veille.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.scheduler.email}"
}

resource "google_cloud_scheduler_job" "veille" {
  name      = "${local.name}-veille"
  region    = var.region
  schedule  = var.watch_schedule
  time_zone = "Europe/Paris"

  retry_config {
    retry_count = 1
  }

  http_target {
    http_method = "POST"
    uri         = "https://run.googleapis.com/v2/${google_cloud_run_v2_job.veille.id}:run"
    oauth_token {
      service_account_email = google_service_account.scheduler.email
    }
  }
}

# --- Alertes de la veille : exécution en échec, taux de plaintes au-delà de 0,1 %.

resource "google_monitoring_alert_policy" "veille_erreurs" {
  display_name = "${local.name} : veille en échec"
  combiner     = "OR"
  conditions {
    display_name = "Erreur dans les journaux du job de veille"
    condition_matched_log {
      filter = "resource.type=\"cloud_run_job\" AND resource.labels.job_name=\"${google_cloud_run_v2_job.veille.name}\" AND severity>=ERROR"
    }
  }
  alert_strategy {
    notification_rate_limit {
      period = "3600s"
    }
  }
  documentation {
    content   = "Voir docs/runbook.md, « Veille emploi » : journaux event=ingestion_erreur, veille_terminee (failedJobs), taux_plaintes."
    mime_type = "text/markdown"
  }
  notification_channels = [google_monitoring_notification_channel.email.id]
}

resource "google_monitoring_alert_policy" "plaintes" {
  display_name = "${local.name} : plaintes e-mail"
  combiner     = "OR"
  conditions {
    display_name = "Plainte signalée par le fournisseur d'e-mail"
    condition_matched_log {
      filter = "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${local.name}\" AND jsonPayload.event=\"email_plainte\""
    }
  }
  alert_strategy {
    notification_rate_limit {
      period = "3600s"
    }
  }
  documentation {
    content   = "Chaque plainte arrête la veille de l'abonné. Taux sur 30 jours : journal event=taux_plaintes du job de veille (seuil 0,1 %, plafond Gmail 0,3 %)."
    mime_type = "text/markdown"
  }
  notification_channels = [google_monitoring_notification_channel.email.id]
}

output "veille_job" {
  value = google_cloud_run_v2_job.veille.name
}

output "brevo_webhook_url" {
  description = "Adresse du webhook à déclarer dans Brevo (événements spam, hard_bounce, unsubscribed)."
  value       = "${var.app_base_url}/webhooks/brevo"
}
