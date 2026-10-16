#!/usr/bin/env bash
# Déploiement progressif d'Attesta sur Cloud Run (docs/runbook.md, « Déployer »).
#
#   infra/deploy/deploy.sh <service> <image@sha256:...> "<paliers>"
#   ex. préprod : deploy.sh attesta-preprod europe-west9-docker.pkg.dev/.../web@sha256:... "100"
#       prod    : deploy.sh attesta-prod    ...                                         "10 50 100"
#
# 1. état de départ sain exigé : une seule révision sert 100 % du trafic ;
# 2. migrations (Cloud Run Job, même image), compatibles avec la révision en place ;
# 3. nouvelle révision sans trafic, étiquetée « candidat », testée sur sa propre URL ;
# 4. bascule par paliers ; à chaque palier, test de fumée du candidat et recherche
#    d'erreurs 5xx sur sa révision ; au moindre échec, à une erreur ou à une
#    interruption (annulation du job), 100 % du trafic revient à la révision précédente.
set -euo pipefail

SERVICE=${1:?service Cloud Run requis}
IMAGE=${2:?image (avec digest) requise}
STEPS=${3:-100}
REGION=${REGION:-europe-west9}
MIGRATION_JOB=${MIGRATION_JOB:-${SERVICE}-migrate}
SMOKE_CMD=${SMOKE_CMD:-node scripts/smoke.mjs}
STEP_PAUSE_SECONDS=${STEP_PAUSE_SECONDS:-300}

log() { printf '[déploiement %s] %s\n' "$SERVICE" "$*"; }

# Lecture d'un champ du service (JSON de gcloud) par une expression JavaScript.
service_field() {
  gcloud run services describe "$SERVICE" --region "$REGION" --format=json | node -e '
    let raw = ""; process.stdin.on("data", (d) => (raw += d)).on("end", () => {
      const s = JSON.parse(raw || "{}"); const traffic = s.status?.traffic ?? [];
      process.stdout.write(String(eval(process.argv[1]) ?? ""));
    });' "$1"
}

# État de départ : premier déploiement (aucun trafic) ou une seule révision à 100 %.
serving=$(service_field 'traffic.filter((t) => (t.percent ?? 0) > 0).map((t) => `${t.revisionName}:${t.percent}`).join(" ")')
previous=""
if [[ -n "$serving" ]]; then
  if [[ "$serving" != *":100" || "$serving" == *" "* ]]; then
    log "trafic partagé ($serving) : terminer ou annuler le déploiement précédent (rollback) avant d'en lancer un autre"
    exit 1
  fi
  previous=${serving%%:*}
fi
log "révision actuelle : ${previous:-aucune}"

rollback() {
  trap - ERR INT TERM
  if [[ -n "$previous" ]]; then
    log "RETOUR ARRIÈRE : 100 % du trafic vers $previous"
    gcloud run services update-traffic "$SERVICE" --region "$REGION" --to-revisions "${previous}=100" --quiet
  fi
}

log "migrations"
gcloud run jobs update "$MIGRATION_JOB" --region "$REGION" --image "$IMAGE" --quiet
gcloud run jobs execute "$MIGRATION_JOB" --region "$REGION" --wait --quiet

log "nouvelle révision sans trafic"
gcloud run deploy "$SERVICE" --region "$REGION" --image "$IMAGE" --no-traffic --tag candidat --quiet

candidate_url=$(service_field 'traffic.find((t) => t.tag === "candidat")?.url')
candidate=$(service_field 'traffic.find((t) => t.tag === "candidat")?.revisionName')
[[ -n "$candidate_url" && -n "$candidate" ]] || { log "révision candidate introuvable"; exit 1; }

log "test de fumée du candidat $candidate : $candidate_url"
if ! $SMOKE_CMD "$candidate_url"; then
  log "ÉCHEC du test de fumée : le trafic reste sur ${previous:-aucune révision}"
  exit 1
fi

# Erreurs 5xx servies par la révision candidate depuis $1 secondes.
candidate_errors() {
  gcloud logging read \
    "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"$SERVICE\" AND resource.labels.revision_name=\"$candidate\" AND httpRequest.status>=500" \
    --freshness="${1}s" --limit=1 --format='value(timestamp)'
}

# À partir d'ici, toute erreur ou interruption ramène le trafic à la révision précédente.
trap 'log "interruption ou erreur pendant la bascule"; rollback; exit 1' ERR INT TERM

for percent in $STEPS; do
  log "bascule : ${percent} % vers $candidate"
  gcloud run services update-traffic "$SERVICE" --region "$REGION" --to-revisions "${candidate}=${percent}" --quiet
  window=60
  if [[ "$percent" != "100" ]]; then
    log "observation pendant ${STEP_PAUSE_SECONDS} s"
    sleep "$STEP_PAUSE_SECONDS"
    window=$((STEP_PAUSE_SECONDS + 60))
  fi
  if ! $SMOKE_CMD "$candidate_url"; then
    log "ÉCHEC du test de fumée du candidat à ${percent} %"
    rollback
    exit 1
  fi
  if [[ -n "$(candidate_errors "$window")" ]]; then
    log "ERREURS 5xx sur $candidate à ${percent} %"
    rollback
    exit 1
  fi
done

trap - ERR INT TERM
log "déploiement terminé : 100 % sur $candidate"
