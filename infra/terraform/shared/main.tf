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

variable "github_repository_id" {
  description = "Identifiant numérique du dépôt (stable même si le dépôt est renommé ou recréé)."
  type        = string
}

variable "github_owner_id" {
  description = "Identifiant numérique du propriétaire du dépôt."
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

  # Étiquettes immuables : l'image validée en préprod ne peut pas être remplacée.
  docker_config {
    immutable_tags = true
  }

  # Toute image validée en préprod (donc promouvable ou servie en prod) est conservée.
  cleanup_policies {
    id     = "garder-les-validees"
    action = "KEEP"
    condition {
      tag_state    = "TAGGED"
      tag_prefixes = ["preprod-valide-"]
    }
  }
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

resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "github"
  display_name              = "GitHub Actions"
  depends_on                = [google_project_service.apis]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-oidc"
  display_name                       = "GitHub OIDC"
  # Seul ce dépôt (identifiants numériques épinglés) peut obtenir une identité Google.
  attribute_condition = "assertion.repository_id == \"${var.github_repository_id}\" && assertion.repository_owner_id == \"${var.github_owner_id}\""
  # « dépôt:environnement GitHub » : chaque environnement n'obtient que son propre
  # compte de déploiement (infra/terraform/environment). Un job sans environnement
  # GitHub n'obtient aucune identité.
  attribute_mapping = {
    "google.subject"     = "assertion.sub"
    "attribute.repo_env" = "assertion.repository + \":\" + assertion.environment"
  }
  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

output "registry" {
  value = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.images.repository_id}"
}

output "registry_repository" {
  value = google_artifact_registry_repository.images.repository_id
}

output "workload_identity_pool" {
  value = google_iam_workload_identity_pool.github.name
}

output "workload_identity_provider" {
  value = google_iam_workload_identity_pool_provider.github.name
}
