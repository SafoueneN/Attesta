#!/usr/bin/env bash
# Déploiement progressif d'Attesta sur Cloud Run (docs/runbook.md, « Déployer »).
#
#   infra/deploy/deploy.sh <service> <image@sha256:...> "<paliers>"
#   ex. préprod : deploy.sh attesta-preprod europe-west9-docker.pkg.dev/.../web@sha256:... "100"
#       prod    : deploy.sh attesta-prod    ...                                         "10 50 100"
#
# 1. migrations (Cloud Run Job, même image) ; elles doivent rester compatibles avec
#    la révision précédente (ajouts seulement), sinon le retour arrière casse ;
# 2. nouvelle révision sans trafic, étiquetée « candidat » ;
# 3. test de fumée sur l'URL du candidat : en cas d'échec, aucun trafic n'a bougé ;
# 4. bascule par paliers, test de fumée après chacun ; échec : retour immédiat
#    de 100 % du trafic à la révision précédente.
set -euo pipefail

SERVICE=${1:?service Cloud Run requis}
IMAGE=${2:?image (avec digest) requise}
STEPS=${3:-100}
REGION=${REGION:-europe-west9}
MIGRATION_JOB=${MIGRATION_JOB:-${SERVICE}-migrate}
SMOKE_CMD=${SMOKE_CMD:-node scripts/smoke.mjs}
STEP_PAUSE_SECONDS=${STEP_PAUSE_SECONDS:-300}

log() { printf '[déploiement %s] %s\n' "$SERVICE" "$*"; }

service_json() { gcloud run services describe "$SERVICE" --region "$REGION" --format=json; }

# Révision qui reçoit le trafic avant ce déploiement (vide au premier déploiement).
previous=$(service_json | node -e '
  let raw = ""; process.stdin.on("data", (d) => (raw += d)).on("end", () => {
    const traffic = JSON.parse(raw || "{}").status?.traffic ?? [];
    const serving = traffic.filter((t) => (t.percent ?? 0) > 0).sort((a, b) => b.percent - a.percent);
    process.stdout.write(serving[0]?.revisionName ?? "");
  });')
log "révision actuelle : ${previous:-aucune}"

rollback() {
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

candidate_url=$(service_json | node -e '
  let raw = ""; process.stdin.on("data", (d) => (raw += d)).on("end", () => {
    const tagged = (JSON.parse(raw).status?.traffic ?? []).find((t) => t.tag === "candidat");
    process.stdout.write(tagged?.url ?? "");
  });')
[[ -n "$candidate_url" ]] || { log "URL du candidat introuvable"; exit 1; }

log "test de fumée du candidat : $candidate_url"
if ! $SMOKE_CMD "$candidate_url"; then
  log "ÉCHEC du test de fumée : le trafic reste sur ${previous:-aucune révision}"
  exit 1
fi

service_url=$(service_json | node -e '
  let raw = ""; process.stdin.on("data", (d) => (raw += d)).on("end", () => process.stdout.write(JSON.parse(raw).status?.url ?? ""));')

for percent in $STEPS; do
  log "bascule : ${percent} % vers le candidat"
  gcloud run services update-traffic "$SERVICE" --region "$REGION" --to-tags "candidat=${percent}" --quiet
  if [[ "$percent" != "100" ]]; then
    log "observation pendant ${STEP_PAUSE_SECONDS} s"
    sleep "$STEP_PAUSE_SECONDS"
  fi
  if ! $SMOKE_CMD "$service_url"; then
    log "ÉCHEC du test de fumée à ${percent} %"
    rollback
    exit 1
  fi
done

log "déploiement terminé : 100 % sur la nouvelle révision"
