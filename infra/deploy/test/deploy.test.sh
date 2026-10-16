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

# Faux gcloud : journalise ses arguments, renvoie un service avec la révision
# « attesta-00041 » à 100 % et une révision candidate étiquetée.
mkdir -p "$work/bin"
cat > "$work/bin/gcloud" <<'EOF'
#!/usr/bin/env bash
echo "gcloud $*" >> "$CALLS"
case "$*" in
  "run services describe"*)
    echo '{"status":{"url":"https://attesta.example","traffic":[{"revisionName":"attesta-00041","percent":100},{"revisionName":"attesta-00042","percent":0,"tag":"candidat","url":"https://candidat---attesta.example"}]}}' ;;
  "run revisions list"*)
    printf 'attesta-00042\nattesta-00041\n' ;;
esac
EOF
# Faux test de fumée : réussit sauf pour les URL listées dans SMOKE_FAIL.
cat > "$work/bin/smoke" <<'EOF'
#!/usr/bin/env bash
echo "smoke $1" >> "$CALLS"
for url in ${SMOKE_FAIL:-}; do [[ "$1" == "$url" ]] && exit 1; done
exit 0
EOF
chmod +x "$work/bin/gcloud" "$work/bin/smoke"
export PATH="$work/bin:$PATH" SMOKE_CMD=smoke STEP_PAUSE_SECONDS=0

scenario() {
  export CALLS="$work/$1.log"; : > "$CALLS"
}
expect() {
  local description=$1 status=$2 expected_status=$3 pattern=$4 should_match=$5
  local ok=1
  [[ "$status" == "$expected_status" ]] || ok=0
  if [[ "$should_match" == oui ]]; then grep -q -- "$pattern" "$CALLS" || ok=0; else ! grep -q -- "$pattern" "$CALLS" || ok=0; fi
  if [[ $ok == 1 ]]; then echo "✓ $description"; else echo "✗ $description (code $status)"; cat "$CALLS"; failures=$((failures + 1)); fi
}

scenario candidat-ko
status=0; SMOKE_FAIL="https://candidat---attesta.example" bash "$deploy" attesta img@sha256:1 "100" > /dev/null || status=$?
expect "candidat en échec : aucun trafic déplacé" "$status" 1 "update-traffic" non

scenario preprod-ok
status=0; bash "$deploy" attesta img@sha256:1 "100" > /dev/null || status=$?
expect "préprod : migrations exécutées avant la révision" "$status" 0 "jobs execute attesta-migrate" oui
expect "préprod : bascule à 100 % après le test de fumée" "$status" 0 "to-tags candidat=100" oui
expect "préprod : la nouvelle révision part sans trafic" "$status" 0 "deploy attesta --region europe-west9 --image img@sha256:1 --no-traffic --tag candidat" oui

scenario prod-ko-palier
status=0; SMOKE_FAIL="https://attesta.example" bash "$deploy" attesta img@sha256:1 "10 50 100" > /dev/null || status=$?
expect "prod : échec au palier de 10 %, retour arrière vers la révision précédente" "$status" 1 "to-revisions attesta-00041=100" oui
expect "prod : pas de passage au palier suivant après un échec" "$status" 1 "candidat=50" non

scenario rollback-manuel
status=0; bash "$rollback" attesta > /dev/null || status=$?
expect "retour arrière manuel vers la révision précédente" "$status" 0 "to-revisions attesta-00041=100" oui

scenario rollback-cible
status=0; bash "$rollback" attesta attesta-00030 > /dev/null || status=$?
expect "retour arrière vers une révision choisie" "$status" 0 "to-revisions attesta-00030=100" oui

if [[ $failures -gt 0 ]]; then echo "$failures échec(s)"; exit 1; fi
echo "Scripts de déploiement : tous les scénarios passent"
