# Surveillance : disponibilité, erreurs, dégradation de l'IA, fidélité et coût.
# Les métriques métier sont tirées des journaux structurés (événements sans PII :
# event=generation, llm_usage, pdf_export ; docs/runbook.md).

resource "google_monitoring_notification_channel" "email" {
  display_name = "Astreinte Attesta ${var.environment}"
  type         = "email"
  labels = {
    email_address = var.alert_email
  }
}

resource "google_monitoring_uptime_check_config" "health" {
  display_name = "${local.name} /health"
  timeout      = "10s"
  period       = "60s"

  http_check {
    path         = "/health"
    port         = 443
    use_ssl      = true
    validate_ssl = true
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = trimprefix(google_cloud_run_v2_service.web.uri, "https://")
    }
  }
}

resource "google_monitoring_alert_policy" "uptime" {
  display_name = "${local.name} : service injoignable"
  combiner     = "OR"
  conditions {
    display_name = "Échec du contrôle /health"
    condition_threshold {
      filter          = "metric.type=\"monitoring.googleapis.com/uptime_check/check_passed\" AND resource.type=\"uptime_url\" AND metric.label.check_id=\"${google_monitoring_uptime_check_config.health.uptime_check_id}\""
      comparison      = "COMPARISON_LT"
      threshold_value = 1
      duration        = "300s"
      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_NEXT_OLDER"
        cross_series_reducer = "REDUCE_COUNT_FALSE"
      }
      trigger {
        count = 1
      }
    }
  }
  notification_channels = [google_monitoring_notification_channel.email.id]
}

resource "google_monitoring_alert_policy" "errors_5xx" {
  display_name = "${local.name} : erreurs serveur"
  combiner     = "OR"
  conditions {
    display_name = "Plus de 5 réponses 5xx en 5 minutes"
    condition_threshold {
      filter          = "metric.type=\"run.googleapis.com/request_count\" AND resource.type=\"cloud_run_revision\" AND resource.label.service_name=\"${local.name}\" AND metric.label.response_code_class=\"5xx\""
      comparison      = "COMPARISON_GT"
      threshold_value = 5
      duration        = "0s"
      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_SUM"
        cross_series_reducer = "REDUCE_SUM"
      }
    }
  }
  notification_channels = [google_monitoring_notification_channel.email.id]
}

locals {
  generation_filter = "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${local.name}\" AND jsonPayload.event=\"generation\""
}

resource "google_logging_metric" "generation" {
  name   = "${local.name}/generations"
  filter = local.generation_filter
  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    labels {
      key        = "status"
      value_type = "STRING"
    }
    labels {
      key        = "reason"
      value_type = "STRING"
    }
  }
  label_extractors = {
    status = "EXTRACT(jsonPayload.status)"
    reason = "EXTRACT(jsonPayload.reason)"
  }
}

resource "google_logging_metric" "faithfulness" {
  name            = "${local.name}/score-fidelite"
  filter          = "${local.generation_filter} AND jsonPayload.status=\"ok\""
  value_extractor = "EXTRACT(jsonPayload.score)"
  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "DISTRIBUTION"
  }
  bucket_options {
    linear_buckets {
      num_finite_buckets = 10
      width              = 0.1
      offset             = 0
    }
  }
}

resource "google_logging_metric" "cost_per_cv" {
  name            = "${local.name}/cout-par-cv"
  filter          = local.generation_filter
  value_extractor = "EXTRACT(jsonPayload.costUsd)"
  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "DISTRIBUTION"
    unit        = "USD"
  }
  bucket_options {
    explicit_buckets {
      bounds = [0.02, 0.05, 0.1, 0.15, 0.2, 0.3, 0.5]
    }
  }
}

resource "google_logging_metric" "generation_duration" {
  name            = "${local.name}/duree-generation"
  filter          = local.generation_filter
  value_extractor = "EXTRACT(jsonPayload.durationMs)"
  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "DISTRIBUTION"
    unit        = "ms"
  }
  bucket_options {
    exponential_buckets {
      num_finite_buckets = 12
      growth_factor      = 2
      scale              = 500
    }
  }
}

resource "google_monitoring_alert_policy" "degraded" {
  display_name = "${local.name} : IA en mode dégradé"
  combiner     = "OR"
  conditions {
    display_name = "Plus de 5 générations dégradées en 15 minutes"
    condition_threshold {
      filter          = "metric.type=\"logging.googleapis.com/user/${google_logging_metric.generation.name}\" AND resource.type=\"cloud_run_revision\" AND metric.label.status=\"degraded\""
      comparison      = "COMPARISON_GT"
      threshold_value = 5
      duration        = "0s"
      aggregations {
        alignment_period     = "900s"
        per_series_aligner   = "ALIGN_SUM"
        cross_series_reducer = "REDUCE_SUM"
      }
    }
  }
  documentation {
    content   = "Voir docs/runbook.md, « Bandeau : la reformulation par IA est indisponible » : journaux event=generation, champ reason."
    mime_type = "text/markdown"
  }
  notification_channels = [google_monitoring_notification_channel.email.id]
}
