variable "project_id" {
  type = string
}

variable "region" {
  type    = string
  default = "europe-west9"
}

variable "environment" {
  type = string
  validation {
    condition     = contains(["preprod", "prod"], var.environment)
    error_message = "environment : preprod ou prod."
  }
}

variable "deployer_service_account" {
  description = "Sortie deployer_service_account de la configuration shared."
  type        = string
}

variable "bootstrap_image" {
  description = "Image de la toute première révision ; les suivantes sont posées par infra/deploy/deploy.sh."
  type        = string
}

variable "db_tier" {
  type = string
}

variable "min_instances" {
  type = number
}

variable "max_instances" {
  type = number
}

variable "llm_model" {
  type    = string
  default = "claude-opus-5-5"
}

variable "llm_max_cost_usd_per_cv" {
  type    = number
  default = 0.3
}

variable "llm_daily_quota" {
  type    = number
  default = 10
}

variable "chromium_no_sandbox" {
  description = "À n'activer que si le test de fumée montre que la sandbox ne démarre pas sur Cloud Run (docs/adr/0009)."
  type        = bool
  default     = false
}

variable "alert_email" {
  type = string
}

output "url" {
  value = google_cloud_run_v2_service.web.uri
}

output "sql_connection_name" {
  value = google_sql_database_instance.main.connection_name
}
