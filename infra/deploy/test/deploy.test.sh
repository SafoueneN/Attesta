#!/usr/bin/env bash
# Tests des scripts de déploiement et de retour arrière, sans cloud : `gcloud` et
# le test de fumée sont simulés, chaque appel est journalisé puis vérifié.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
deploy="$here/../deploy.sh"
rollback="$here/../rollback.sh"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
failures=0

# Faux gcloud. Variables de scénario :
#   TRAFFIC      JSON du trafic du service (défaut : 00041 à 100 %, candidat 00042 à 0 %)
#   ERRORS_5XX   non vide : la révision candidate a servi des 5xx
#   FAIL_AT      pourcentage auquel la bascule de trafic échoue (erreur gcloud)
mkdir -p "$work/bin"
cat > "$work/bin/gcloud" <<'EOF'
#!/usr/bin/env bash
echo "gcloud $*" >> "$CALLS"
default='[{"revisionName":"attesta-00041","percent":100},{"revisionName":"attesta-00042","percent":0,"tag":"candidat","url":"https://candidat---attesta.example"}]'
case "$*" in
  "run services describe"*)
    echo "{\"status\":{\"url\":\"https://attesta.example\",\"traffic\":${TRAFFIC:-$default}}}" ;;
  "run revisions list"*)
    # 00043 : candidat refusé, jamais servi ; 00041 sert ; 00040 est la précédente prête.
    cat <<JSON
[{"metadata":{"name":"attesta-00043","creationTimestamp":"2026-10-16T12:00:00Z"},"status":{"conditions":[{"type":"Ready","status":"True"}]}},
 {"metadata":{"name":"attesta-00041","creationTimestamp":"2026-10-15T12:00:00Z"},"status":{"conditions":[{"type":"Ready","status":"True"}]}},
 {"metadata":{"name":"attesta-00039","creationTimestamp":"2026-10-14T12:00:00Z"},"status":{"conditions":[{"type":"Ready","status":"False"}]}},
 {"metadata":{"name":"attesta-00040","creationTimestamp":"2026-10-13T12:00:00Z"},"status":{"conditions":[{"type":"Ready","status":"True"}]}}]
JSON
    ;;
  "run revisions describe"*)
    echo "img@sha256:ancienne" ;;
  "logging read"*)
    [[ -n "${ERRORS_5XX:-}" ]] && echo "2026-10-16T12:00:00Z" ;;
  "run services update-traffic"*)
    if [[ -n "${FAIL_AT:-}" && "$*" == *"attesta-00042=${FAIL_AT} "* ]]; then exit 1; fi ;;
esac
exit 0
EOF
# Faux test de fumée : échoue pour les URL de SMOKE_FAIL, ou après SMOKE_PASSES succès.
cat > "$work/bin/smoke" <<'EOF'
#!/usr/bin/env bash
echo "smoke $1" >> "$CALLS"
for url in ${SMOKE_FAIL:-}; do [[ "$1" == "$url" ]] && exit 1; done
if [[ -n "${SMOKE_PASSES:-}" ]]; then
  done=$(grep -c "^smoke " "$CALLS")
  [[ "$done" -gt "$SMOKE_PASSES" ]] && exit 1
fi
exit 0
EOF
chmod +x "$work/bin/gcloud" "$work/bin/smoke"
export PATH="$work/bin:$PATH" SMOKE_CMD=smoke STEP_PAUSE_SECONDS=0

scenario() {
  export CALLS="$work/$1.log"
  : > "$CALLS"
  unset TRAFFIC ERRORS_5XX FAIL_AT SMOKE_FAIL SMOKE_PASSES
}
expect() {
  local description=$1 status=$2 expected_status=$3 pattern=$4 should_match=$5
  local ok=1
  [[ "$status" == "$expected_status" ]] || ok=0
  if [[ "$should_match" == oui ]]; then grep -q -- "$pattern" "$CALLS" || ok=0; else ! grep -q -- "$pattern" "$CALLS" || ok=0; fi
  if [[ $ok == 1 ]]; then echo "✓ $description"; else echo "✗ $description (code $status)"; cat "$CALLS"; failures=$((failures + 1)); fi
}
run() { status=0; "$@" > /dev/null 2>&1 || status=$?; }

scenario candidat-ko
SMOKE_FAIL="https://candidat---attesta.example" run bash "$deploy" attesta img@sha256:1 "100"
expect "candidat en échec : aucun trafic déplacé" "$status" 1 "update-traffic" non
expect "candidat en échec : job de veille inchangé" "$status" 1 "jobs update attesta-veille" non

scenario preprod-ok
run bash "$deploy" attesta img@sha256:1 "100"
expect "préprod : migrations exécutées avant la révision" "$status" 0 "jobs execute attesta-migrate" oui
expect "préprod : la nouvelle révision part sans trafic" "$status" 0 "--no-traffic --tag candidat" oui
expect "préprod : bascule à 100 % sur la révision candidate" "$status" 0 "to-revisions attesta-00042=100" oui
expect "préprod : le job de veille reçoit la nouvelle image" "$status" 0 "jobs update attesta-veille --region europe-west9 --image img@sha256:1" oui

scenario palier-fumee-ko
SMOKE_PASSES=1 run bash "$deploy" attesta img@sha256:1 "10 50 100"
expect "prod : candidat valide seul, puis en échec à 10 % : retour arrière" "$status" 1 "to-revisions attesta-00041=100" oui

scenario palier-5xx
ERRORS_5XX=1 run bash "$deploy" attesta img@sha256:1 "10 50 100"
expect "prod : erreurs 5xx du candidat à 10 %, retour arrière" "$status" 1 "to-revisions attesta-00041=100" oui
expect "prod : pas de palier suivant après un échec" "$status" 1 "attesta-00042=50" non

scenario palier-erreur-gcloud
FAIL_AT=50 run bash "$deploy" attesta img@sha256:1 "10 50 100"
expect "prod : échec de gcloud au palier de 50 %, retour arrière par trap" "$status" 1 "to-revisions attesta-00041=100" oui

scenario trafic-partage
TRAFFIC='[{"revisionName":"attesta-00041","percent":50},{"revisionName":"attesta-00042","percent":50}]' run bash "$deploy" attesta img@sha256:1 "100"
expect "trafic déjà partagé : déploiement refusé avant toute action" "$status" 1 "jobs update" non

scenario premier-deploiement
TRAFFIC='[{"revisionName":"attesta-00042","percent":0,"tag":"candidat","url":"https://candidat---attesta.example"}]' run bash "$deploy" attesta img@sha256:1 "100"
expect "premier déploiement : accepté sans révision précédente" "$status" 0 "to-revisions attesta-00042=100" oui

scenario rollback-manuel
run bash "$rollback" attesta
expect "retour arrière : révision prête précédant celle qui sert (pas le candidat refusé)" "$status" 0 "to-revisions attesta-00040=100" oui
expect "retour arrière : le job de veille reprend l'image de la révision cible" "$status" 0 "jobs update attesta-veille --region europe-west9 --image img@sha256:ancienne" oui

scenario rollback-cible
run bash "$rollback" attesta attesta-00030
expect "retour arrière vers une révision choisie" "$status" 0 "to-revisions attesta-00030=100" oui

scenario rollback-injection
run bash "$rollback" attesta 'x"; touch /tmp/pwned; "'
expect "retour arrière : nom de révision invalide refusé" "$status" 2 "update-traffic" non

if [[ $failures -gt 0 ]]; then echo "$failures échec(s)"; exit 1; fi
echo "Scripts de déploiement : tous les scénarios passent"
