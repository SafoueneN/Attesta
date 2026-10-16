# Ressources communes aux environnements : APIs, registre d'images, identité de
# déploiement GitHub (Workload Identity Federation, aucune clé). docs/adr/0009.

terraform {
  required_version = ">= 1.9"
  required_providers {
    google = { source = "hashicorp/google", version = "~> 6.0" }
  }
  backend "gcs" {} # bucket et préfixe fournis à l'init (-backend-config)
}

variable "project_id" {
  type = string
}

variable "region" {
  type    = string
  default = "europe-west9"
}

variable "github_repository" {
  description = "Dépôt autorisé à déployer, au format organisation/depot."
  type        = string
}

provider "google" {
  project = var.project_id
  region  = var.region
}

locals {
  services = [
    "aiplatform.googleapis.com",
    "artifactregistry.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "logging.googleapis.com",
    "monitoring.googleapis.com",
    "run.googleapis.com",
    "secretmanager.googleapis.com",
    "sqladmin.googleapis.com",
    "sts.googleapis.com",
  ]
}

resource "google_project_service" "apis" {
  for_each           = toset(local.services)
  service            = each.value
  disable_on_destroy = false
}

# Registre d'images, à Paris. Les 30 dernières versions sont conservées : le
# retour arrière réutilise une image existante, sans reconstruction.
resource "google_artifact_registry_repository" "images" {
  repository_id = "attesta"
  location      = var.region
  format        = "DOCKER"

  cleanup_policies {
    id     = "garder-les-recentes"
    action = "KEEP"
    most_recent_versions {
      keep_count = 30
    }
  }
  cleanup_policies {
    id     = "supprimer-les-anciennes"
    action = "DELETE"
    condition {
      older_than = "7776000s" # 90 jours
    }
  }
  depends_on = [google_project_service.apis]
}

# Compte utilisé par GitHub Actions pour publier les images et déployer.
resource "google_service_account" "deployer" {
  account_id   = "attesta-deployer"
  display_name = "Attesta : déploiement depuis GitHub Actions"
}

resource "google_project_iam_member" "deployer" {
  for_each = toset([
    "roles/run.admin",
    "roles/artifactregistry.writer",
  ])
  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.deployer.email}"
}

resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "github"
  display_name              = "GitHub Actions"
  depends_on                = [google_project_service.apis]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-oidc"
  display_name                       = "GitHub OIDC"
  # Seul ce dépôt peut obtenir une identité Google.
  attribute_condition = "assertion.repository == \"${var.github_repository}\""
  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
    "attribute.ref"        = "assertion.ref"
  }
  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account_iam_member" "github_impersonation" {
  service_account_id = google_service_account.deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repository}"
}

output "registry" {
  value = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.images.repository_id}"
}

output "deployer_service_account" {
  value = google_service_account.deployer.email
}

output "workload_identity_provider" {
  value = google_iam_workload_identity_pool_provider.github.name
}
