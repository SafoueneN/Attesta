#!/usr/bin/env bash
# Retour arrière manuel d'Attesta sur Cloud Run : 100 % du trafic vers une révision
# antérieure. Sans révision indiquée : la révision prête la plus récente créée
# AVANT celle qui sert actuellement le plus de trafic (une révision candidate
# refusée, jamais servie, n'est donc pas choisie).
#
#   infra/deploy/rollback.sh <service> [révision]
#
# La base n'est pas restaurée : les migrations étant des ajouts compatibles,
# l'ancienne révision fonctionne sur le schéma courant (docs/runbook.md).
set -euo pipefail

SERVICE=${1:?service Cloud Run requis}
TARGET=${2:-}
REGION=${REGION:-europe-west9}

if [[ -n "$TARGET" && ! "$TARGET" =~ ^[a-z0-9-]{1,63}$ ]]; then
  echo "Nom de révision invalide : $TARGET" >&2
  exit 2
fi

if [[ -z "$TARGET" ]]; then
  serving=$(gcloud run services describe "$SERVICE" --region "$REGION" --format=json | node -e '
    let raw = ""; process.stdin.on("data", (d) => (raw += d)).on("end", () => {
      const traffic = (JSON.parse(raw).status?.traffic ?? []).filter((t) => (t.percent ?? 0) > 0);
      traffic.sort((a, b) => b.percent - a.percent);
      process.stdout.write(traffic[0]?.revisionName ?? "");
    });')
  TARGET=$(gcloud run revisions list --service "$SERVICE" --region "$REGION" --format=json | node -e '
    let raw = ""; process.stdin.on("data", (d) => (raw += d)).on("end", () => {
      const ready = (r) => (r.status?.conditions ?? []).some((c) => c.type === "Ready" && c.status === "True");
      const revisions = JSON.parse(raw).sort((a, b) =>
        b.metadata.creationTimestamp.localeCompare(a.metadata.creationTimestamp));
      const current = revisions.findIndex((r) => r.metadata.name === process.argv[1]);
      const previous = revisions.slice(current + 1).find(ready);
      process.stdout.write(current >= 0 && previous ? previous.metadata.name : "");
    });' "$serving")
fi
[[ -n "$TARGET" ]] || { echo "Aucune révision antérieure prête trouvée pour $SERVICE" >&2; exit 1; }

echo "[retour arrière $SERVICE] 100 % du trafic vers $TARGET"
gcloud run services update-traffic "$SERVICE" --region "$REGION" --to-revisions "${TARGET}=100" --quiet
