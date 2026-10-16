#!/usr/bin/env bash
# Retour arrière manuel d'Attesta sur Cloud Run : 100 % du trafic vers une révision
# antérieure. Sans révision indiquée, la plus récente avant la révision actuelle.
#
#   infra/deploy/rollback.sh <service> [révision]
#
# La base n'est pas restaurée : les migrations étant des ajouts compatibles,
# l'ancienne révision fonctionne sur le schéma courant (docs/runbook.md).
set -euo pipefail

SERVICE=${1:?service Cloud Run requis}
TARGET=${2:-}
REGION=${REGION:-europe-west9}

if [[ -z "$TARGET" ]]; then
  TARGET=$(gcloud run revisions list --service "$SERVICE" --region "$REGION" \
    --sort-by='~metadata.creationTimestamp' --format='value(metadata.name)' --limit 2 | sed -n '2p')
fi
[[ -n "$TARGET" ]] || { echo "Aucune révision antérieure trouvée pour $SERVICE" >&2; exit 1; }

echo "[retour arrière $SERVICE] 100 % du trafic vers $TARGET"
gcloud run services update-traffic "$SERVICE" --region "$REGION" --to-revisions "${TARGET}=100" --quiet
